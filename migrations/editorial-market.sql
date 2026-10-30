-- Explicit DEVELOPMENT migration only; never executed by startup/build.
BEGIN;
CREATE TABLE IF NOT EXISTS editorial_price_watches (
 id uuid PRIMARY KEY, revision integer NOT NULL DEFAULT 1,
 cheese_id uuid REFERENCES editorial_entries(id) ON DELETE SET NULL,
 country text NOT NULL, store text NOT NULL DEFAULT '', source_url text NOT NULL,
 active boolean NOT NULL DEFAULT true, created_by varchar NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), next_check_at timestamptz NOT NULL,
 last_check_at timestamptz,
 CHECK(revision>0)
);
CREATE INDEX IF NOT EXISTS editorial_price_watches_due ON editorial_price_watches(next_check_at) WHERE active;
CREATE TABLE IF NOT EXISTS editorial_price_checks (
 id uuid PRIMARY KEY, watch_id uuid NOT NULL REFERENCES editorial_price_watches(id) ON DELETE CASCADE,
 requested_by varchar NOT NULL, request_id uuid NOT NULL, trigger text NOT NULL CHECK(trigger IN ('manual','scheduled')),
 status text NOT NULL CHECK(status IN ('running','ready','failed')),
 params jsonb NOT NULL, observed_on date NOT NULL,
 started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 lease_until timestamptz NOT NULL, result jsonb, error text,
 entry_id uuid REFERENCES editorial_entries(id) ON DELETE SET NULL, applied_params jsonb,
 applied_at timestamptz,
 UNIQUE(requested_by,request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS editorial_price_checks_running ON editorial_price_checks(watch_id) WHERE status='running';
CREATE INDEX IF NOT EXISTS editorial_price_checks_history ON editorial_price_checks(watch_id,started_at DESC);
CREATE TABLE IF NOT EXISTS editorial_fx_rates (
 requested_on date PRIMARY KEY, effective_on date NOT NULL, rates jsonb NOT NULL,
 fetched_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
