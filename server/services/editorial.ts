import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { pool } from '../db';
import { cheeseDataSchema, cheeseEditorialBatchSchema, editorialSchemas, type EditorialKind, type EditorialEntry, type CheeseData, type VideoData, type PriceData } from '../../shared/editorial';
import type { CheeseEditorialStage } from '../../shared/editorial-stages';

export class EditorialError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type Row = {
  id: string; kind: EditorialKind; data: EditorialEntry['data']; revision: number;
  moderation: EditorialEntry['moderation']; moderation_note: string;
  created_by: string; updated_by: string; created_at: Date; updated_at: Date;
  published_at?: Date | null; published_revision?: number | null;
};
export function entry(row: Row): EditorialEntry {
  return { id: row.id, kind: row.kind, data: row.data, revision: row.revision,
    moderation: row.moderation, moderationNote: row.moderation_note,
    createdBy: row.created_by, updatedBy: row.updated_by,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    publication: row.published_at ? {
      publishedAt: new Date(row.published_at).toISOString(), publishedRevision: row.published_revision!,
    } : null };
}
export async function listEditorial(kind: EditorialKind, offset: number, limit: number, database = pool,
  stage?: CheeseEditorialStage) {
  if (stage && kind !== 'cheese') throw new EditorialError(400, 'Разделы доступны только для сырных статей');
  // One statement keeps count and page on the same snapshot.
  const { rows } = await database.query(`
    WITH eligible AS (
      SELECT e.*,p.published_at,p.published_revision FROM editorial_entries e
      LEFT JOIN editorial_publications p ON p.entry_id=e.id
      WHERE e.kind=$1 AND ($4::text IS NULL
        OR ($4='published' AND p.entry_id IS NOT NULL)
        OR ($4='approved' AND p.entry_id IS NULL AND e.data->>'status'='ready')
        OR ($4='drafts' AND p.entry_id IS NULL AND (e.data->>'status') IS DISTINCT FROM 'ready'))
    )
    SELECT (SELECT count(*)::int FROM eligible) AS total,
      COALESCE(jsonb_agg(page ORDER BY page.updated_at DESC, page.id), '[]'::jsonb) AS items
    FROM (SELECT * FROM eligible ORDER BY updated_at DESC,id LIMIT $2 OFFSET $3) page`,
    [kind, limit, offset, stage ?? null]);
  return { total: rows[0].total, items: rows[0].items.map((r: Row) => entry({
    ...r, created_at: new Date(r.created_at), updated_at: new Date(r.updated_at),
  })) };
}
export async function references(client: pg.PoolClient, kind: EditorialKind, data: any) {
  const checks: [string, string[]][] = kind === 'cheese'
    ? [['video', data.videoIds], ['product', data.productIds]]
    : kind === 'video' ? [['cheese', data.cheeseIds]] : [['cheese', [data.cheeseId]]];
  for (const [target, ids] of checks) {
    if (!ids.length) continue;
    const result = target === 'product'
      ? await client.query('SELECT id FROM products WHERE id = ANY($1::varchar[])', [ids])
      : await client.query('SELECT id FROM editorial_entries WHERE kind=$1 AND id = ANY($2::uuid[])', [target, ids]);
    if (new Set(result.rows.map(r => r.id)).size !== new Set(ids).size)
      throw new EditorialError(400, `Связанный объект (${target}) не найден. Обновите список.`);
  }
}
export async function transaction<T>(database: pg.Pool, work: (client: pg.PoolClient) => Promise<T>) {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    // Serializes cross-record references as well as edits/deletes/moderation.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('editorial_entries_write'))");
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
export async function audit(client: pg.PoolClient, actor: string, action: string, id: string | null, oldData: unknown, newData: unknown) {
  await client.query(`INSERT INTO admin_action_logs
    (admin_user_id,action_type,entity_type,entity_id,action_data)
    VALUES ($1,$2,'editorial',$3,$4::jsonb)`,
    [actor, action, id, JSON.stringify({ oldData, newData })]);
}
export async function saveEditorial(kind: EditorialKind, input: unknown, actor: string,
  edit?: { id: string; revision: number }, database = pool, publish = false) {
  if (!actor) throw new EditorialError(401, 'Требуется авторизация');
  const data = editorialSchemas[kind].parse(input);
  if (publish && (kind !== 'cheese' || (data as CheeseData).status !== 'ready'))
    throw new EditorialError(400, 'Одобрить и опубликовать можно только полностью подготовленную сырную статью.');
  return transaction(database, async client => {
    let previous: Row | undefined;
    if (edit) {
      previous = (await client.query(`SELECT e.*,p.published_at,p.published_revision
        FROM editorial_entries e LEFT JOIN editorial_publications p ON p.entry_id=e.id
        WHERE e.id=$1 FOR UPDATE OF e`, [edit.id])).rows[0];
      if (!previous) throw new EditorialError(404, 'Запись не найдена');
      if (previous.kind !== kind) throw new EditorialError(400, 'Нельзя менять тип записи');
      if (previous.revision !== edit.revision) throw new EditorialError(409, 'Запись изменена другим оператором. Откройте её заново.');
    }
    if (kind === 'cheese') {
      // A checkbox or a crafted CRUD request cannot claim an AI transfer.
      // Keep server evidence even when an older client omits the new field.
      const cheese = data as CheeseData;
      const research = (previous?.data as CheeseData | undefined)?.aiResearch;
      if (research) cheese.aiResearch = research;
      else delete cheese.aiResearch;
    }
    await references(client, kind, data);
    const id = edit?.id ?? randomUUID();
    const moderation = kind === 'price' ? 'pending' : null;
    let saved: Row;
    if (edit) {
      saved = (await client.query(`UPDATE editorial_entries SET data=$2,revision=revision+1,
        moderation=$3,moderation_note='',updated_by=$4,updated_at=now() WHERE id=$1 RETURNING *`,
        [id, JSON.stringify(data), moderation, actor])).rows[0];
    } else {
      saved = (await client.query(`INSERT INTO editorial_entries
        (id,kind,data,moderation,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$5) RETURNING *`,
        [id, kind, JSON.stringify(data), moderation, actor])).rows[0];
    }
    const current = entry({ ...saved, published_at: previous?.published_at, published_revision: previous?.published_revision });
    await audit(client, actor, edit ? 'updated' : 'created', id, previous ? entry(previous) : null, current);
    if (publish) {
      // Save and publish one validated revision atomically. A failure in either
      // audit or publication must leave both the draft and live snapshot intact.
      await client.query(`INSERT INTO editorial_publications
        (entry_id,kind,data,published_revision,published_by) VALUES($1,'cheese',$2,$3,$4)
        ON CONFLICT(entry_id) DO UPDATE SET data=excluded.data,
          published_revision=excluded.published_revision,published_by=excluded.published_by,published_at=now()`,
        [id, JSON.stringify(saved.data), saved.revision + 1, actor]);
      await client.query(`UPDATE editorial_entries SET revision=revision+1,updated_by=$2,updated_at=now() WHERE id=$1`, [id, actor]);
      const published = entry((await client.query(`SELECT e.*,p.published_at,p.published_revision
        FROM editorial_entries e JOIN editorial_publications p ON p.entry_id=e.id WHERE e.id=$1`, [id])).rows[0]);
      await audit(client, actor, 'published', id, current, published);
      return published;
    }
    return current;
  });
}
export async function approveDraftCheeses(input: unknown, actor: string, database = pool) {
  if (!actor) throw new EditorialError(401, 'Требуется авторизация');
  const { entries } = cheeseEditorialBatchSchema.parse(input);
  return transaction(database, async client => {
    for (const { id, revision } of entries) {
      const previous: Row | undefined = (await client.query(`SELECT e.*,p.published_at,p.published_revision
        FROM editorial_entries e LEFT JOIN editorial_publications p ON p.entry_id=e.id
        WHERE e.id=$1 FOR UPDATE OF e`, [id])).rows[0];
      if (!previous) throw new EditorialError(404, 'Статья не найдена. Ни одна статья не одобрена.');
      const cheese = previous.data as CheeseData;
      if (previous.kind !== 'cheese' || previous.published_at || previous.revision !== revision ||
        (cheese.status !== 'draft' && cheese.status !== 'pending_review'))
        throw new EditorialError(409, 'Одна из выбранных статей изменилась или уже не находится в подготовке. Ни одна статья не одобрена.');
      const validated = cheeseDataSchema.safeParse({ ...cheese, status: 'ready' });
      if (!validated.success)
        throw new EditorialError(409, `«${cheese.title}» не готова к одобрению: проверьте обязательные поля. Ни одна статья не одобрена.`);
      await references(client, 'cheese', validated.data);
      // Approval changes only the editorial status, not the saved content or a public snapshot.
      const saved: Row = (await client.query(`UPDATE editorial_entries SET
        data=jsonb_set(data,'{status}',to_jsonb('ready'::text)),revision=revision+1,updated_by=$2,updated_at=now()
        WHERE id=$1 RETURNING *`, [id, actor])).rows[0];
      await audit(client, actor, 'approved', id, entry(previous), entry(saved));
    }
    return { approvedCount: entries.length };
  });
}
export async function moderateEditorial(id: string, revision: number, decision: 'approved' | 'rejected',
  note: string, actor: string, database = pool) {
  if (!actor) throw new EditorialError(401, 'Требуется авторизация');
  return transaction(database, async client => {
    const old: Row | undefined = (await client.query('SELECT * FROM editorial_entries WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!old) throw new EditorialError(404, 'Запись не найдена');
    if (old.kind !== 'price') throw new EditorialError(400, 'Модерация доступна только для цен');
    if (old.revision !== revision) throw new EditorialError(409, 'Цена изменена. Откройте её заново.');
    if (old.moderation !== 'pending') throw new EditorialError(409, 'Решение уже принято');
    // Revalidate stored observations before approval, even if inserted outside this API.
    const data = editorialSchemas.price.parse(old.data);
    await references(client, 'price', data);
    const saved: Row = (await client.query(`UPDATE editorial_entries SET moderation=$2,
      moderation_note=$3,revision=revision+1,updated_by=$4,updated_at=now() WHERE id=$1 RETURNING *`,
      [id, decision, note, actor])).rows[0];
    await audit(client, actor, decision, id, entry(old), entry(saved));
    return entry(saved);
  });
}
export async function deleteEditorial(id: string, revision: number, actor: string, database = pool) {
  if (!actor) throw new EditorialError(401, 'Требуется авторизация');
  return transaction(database, async client => {
    const old: Row | undefined = (await client.query('SELECT * FROM editorial_entries WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!old) throw new EditorialError(404, 'Запись не найдена');
    if (old.revision !== revision) throw new EditorialError(409, 'Запись изменена. Откройте её заново.');
    if ((await client.query('SELECT entry_id FROM editorial_publications WHERE entry_id=$1', [id])).rowCount)
      throw new EditorialError(409, 'Сначала снимите материал с публикации.');
    const others: Row[] = (await client.query('SELECT * FROM editorial_entries WHERE id<>$1', [id])).rows;
    const used = others.some(row =>
      (row.kind === 'price' && (row.data as PriceData).cheeseId === id) ||
      (row.kind === 'video' && (row.data as VideoData).cheeseIds.includes(id)) ||
      (row.kind === 'cheese' && (row.data as CheeseData).videoIds.includes(id)));
    if (used) throw new EditorialError(409, 'Сначала удалите связи с этой записью и связанные цены.');
    await client.query('DELETE FROM editorial_entries WHERE id=$1', [id]);
    await audit(client, actor, 'deleted', id, entry(old), null);
  });
}
