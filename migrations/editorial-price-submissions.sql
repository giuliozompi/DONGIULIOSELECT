-- Apply only to development during this phase. A Timeweb migration needs
-- separate explicit authorization. Never run from startup/build/post-merge.
BEGIN;
CREATE TABLE IF NOT EXISTS editorial_price_submissions (
  id uuid PRIMARY KEY,
  entry_id uuid UNIQUE REFERENCES editorial_entries(id) ON DELETE SET NULL,
  user_id varchar NOT NULL REFERENCES web_users(id) ON DELETE CASCADE,
  cheese_id uuid NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  fingerprint varchar(64) NOT NULL CHECK (length(fingerprint) = 64),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS editorial_submissions_user_created
  ON editorial_price_submissions(user_id, created_at);
CREATE INDEX IF NOT EXISTS editorial_submissions_user_cheese
  ON editorial_price_submissions(user_id, cheese_id, created_at);
COMMIT;
