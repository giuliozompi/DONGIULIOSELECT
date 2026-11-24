import type pg from 'pg';

type Database = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;

// Match the current revision, not historical attempts. A successful AI transfer
// advances the revision and returns the article to the normal editorial flow.
export const pendingBatchDraft = `EXISTS (
  SELECT 1 FROM editorial_ai_batch_items bi
  JOIN editorial_ai_runs br ON br.id=bi.run_id
  WHERE bi.entry_id=e.id AND bi.entry_revision=e.revision
    AND bi.status IN ('running','ready')
    AND br.kind='draft' AND br.status='ready' AND br.result IS NOT NULL
    AND br.params->>'fullDraft'='true'
    AND br.params->>'entryId'=e.id::text AND br.params->>'revision'=e.revision::text
    AND br.applied_entry_id IS NULL
    AND e.kind='cheese' AND e.data->>'status' IN ('draft','pending_review')
    AND NOT EXISTS (SELECT 1 FROM editorial_publications bp WHERE bp.entry_id=e.id)
)`;

export async function pendingBatchTablesAvailable(database: Database) {
  const { rows } = await database.query(`SELECT
    to_regclass('public.editorial_ai_batch_items') IS NOT NULL
    AND to_regclass('public.editorial_ai_runs') IS NOT NULL AS available`);
  return rows[0].available === true;
}

export async function hasPendingBatchDraft(database: Database, id: string, permittedRunId?: string) {
  if (!await pendingBatchTablesAvailable(database)) return false;
  const { rows } = await database.query(`SELECT 1 FROM editorial_entries e
    WHERE e.id=$1 AND ${pendingBatchDraft}
      ${permittedRunId ? `AND NOT EXISTS (
        SELECT 1 FROM editorial_ai_batch_items own
        WHERE own.entry_id=e.id AND own.entry_revision=e.revision
          AND own.run_id=$2 AND own.status IN ('running','ready')
      )` : ''}`, permittedRunId ? [id, permittedRunId] : [id]);
  return rows.length > 0;
}

export const pendingBatchMessage =
  'Для этой статьи уже подготовлен фоновый черновик. Откройте его в разделе «Фоновая подготовка черновиков», проверьте и сохраните предложенные данные.';
