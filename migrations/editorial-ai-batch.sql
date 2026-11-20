-- Apply explicitly after editorial-ai.sql. Never at startup or during a build.
BEGIN;
CREATE TABLE IF NOT EXISTS editorial_ai_batches (
  id uuid PRIMARY KEY,
  created_by varchar NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz,
  finished_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS editorial_ai_batches_one_active
  ON editorial_ai_batches ((true)) WHERE finished_at IS NULL;
CREATE TABLE IF NOT EXISTS editorial_ai_batch_items (
  batch_id uuid NOT NULL REFERENCES editorial_ai_batches(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL,
  entry_revision integer NOT NULL CHECK (entry_revision > 0),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','ready','failed','skipped','cancelled')),
  run_id uuid REFERENCES editorial_ai_runs(id),
  detail text,
  PRIMARY KEY (batch_id, entry_id)
);
CREATE INDEX IF NOT EXISTS editorial_ai_batch_items_queue
  ON editorial_ai_batch_items(batch_id, status, title, entry_id);
COMMIT;
