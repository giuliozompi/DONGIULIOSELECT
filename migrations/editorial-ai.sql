-- Development only. No startup/build/post-merge execution or production permission.
BEGIN;
CREATE TABLE IF NOT EXISTS editorial_ai_runs (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK(kind IN ('catalog','draft')),
  status text NOT NULL CHECK(status IN ('running','ready','failed')),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  request_id uuid NOT NULL,
  params jsonb NOT NULL,
  result jsonb,
  model text NOT NULL,
  created_by varchar NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  lease_until timestamptz NOT NULL,
  error text,
  applied_entry_id uuid,
  applied_revision integer,
  applied_params jsonb,
  UNIQUE(created_by,request_id)
);
CREATE INDEX IF NOT EXISTS editorial_ai_runs_created ON editorial_ai_runs(created_at DESC);
CREATE TABLE IF NOT EXISTS editorial_ai_imports (
  run_id uuid NOT NULL REFERENCES editorial_ai_runs(id),
  item_id uuid NOT NULL,
  entry_id uuid REFERENCES editorial_entries(id) ON DELETE SET NULL,
  name_keys jsonb NOT NULL,
  country_code varchar(2) NOT NULL,
  created_by varchar NOT NULL,
  PRIMARY KEY(run_id,item_id)
);
COMMIT;
