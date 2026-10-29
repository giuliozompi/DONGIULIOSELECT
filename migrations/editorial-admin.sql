-- Development-only application for point 3. Never run automatically at startup,
-- build, post-merge or on Timeweb. Production requires separate approval.
BEGIN;
CREATE TABLE IF NOT EXISTS editorial_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('video', 'cheese', 'price')),
  data jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  moderation text CHECK (moderation IN ('pending', 'approved', 'rejected')),
  moderation_note text NOT NULL DEFAULT '',
  created_by varchar NOT NULL,
  updated_by varchar NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'price' AND moderation IS NOT NULL) OR
         (kind <> 'price' AND moderation IS NULL))
);
CREATE INDEX IF NOT EXISTS editorial_entries_kind_updated
  ON editorial_entries(kind, updated_at DESC);
COMMIT;
