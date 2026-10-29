-- Point 4, development only; no automatic application or production authorization.
BEGIN;
CREATE TABLE IF NOT EXISTS editorial_publications (
  entry_id uuid PRIMARY KEY REFERENCES editorial_entries(id),
  kind text NOT NULL CHECK(kind IN ('video','cheese')),
  data jsonb NOT NULL,
  published_revision integer NOT NULL CHECK(published_revision > 0),
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by varchar NOT NULL
);
CREATE INDEX IF NOT EXISTS editorial_publications_kind ON editorial_publications(kind);
COMMIT;
