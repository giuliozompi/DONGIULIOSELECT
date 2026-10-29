import { pool } from '../db';
import { editorialSchemas } from '../../shared/editorial';
import { transaction, audit, entry, EditorialError, type Row } from './editorial';

export async function changePublication(id: string, revision: number, publish: boolean, actor: string, database = pool) {
  if (!actor) throw new EditorialError(401, 'Требуется авторизация');
  return transaction(database, async client => {
    const old: Row | undefined = (await client.query(`SELECT e.*,p.published_at,p.published_revision
      FROM editorial_entries e LEFT JOIN editorial_publications p ON p.entry_id=e.id
      WHERE e.id=$1 FOR UPDATE OF e`, [id])).rows[0];
    if (!old) throw new EditorialError(404, 'Материал не найден');
    if (old.kind === 'price') throw new EditorialError(400, 'Цены проходят отдельную модерацию');
    if (old.revision !== revision) throw new EditorialError(409, 'Материал изменён. Откройте его заново.');
    if (publish) {
      const data = editorialSchemas[old.kind].parse(old.data);
      if (data.status !== 'ready') throw new EditorialError(409, 'Сначала подготовьте материал и установите статус «Готово».');
      if (old.published_revision === old.revision) return entry(old);
      await client.query(`INSERT INTO editorial_publications
        (entry_id,kind,data,published_revision,published_by)
        VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(entry_id) DO UPDATE SET data=excluded.data,
          published_revision=excluded.published_revision,published_by=excluded.published_by,published_at=now()`,
        [id, old.kind, JSON.stringify(data), revision + 1, actor]);
    } else {
      if (!old.published_at) throw new EditorialError(409, 'Материал уже снят с публикации');
      await client.query('DELETE FROM editorial_publications WHERE entry_id=$1', [id]);
    }
    await client.query('UPDATE editorial_entries SET revision=revision+1,updated_by=$2,updated_at=now() WHERE id=$1', [id, actor]);
    const current: Row = (await client.query(`SELECT e.*,p.published_at,p.published_revision
      FROM editorial_entries e LEFT JOIN editorial_publications p ON p.entry_id=e.id WHERE e.id=$1`, [id])).rows[0];
    await audit(client, actor, publish ? 'published' : 'unpublished', id, entry(old), entry(current));
    return entry(current);
  });
}
