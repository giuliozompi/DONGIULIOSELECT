import { pool } from '../db';
import { photoSearchRequestSchema, researchPhotoSchema, type PhotoSearchResult } from '../../shared/editorial-ai';
import { audit, EditorialError, transaction } from './editorial';
import { editorialSourceMatchesCheese, defaultResearchDependencies, type ResearchDependencies } from './editorial-ai-research';
import { validateSourceUrl } from './editorial-ai-sources';
import { EditorialModelError } from './editorial-ai-config';
import { researchPhotos } from './editorial-research-photos';

// One Brave web query per click, with a different intent from the full draft.
const variants = [
  'formaggio fromage сыр foto produttore producer',
  'cheese photographs Wikimedia Commons',
  'cheese wheel cut rind photographs',
  'fromage formaggio photo galerie consorzio',
];

export async function searchEditorialPhotos(input: unknown, actor: string, database = pool,
  deps: ResearchDependencies = defaultResearchDependencies): Promise<PhotoSearchResult> {
  if (!actor) throw new EditorialError(401, 'Требуется авторизация');
  const body = photoSearchRequestSchema.parse(input);
  const excludedUrls = await transaction(database, async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('editorial-photo-search'), hashtext($1))", [actor]);
    const excluded = [...body.excludedUrls];
    if (body.entry) {
      const row = (await client.query("SELECT revision,data->'photos' AS photos FROM editorial_entries WHERE id=$1 AND kind='cheese'", [body.entry.id])).rows[0];
      if (!row) throw new EditorialError(404, 'Сырная статья не найдена.');
      if (row.revision !== body.entry.revision) throw new EditorialError(409, 'Статья изменилась. Откройте её заново перед поиском.');
      if (Array.isArray(row.photos)) excluded.push(...row.photos.filter((url: unknown) => typeof url === 'string'));
      const { rows } = await client.query(`SELECT result->'research'->'photos' AS photos
        FROM editorial_ai_runs WHERE kind='draft' AND status='ready' AND params->>'entryId'=$1
        ORDER BY created_at DESC,id LIMIT 10`, [body.entry.id]);
      for (const saved of rows) if (Array.isArray(saved.photos)) {
        for (const raw of saved.photos.slice(0, 3)) {
          const parsed = researchPhotoSchema.safeParse(raw);
          if (parsed.success) excluded.push(parsed.data.imageUrl);
        }
      }
    }
    const recent = await client.query(`SELECT 1 FROM admin_action_logs WHERE admin_user_id=$1
      AND entity_type='editorial' AND action_type='photo_search_requested'
      AND (action_data->'newData'->>'requestedAt')::numeric > extract(epoch FROM clock_timestamp())*1000-15000
      LIMIT 1`, [actor]);
    if (recent.rowCount) throw new EditorialError(429, 'Подождите 15 секунд между запросами фотографий.');
    await audit(client, actor, 'photo_search_requested', body.entry?.id ?? null, null, { requestedAt: Date.now() });
    return excluded;
  });
  const identity = { title: body.title, nameOriginal: body.nameOriginal, country: body.country, region: body.region };
  const name = (body.nameOriginal || body.title).replace(/\s+/g, ' ').slice(0, 160);
  const query = [name, body.country, body.region.slice(0, 70), variants[body.attempt]].filter(Boolean).join(' ');
  let urls: string[];
  try {
    const hits = await deps.search(query);
    urls = Array.from(new Set(hits.slice(0, 5).flatMap(hit => {
      try {
        const url = validateSourceUrl(hit.url); url.hash = '';
        return [url.href];
      } catch { return []; }
    })));
  } catch (error) {
    throw new EditorialError(503, error instanceof EditorialModelError ? error.message : 'Не удалось выполнить поиск фотографий. Повторите позже.');
  }
  const results = await Promise.allSettled(urls.map(async url => {
    const source = await deps.source(url);
    validateSourceUrl(source.finalUrl);
    return editorialSourceMatchesCheese(source, identity) ? source : null;
  }));
  return {
    photos: researchPhotos(results.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []), excludedUrls),
    unavailablePages: results.filter(result => result.status === 'rejected').length,
  };
}
