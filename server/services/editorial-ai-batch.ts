import type { PoolClient } from 'pg';
import { pool } from '../db';
import { editorialSourceUrl } from '../../shared/editorial-ai';
import { draftBatchItemStatuses, draftBatchStartSchema, type DraftBatchItemStatus, type DraftBatchOverview, type DraftBatchReview } from '../../shared/editorial-ai-batch';
import { audit, EditorialError, entry, transaction, type Row } from './editorial';
import { defaultAiDependencies, executeAiRun, expireEditorialAiRuns, lockEditorialAiReservations, reserveAiRunInTransaction, runDto, type AiDependencies, type RunRow } from './editorial-ai';
import { getEditorialModelSettings } from './editorial-ai-model';
import { randomUUID } from 'node:crypto';

const PAGE_SIZE = 20;
const preparation = `e.kind='cheese' AND e.data->>'status' IN ('draft','pending_review')
  AND NOT EXISTS (SELECT 1 FROM editorial_publications p WHERE p.entry_id=e.id)`;
const needsDraft = `NOT (e.data->>'status'='pending_review' AND e.data ? 'aiResearch')`;
const matchingReady = `r.kind='draft' AND r.status='ready' AND r.params->>'fullDraft'='true'
  AND r.params->>'entryId'=e.id::text AND r.params->>'revision'=e.revision::text AND r.result IS NOT NULL`;
const reviewable = `i.entry_revision=e.revision AND r.applied_entry_id IS NULL AND ${preparation} AND ${matchingReady}`;
const eligible = `${preparation} AND ${needsDraft}
  AND NOT EXISTS (SELECT 1 FROM editorial_ai_runs r WHERE ${matchingReady})`;
const deadArticle = 'Статья изменена, уже обработана или больше не находится в подготовке.';

export async function batchTablesAvailable(database: Pick<typeof pool, 'query'> = pool) {
  const { rows } = await database.query(`SELECT to_regclass('public.editorial_ai_batches') IS NOT NULL
    AND to_regclass('public.editorial_ai_batch_items') IS NOT NULL AS available`);
  return rows[0].available as boolean;
}
async function requireBatchTables(database: Pick<typeof pool, 'query'>) {
  if (!await batchTablesAvailable(database)) throw new EditorialError(503, 'Фоновая подготовка недоступна: администратор ещё не установил схему очереди.');
}
async function lockBatch(client: PoolClient) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('editorial-ai-batches'))");
}

export async function getDraftBatchOverview(page: number, database = pool, batchId?: string): Promise<DraftBatchOverview> {
  await requireBatchTables(database);
  const { rows } = await database.query(`
    WITH latest AS (
      SELECT id,finished_at,stopped_at FROM editorial_ai_batches WHERE $3::uuid IS NULL OR id=$3
      ORDER BY (finished_at IS NULL) DESC,created_at DESC,id LIMIT 1
    ), recent AS (
      SELECT id,created_at AS "createdAt" FROM editorial_ai_batches ORDER BY created_at DESC,id LIMIT 20
    ), batch_items AS (
      SELECT i.entry_id AS "entryId",i.title,i.status,i.detail,
        (i.status<>'ready' OR EXISTS (
          SELECT 1 FROM editorial_entries e JOIN editorial_ai_runs r ON r.id=i.run_id
          WHERE e.id=i.entry_id AND ${reviewable}
        )) AS visible
      FROM editorial_ai_batch_items i JOIN latest b ON b.id=i.batch_id
    ), counts AS (
      SELECT status,count(*)::int AS n FROM batch_items WHERE visible GROUP BY status
    ), batch_page AS (
      SELECT "entryId",title,status,detail FROM batch_items WHERE visible
      ORDER BY title,"entryId" LIMIT $1 OFFSET $2
    )
    SELECT (SELECT count(*)::int FROM editorial_entries e WHERE ${eligible}) AS eligible_count,
      EXISTS(SELECT 1 FROM editorial_ai_batches WHERE finished_at IS NULL) AS active,
      COALESCE((SELECT jsonb_agg(recent ORDER BY "createdAt" DESC,id) FROM recent),'[]'::jsonb) AS history,
      (SELECT row_to_json(latest) FROM latest) AS latest,
      (SELECT count(*)::int FROM batch_items) AS total,
      COALESCE((SELECT jsonb_object_agg(status,n) FROM counts),'{}'::jsonb) AS counts,
      COALESCE((SELECT jsonb_agg(batch_page ORDER BY title,"entryId") FROM batch_page),'[]'::jsonb) AS items
  `, [PAGE_SIZE, (page - 1) * PAGE_SIZE, batchId ?? null]);
  const row = rows[0];
  const counts = Object.fromEntries(draftBatchItemStatuses.map(status => [status, row.counts[status] ?? 0])) as Record<DraftBatchItemStatus, number>;
  return { eligibleCount: row.eligible_count, active: row.active, history: row.history, latest: row.latest ? {
    id: row.latest.id, finishedAt: row.latest.finished_at, stoppedAt: row.latest.stopped_at,
    counts, items: row.items, total: row.total,
    visibleTotal: Object.values(counts).reduce((sum, count) => sum + count, 0), page, limit: PAGE_SIZE,
  } : null };
}

export async function startDraftBatch(input: unknown, actor: string, database = pool, checkProviders = true) {
  const body = draftBatchStartSchema.parse(input);
  await requireBatchTables(database);
  return transaction(database, async client => {
    await lockBatch(client);
    const previous = (await client.query('SELECT created_by FROM editorial_ai_batches WHERE id=$1', [body.requestId])).rows[0];
    if (previous?.created_by === actor) return { id: body.requestId };
    if (previous || (await client.query('SELECT 1 FROM editorial_ai_batches WHERE finished_at IS NULL')).rowCount)
      throw new EditorialError(409, 'Очередь уже запущена. Обновите состояние перед новым запуском.');
    if (checkProviders && (!process.env.BRAVE_API_KEY?.trim() || !process.env[getEditorialModelSettings().keyName]?.trim()))
      throw new EditorialError(503, 'Для подготовки настройте Brave Search и AI в защищённых переменных сервера.');
    const candidates = (await client.query(`SELECT e.id,e.revision,e.data->>'title' AS title FROM editorial_entries e
      WHERE ${eligible} ORDER BY e.data->>'title',e.id`)).rows;
    if (candidates.length !== body.eligibleCount)
      throw new EditorialError(409, 'Количество статей изменилось. Обновите список и подтвердите заново.');
    await client.query('INSERT INTO editorial_ai_batches(id,created_by) VALUES ($1,$2)', [body.requestId, actor]);
    await client.query(`INSERT INTO editorial_ai_batch_items(batch_id,entry_id,entry_revision,title)
      SELECT $1,id,revision,title FROM jsonb_to_recordset($2::jsonb) AS e(id uuid,revision int,title text)`,
    [body.requestId, JSON.stringify(candidates)]);
    await audit(client, actor, 'ai_batch_started', body.requestId, null, { eligibleCount: candidates.length });
    return { id: body.requestId };
  });
}

async function finishBatchIfSettled(client: PoolClient, batchId: string) {
  await client.query(`UPDATE editorial_ai_batches SET finished_at=clock_timestamp() WHERE id=$1
    AND finished_at IS NULL AND NOT EXISTS (
      SELECT 1 FROM editorial_ai_batch_items WHERE batch_id=$1 AND status IN ('queued','running')
    )`, [batchId]);
}

export async function stopDraftBatch(id: string, actor: string, database = pool) {
  await requireBatchTables(database);
  return transaction(database, async client => {
    await lockBatch(client);
    const result = await client.query(`UPDATE editorial_ai_batches SET stopped_at=clock_timestamp()
      WHERE id=$1 AND stopped_at IS NULL AND finished_at IS NULL RETURNING id`, [id]);
    if (!result.rowCount) return;
    const cancelled = await client.query(`UPDATE editorial_ai_batch_items SET status='cancelled' WHERE batch_id=$1 AND status='queued'`, [id]);
    await finishBatchIfSettled(client, id);
    await audit(client, actor, 'ai_batch_stopped', id, null, { cancelled: cancelled.rowCount });
  });
}

export async function getDraftBatchReview(batchId: string, entryId: string, database = pool): Promise<DraftBatchReview> {
  await requireBatchTables(database);
  const { rows } = await database.query<Row & { run: RunRow }>(`SELECT e.*, row_to_json(r) AS run
    FROM editorial_ai_batch_items i JOIN editorial_entries e ON e.id=i.entry_id
    JOIN editorial_ai_runs r ON r.id=i.run_id
    WHERE i.batch_id=$1 AND i.entry_id=$2 AND i.status='ready' AND ${reviewable}`, [batchId, entryId]);
  if (!rows.length) throw new EditorialError(409, 'Черновик больше не соответствует текущей статье. Откройте её заново.');
  const run = runDto(rows[0].run);
  return { entry: entry(rows[0]), run: run as DraftBatchReview['run'] };
}

async function claimNextDraft(database: typeof pool) {
  return transaction(database, async client => {
    await lockBatch(client);
    const batch = (await client.query(`SELECT id,created_by FROM editorial_ai_batches WHERE finished_at IS NULL LIMIT 1`)).rows[0];
    if (!batch) return null;
    await lockEditorialAiReservations(client);
    await expireEditorialAiRuns(client);
    await client.query(`UPDATE editorial_ai_batch_items i SET status=CASE
      WHEN NOT EXISTS (SELECT 1 FROM editorial_entries e WHERE e.id=i.entry_id AND e.revision=i.entry_revision AND ${preparation}) THEN 'skipped'
      WHEN r.status='ready' THEN 'ready' ELSE 'failed' END,
      detail=CASE WHEN NOT EXISTS (SELECT 1 FROM editorial_entries e WHERE e.id=i.entry_id AND e.revision=i.entry_revision AND ${preparation})
        THEN $2 ELSE r.error END
      FROM editorial_ai_runs r
      WHERE i.batch_id=$1 AND i.status='running' AND i.run_id=r.id AND r.status IN ('ready','failed')`, [batch.id, deadArticle]);
    await finishBatchIfSettled(client, batch.id);
    if ((await client.query(`SELECT 1 FROM editorial_ai_runs WHERE status='running'
      OR (created_by=$1 AND params->>'research'='true' AND created_at>clock_timestamp()-interval '60 seconds') LIMIT 1`,
    [batch.created_by])).rowCount) return null;
    const item = (await client.query(`SELECT entry_id,entry_revision FROM editorial_ai_batch_items
      WHERE batch_id=$1 AND status='queued' ORDER BY title,entry_id LIMIT 1`, [batch.id])).rows[0];
    if (!item) return null;
    const current = (await client.query(`SELECT e.data, (SELECT id FROM editorial_ai_runs r
      WHERE ${matchingReady} ORDER BY r.created_at DESC,r.id LIMIT 1) AS existing_run
      FROM editorial_entries e WHERE ${preparation} AND ${needsDraft}
      AND e.id=$1 AND e.revision=$2 FOR SHARE`, [item.entry_id, item.entry_revision])).rows[0];
    if (!current || current.existing_run) {
      await client.query(`UPDATE editorial_ai_batch_items SET status=$3,run_id=$4,detail=$5 WHERE batch_id=$1 AND entry_id=$2`,
        [batch.id, item.entry_id, current?.existing_run ? 'ready' : 'skipped', current?.existing_run ?? null, current ? null : deadArticle]);
      await finishBatchIfSettled(client, batch.id);
      return null;
    }
    const sources: string[] = Array.from(new Set<string>((Array.isArray(current.data.sources) ? current.data.sources : [])
      .flatMap((value: unknown) => { const url = editorialSourceUrl.safeParse(value); return url.success ? [url.data] : []; }))).slice(0, 3);
    const { run } = await reserveAiRunInTransaction('draft', {
      requestId: randomUUID(), entryId: item.entry_id, revision: item.entry_revision,
      sources, research: true, fullDraft: true,
    }, batch.created_by, client);
    await client.query(`UPDATE editorial_ai_batch_items SET status='running',run_id=$3 WHERE batch_id=$1 AND entry_id=$2`,
      [batch.id, item.entry_id, run.id]);
    return run.id;
  });
}

export async function processDraftBatch(database = pool, deps: AiDependencies = defaultAiDependencies) {
  if (!await batchTablesAvailable(database)) return;
  const runId = await claimNextDraft(database);
  if (runId) await executeAiRun(runId, database, deps);
}

export function startDraftBatchWorker() {
  let busy = false;
  let loggedError = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await processDraftBatch();
      loggedError = false;
    } catch {
      if (!loggedError) console.error('Editorial draft batch worker could not access the queue.');
      loggedError = true;
    } finally { busy = false; }
  };
  setInterval(() => { void tick(); }, 5000).unref();
}
