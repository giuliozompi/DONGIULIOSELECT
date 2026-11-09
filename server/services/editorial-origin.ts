import { randomUUID, createHash } from 'node:crypto';
import { pool } from '../db';
import { cheeseDataSchema, type CheeseData } from '../../shared/editorial';
import {
  originLookupRequestSchema, originApplyRequestSchema, originLookupSchema, type OriginLookup,
} from '../../shared/editorial-ai';
import { transaction, audit, entry, EditorialError, type Row } from './editorial';
import { originProviderSettings, originCountryCode, fetchOriginCandidates } from './editorial-origin-provider';

const attribution = '© OpenStreetMap contributors' as const;
export async function lookupEditorialOrigin(input: unknown, actor: string, database = pool,
  provider: typeof fetchOriginCandidates = fetchOriginCandidates, env = process.env): Promise<OriginLookup> {
  if (!actor) throw new EditorialError(401, 'Требуется авторизация');
  const body = originLookupRequestSchema.parse(input);
  const endpoint = originProviderSettings(env);
  const lookupId = randomUUID();
  const reservation = await transaction(database, async client => {
    const cheese = (await client.query("SELECT data,revision FROM editorial_entries WHERE id=$1 AND kind='cheese'", [body.entryId])).rows[0];
    if (!cheese) throw new EditorialError(404, 'Сырная статья не найдена');
    if (cheese.revision !== body.revision) throw new EditorialError(409, 'Статья изменилась. Обновите её перед поиском.');
    const country = cheeseDataSchema.parse(cheese.data).country;
    const code = originCountryCode(country);
    const query = `${body.place.replace(/\s+/g, ' ').trim()}, ${country}`.slice(0, 400);
    const cacheKey = createHash('sha256').update(JSON.stringify([endpoint.href, query.toLocaleLowerCase(), code])).digest('hex');
    const cached = (await client.query(`SELECT action_data->'newData'->'result' AS result
      FROM admin_action_logs WHERE action_type='origin_lookup_ready' AND entity_type='editorial'
      AND action_data->'newData'->>'cacheKey'=$1
      AND (action_data->'newData'->>'fetchedAt')::numeric >
        extract(epoch FROM clock_timestamp())*1000-2592000000
      ORDER BY (action_data->'newData'->>'fetchedAt')::numeric DESC LIMIT 1`, [cacheKey])).rows[0];
    const parsed = originLookupSchema.safeParse(cached?.result);
    if (parsed.success) {
      const result: OriginLookup = { ...parsed.data, lookupId, entryId: body.entryId, revision: body.revision, cached: true };
      await audit(client, actor, 'origin_lookup_ready', body.entryId, null,
        { lookupId, cacheKey, fetchedAt: Date.parse(result.retrievedAt), result });
      return { cached: result, query, code, cacheKey };
    }
    // The existing editorial transaction lock serializes these reservations
    // across replicas. Persist BEFORE calling the provider, including failures.
    // 15 seconds between fresh requests is deliberately stricter than 1/sec.
    if ((await client.query(`SELECT id FROM admin_action_logs
      WHERE action_type='origin_lookup_requested' AND entity_type='editorial'
      AND (action_data->'newData'->>'requestedAt')::numeric >
        extract(epoch FROM clock_timestamp())*1000-15000 LIMIT 1`)).rowCount)
      throw new EditorialError(429, 'Новый географический поиск доступен через 15 секунд после предыдущего. Сохранённые результаты доступны без нового запроса.');
    await audit(client, actor, 'origin_lookup_requested', body.entryId, null,
      { lookupId, cacheKey, query, revision: body.revision, requestedAt: Date.now() });
    return { query, code, cacheKey };
  });
  if (reservation.cached) return reservation.cached;
  try {
    const candidates = await provider(reservation.query, reservation.code, endpoint);
    const result = originLookupSchema.parse({
      lookupId, entryId: body.entryId, revision: body.revision, query: reservation.query, candidates,
      retrievedAt: new Date().toISOString(), cached: false, attribution,
    });
    await transaction(database, async client => {
      const row = (await client.query('SELECT revision FROM editorial_entries WHERE id=$1', [body.entryId])).rows[0];
      if (!row || row.revision !== body.revision) throw new EditorialError(409, 'Статья изменилась во время поиска. Обновите её.');
      await audit(client, actor, 'origin_lookup_ready', body.entryId, null,
        { lookupId, cacheKey: reservation.cacheKey, fetchedAt: Date.parse(result.retrievedAt), result });
    });
    return result;
  } catch (error) {
    const safe = error instanceof EditorialError ? error
      : new EditorialError(503, 'Географический поиск не завершён. Статья не изменена.');
    await transaction(database, client => audit(client, actor, 'origin_lookup_failed', body.entryId, null,
      { lookupId, error: safe.message }));
    throw safe;
  }
}
export async function applyEditorialOrigin(input: unknown, actor: string, database = pool) {
  if (!actor) throw new EditorialError(401, 'Требуется авторизация');
  const body = originApplyRequestSchema.parse(input);
  return transaction(database, async client => {
    const old: Row | undefined = (await client.query(`SELECT e.*,p.published_at,p.published_revision
      FROM editorial_entries e LEFT JOIN editorial_publications p ON p.entry_id=e.id
      WHERE e.id=$1 AND e.kind='cheese' FOR UPDATE OF e`, [body.entryId])).rows[0];
    if (!old) throw new EditorialError(404, 'Сырная статья не найдена');
    if (old.revision !== body.revision) throw new EditorialError(409, 'Статья изменилась. Координаты не применены.');
    const savedLookup = (await client.query(`SELECT action_data->'newData'->'result' AS result
      FROM admin_action_logs WHERE action_type='origin_lookup_ready' AND entity_type='editorial'
      AND entity_id=$1 AND action_data->'newData'->>'lookupId'=$2 LIMIT 1`, [body.entryId, body.lookupId])).rows[0];
    const parsed = originLookupSchema.safeParse(savedLookup?.result);
    if (!parsed.success || parsed.data.entryId !== body.entryId || parsed.data.revision !== body.revision ||
      Date.parse(parsed.data.retrievedAt) < Date.now() - 30 * 86400000)
      throw new EditorialError(409, 'Предложение координат отсутствует или устарело. Выполните поиск заново.');
    const candidate = parsed.data.candidates.find(value => value.id === body.candidateId);
    if (!candidate) throw new EditorialError(400, 'Выберите координаты из сохранённого результата поиска.');
    const data = cheeseDataSchema.parse({
      ...old.data, latitude: candidate.latitude, longitude: candidate.longitude,
      sources: Array.from(new Set([...(old.data as { sources: string[] }).sources, candidate.url])),
      status: (old.data as CheeseData).aiResearch ? 'pending_review' : 'draft',
    });
    const saved: Row = (await client.query(`UPDATE editorial_entries SET data=$2,revision=revision+1,
      updated_by=$3,updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,
      [body.entryId, JSON.stringify(data), actor])).rows[0];
    const current = entry({ ...saved, published_at: old.published_at, published_revision: old.published_revision });
    await audit(client, actor, 'origin_coordinates_applied', body.entryId, entry(old),
      { ...current, lookupId: body.lookupId, candidateId: candidate.id, attribution });
    return current;
  });
}
