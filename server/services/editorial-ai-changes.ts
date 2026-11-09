import { randomUUID } from 'node:crypto';
import { pool } from '../db';
import { cheeseDataSchema, type CheeseData, type EditorialEntry } from '../../shared/editorial';
import {
  applyRequestSchema, importRequestSchema, importPhotoRequestSchema, rankRequestSchema, countryName, researchPhotoSchema,
  type CatalogResult, type DraftRequest, type DraftResult, type ImportResult,
} from '../../shared/editorial-ai';
import { transaction, audit, entry, EditorialError, type Row } from './editorial';
import { catalogMatches, normalizedCheeseName, runDto, type RunRow } from './editorial-ai';
import { validateSourceUrl } from './editorial-ai-sources';

async function lockedRun(client: any, id: string, kind: 'catalog' | 'draft'): Promise<RunRow> {
  const row = (await client.query('SELECT * FROM editorial_ai_runs WHERE id=$1 FOR UPDATE', [id])).rows[0];
  if (!row) throw new EditorialError(404, 'Генерация не найдена');
  if (row.kind !== kind || row.status !== 'ready') throw new EditorialError(409, 'Эта заготовка ещё не готова или не подходит для операции.');
  return row;
}
function researchTransfer(run: RunRow): NonNullable<CheeseData['aiResearch']> {
  return {
    runId: run.id,
    searchedAt: (run.result as DraftResult).research?.searchedAt || new Date(run.created_at).toISOString(),
    transferredAt: new Date().toISOString(),
  };
}
export async function rankAiCatalog(id: string, input: unknown, actor: string, database = pool) {
  if (!actor) throw new EditorialError(401, 'Требуется авторизация');
  const body = rankRequestSchema.parse(input);
  if (new Set(body.ranks.map(rank => rank.id)).size !== body.ranks.length) throw new EditorialError(400, 'Повторяющиеся позиции');
  return transaction(database, async client => {
    const row = await lockedRun(client, id, 'catalog');
    if (row.revision !== body.revision) throw new EditorialError(409, 'Список изменён другим оператором. Откройте его заново.');
    const result = row.result as CatalogResult;
    if (body.ranks.some(rank => !result.items.some(item => item.id === rank.id))) throw new EditorialError(400, 'Позиция не найдена');
    const updated: CatalogResult = { ...result, items: result.items.map(item => ({
      ...item, importance: body.ranks.find(rank => rank.id === item.id)?.importance ?? item.importance,
    })) };
    const saved: RunRow = (await client.query('UPDATE editorial_ai_runs SET result=$2,revision=revision+1 WHERE id=$1 RETURNING *',
      [id, JSON.stringify(updated)])).rows[0];
    await audit(client, actor, 'ai_catalog_ranked', id, { ranks: result.items.map(item => ({ id: item.id, importance: item.importance })) }, body);
    const dto = runDto(saved);
    dto.result = await catalogMatches(updated, client);
    return dto;
  });
}
export async function importAiCatalog(id: string, input: unknown, actor: string, database = pool): Promise<ImportResult> {
  if (!actor) throw new EditorialError(401, 'Требуется авторизация');
  const body = importRequestSchema.parse(input);
  return transaction(database, async client => {
    const row = await lockedRun(client, id, 'catalog');
    if (row.revision !== body.revision) throw new EditorialError(409, 'Порядок списка изменён. Обновите его перед выбором.');
    const result = await catalogMatches(row.result as CatalogResult, client);
    if (body.itemIds.some(itemId => !result.items.some(item => item.id === itemId))) throw new EditorialError(400, 'Позиция не найдена в этом списке');
    const created: EditorialEntry[] = [], skipped: ImportResult['skipped'] = [];
    for (const itemId of body.itemIds) {
      const item = result.items.find(value => value.id === itemId)!;
      const imported = (await client.query(`SELECT e.id,e.data FROM editorial_ai_imports i
        JOIN editorial_entries e ON e.id=i.entry_id WHERE i.run_id=$1 AND i.item_id=$2`, [id, itemId])).rows[0];
      const fresh = await catalogMatches({ items: [item], warnings: [] }, client);
      const existing = imported ? { id: imported.id, title: imported.data.title } : fresh.items[0].matches[0];
      if (existing) { skipped.push({ itemId, entryId: existing.id, title: existing.title }); continue; }
      const data = cheeseDataSchema.parse({
        title: item.titleRu, nameOriginal: item.nameOriginal, country: countryName(item.countryCode), region: item.regions.join(', '),
        // Suggested summaries and subjective importance notes are not treated as verified article content.
        status: 'draft', sortOrder: 100 - item.importance,
      });
      const entryId = randomUUID();
      const saved: Row = (await client.query(`INSERT INTO editorial_entries
        (id,kind,data,created_by,updated_by) VALUES($1,'cheese',$2,$3,$3) RETURNING *`,
        [entryId, JSON.stringify(data), actor])).rows[0];
      await client.query(`INSERT INTO editorial_ai_imports(run_id,item_id,entry_id,name_keys,country_code,created_by)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(run_id,item_id) DO UPDATE SET entry_id=excluded.entry_id,
        name_keys=excluded.name_keys,country_code=excluded.country_code,created_by=excluded.created_by`,
        [id, itemId, entryId, JSON.stringify([normalizedCheeseName(item.nameOriginal), normalizedCheeseName(item.titleRu)]), item.countryCode, actor]);
      const current = entry(saved); created.push(current);
      await audit(client, actor, 'created', entryId, null, current);
    }
    await audit(client, actor, 'ai_catalog_imported', id, null, {
      itemIds: body.itemIds, created: created.map(value => value.id), skipped,
    });
    return { created, skipped };
  });
}
export async function applyAiDraft(id: string, input: unknown, actor: string, database = pool) {
  if (!actor) throw new EditorialError(401, 'Требуется авторизация');
  const body = applyRequestSchema.parse(input);
  const edits = body.edits || {};
  if (Object.keys(edits).some(field => !body.fields.includes(field as typeof body.fields[number])))
    throw new EditorialError(400, 'Редактировать можно только выбранные поля');
  const appliedParams = { fields: [...body.fields].sort(), edits,
    ...(body.photoIds?.length ? { photoIds: [...body.photoIds].sort(), photoRightsConfirmed: true } : {}) };
  return transaction(database, async client => {
    const run = await lockedRun(client, id, 'draft');
    const params = run.params as DraftRequest;
    if (params.entryId !== body.entryId) throw new EditorialError(400, 'Заготовка относится к другой статье');
    const old: Row | undefined = (await client.query(`SELECT e.*,p.published_at,p.published_revision FROM editorial_entries e
      LEFT JOIN editorial_publications p ON p.entry_id=e.id WHERE e.id=$1 FOR UPDATE OF e`, [body.entryId])).rows[0];
    if (!old || old.kind !== 'cheese') throw new EditorialError(404, 'Сырная статья не найдена');
    if (run.applied_entry_id) {
      const same = (await client.query('SELECT applied_params=$2::jsonb AS same FROM editorial_ai_runs WHERE id=$1',
        [id, JSON.stringify(appliedParams)])).rows[0].same;
      if (old.revision === run.applied_revision && body.revision === params.revision && same) return entry(old);
      throw new EditorialError(409, 'Заготовка уже применена. Для нового изменения создайте новую заготовку.');
    }
    if (params.revision !== body.revision || old.revision !== body.revision)
      throw new EditorialError(409, 'Статья изменилась после генерации. Сначала сохраните свои изменения и подготовьте новую заготовку.');
    const proposal = run.result as DraftResult;
    const selectedPhotos = (body.photoIds || []).map(photoId => {
      const found = researchPhotoSchema.safeParse(proposal.research?.photos?.find(photo => photo.id === photoId));
      if (!found.success || !proposal.sources.some(source => source.finalUrl === found.data.sourceUrl))
        throw new EditorialError(400, 'Фотография отсутствует среди сохранённых предложений этой заготовки.');
      // Only IDs from the saved run are accepted. Client-supplied image URLs are forbidden.
      validateSourceUrl(found.data.imageUrl); validateSourceUrl(found.data.sourceUrl);
      return found.data;
    });
    const data = { ...(old.data as CheeseData) };
    for (const field of body.fields) {
      const value = proposal.fields[field];
      if (!value?.trim()) throw new EditorialError(400, 'Выбрано поле, которого нет в предложении AI');
      if (edits[field] !== undefined && !edits[field]!.trim()) throw new EditorialError(400, 'Отредактированное поле не может быть пустым');
      data[field] = edits[field] ?? value;
    }
    const sourceUrls = proposal.citations.filter(citation => body.fields.includes(citation.field))
      .map(citation => proposal.sources[citation.sourceIndex].url);
    data.sources = Array.from(new Set([...data.sources, ...sourceUrls, ...selectedPhotos.map(photo => photo.sourceUrl)]));
    data.photos = Array.from(new Set([...data.photos, ...selectedPhotos.map(photo => photo.imageUrl)]));
    if (data.photos.length > 12)
      throw new EditorialError(400, 'В статье может быть не более 12 фотографий. Сначала удалите лишние изображения.');
    data.status = 'pending_review';
    data.aiResearch = researchTransfer(run);
    const parsed = cheeseDataSchema.parse(data);
    const saved: Row = (await client.query(`UPDATE editorial_entries SET data=$2,revision=revision+1,
      updated_by=$3,updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,
      [old.id, JSON.stringify(parsed), actor])).rows[0];
    await client.query(`UPDATE editorial_ai_runs SET applied_entry_id=$2,applied_revision=$3,applied_params=$4,revision=revision+1 WHERE id=$1`,
      [id, old.id, saved.revision, JSON.stringify(appliedParams)]);
    const current = entry({ ...saved, published_at: old.published_at, published_revision: old.published_revision });
    await audit(client, actor, 'ai_applied', old.id, entry(old), {
      ...current, aiRunId: id, appliedFields: body.fields, operatorEdits: edits,
      ...(selectedPhotos.length ? { selectedPhotos, photoRightsConfirmed: true } : {}),
    });
    return current;
  });
}

// Photo review is independent of the one-time text proposal application.
// Candidates remain tied to the saved same-entry run, while writes use the
// current article revision so later edits or geographic choices are preserved.
export async function importAiPhotos(id: string, input: unknown, actor: string, database = pool) {
  if (!actor) throw new EditorialError(401, 'Требуется авторизация');
  const body = importPhotoRequestSchema.parse(input);
  return transaction(database, async client => {
    const run = await lockedRun(client, id, 'draft');
    if ((run.params as DraftRequest).entryId !== body.entryId)
      throw new EditorialError(400, 'Фотографии относятся к другой статье');
    const old: Row | undefined = (await client.query(`SELECT e.*,p.published_at,p.published_revision FROM editorial_entries e
      LEFT JOIN editorial_publications p ON p.entry_id=e.id WHERE e.id=$1 FOR UPDATE OF e`, [body.entryId])).rows[0];
    if (!old || old.kind !== 'cheese') throw new EditorialError(404, 'Сырная статья не найдена');
    if (old.revision !== body.revision)
      throw new EditorialError(409, 'Статья изменилась. Обновите её перед импортом фотографий.');
    const proposal = run.result as DraftResult;
    const selectedPhotos = body.photoIds.map(photoId => {
      const found = researchPhotoSchema.safeParse(proposal.research?.photos?.find(photo => photo.id === photoId));
      if (!found.success || !proposal.sources.some(source => source.finalUrl === found.data.sourceUrl))
        throw new EditorialError(400, 'Фотография отсутствует среди сохранённых предложений этой заготовки.');
      validateSourceUrl(found.data.imageUrl);
      validateSourceUrl(found.data.sourceUrl);
      return found.data;
    });
    const data = { ...(old.data as CheeseData) };
    const photos = Array.from(new Set([...data.photos, ...selectedPhotos.map(photo => photo.imageUrl)]));
    const sources = Array.from(new Set([...data.sources, ...selectedPhotos.map(photo => photo.sourceUrl)]));
    if (photos.length > 12) throw new EditorialError(400, 'В статье может быть не более 12 фотографий.');
    if (photos.length === data.photos.length && sources.length === data.sources.length) return entry(old);
    const parsed = cheeseDataSchema.parse({
      ...data, photos, sources, status: 'pending_review', aiResearch: researchTransfer(run),
    });
    const saved: Row = (await client.query(`UPDATE editorial_entries SET data=$2,revision=revision+1,
      updated_by=$3,updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,
    [old.id, JSON.stringify(parsed), actor])).rows[0];
    const current = entry({ ...saved, published_at: old.published_at, published_revision: old.published_revision });
    await audit(client, actor, 'ai_photos_imported', old.id, entry(old), {
      ...current, aiRunId: id, selectedPhotos, photoRightsConfirmed: true,
    });
    return current;
  });
}
