// Release contract, not a migration. Keep in sync with migrations/editorial-*.sql.
// Definitions use PostgreSQL's canonical catalog output; names are not evidence
// of compatibility. A different, equivalent expression needs explicit review.
export const editorialRequirements = [
  {
    table: 'editorial_entries',
    columns: [
      ['id', 'uuid', true, 'gen_random_uuid()'],
      ['kind', 'text', true], ['data', 'jsonb', true],
      ['revision', 'integer', true, '1'], ['moderation', 'text', false],
      ['moderation_note', 'text', true, "''::text"],
      ['created_by', 'character varying', true], ['updated_by', 'character varying', true],
      ['created_at', 'timestamp with time zone', true, 'now()'],
      ['updated_at', 'timestamp with time zone', true, 'now()'],
    ],
    constraints: [
      'PRIMARY KEY (id)',
      "CHECK ((kind = ANY (ARRAY['video'::text, 'cheese'::text, 'price'::text])))",
      'CHECK ((revision > 0))',
      "CHECK ((moderation = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))",
      "CHECK ((((kind = 'price'::text) AND (moderation IS NOT NULL)) OR ((kind <> 'price'::text) AND (moderation IS NULL))))",
    ],
    indexes: ['UNIQUE USING btree (id)', 'USING btree (kind, updated_at DESC)'],
  },
  {
    table: 'editorial_publications',
    columns: [
      ['entry_id', 'uuid', true], ['kind', 'text', true], ['data', 'jsonb', true],
      ['published_revision', 'integer', true],
      ['published_at', 'timestamp with time zone', true, 'now()'],
      ['published_by', 'character varying', true],
    ],
    constraints: [
      'PRIMARY KEY (entry_id)', 'FOREIGN KEY (entry_id) REFERENCES editorial_entries(id)',
      "CHECK ((kind = ANY (ARRAY['video'::text, 'cheese'::text])))",
      'CHECK ((published_revision > 0))',
    ],
    indexes: ['UNIQUE USING btree (entry_id)', 'USING btree (kind)'],
  },
  {
    table: 'editorial_price_submissions',
    columns: [
      ['id', 'uuid', true], ['entry_id', 'uuid', false],
      ['user_id', 'character varying', true], ['cheese_id', 'uuid', true],
      ['payload', 'jsonb', true], ['fingerprint', 'character varying(64)', true],
      ['created_at', 'timestamp with time zone', true, 'now()'],
    ],
    constraints: [
      'PRIMARY KEY (id)',
      'FOREIGN KEY (entry_id) REFERENCES editorial_entries(id) ON DELETE SET NULL',
      'FOREIGN KEY (user_id) REFERENCES web_users(id) ON DELETE CASCADE',
      "CHECK ((jsonb_typeof(payload) = 'object'::text))",
      'CHECK ((length((fingerprint)::text) = 64))',
    ],
    indexes: [
      'UNIQUE USING btree (id)', 'UNIQUE USING btree (entry_id)',
      'USING btree (user_id, created_at)', 'USING btree (user_id, cheese_id, created_at)',
    ],
  },
  {
    table: 'editorial_ai_runs',
    columns: [
      ['id', 'uuid', true], ['kind', 'text', true], ['status', 'text', true],
      ['revision', 'integer', true, '1'], ['request_id', 'uuid', true],
      ['params', 'jsonb', true], ['result', 'jsonb', false], ['model', 'text', true],
      ['created_by', 'character varying', true],
      ['created_at', 'timestamp with time zone', true, 'now()'],
      ['finished_at', 'timestamp with time zone', false],
      ['lease_until', 'timestamp with time zone', true], ['error', 'text', false],
      ['applied_entry_id', 'uuid', false], ['applied_revision', 'integer', false],
      ['applied_params', 'jsonb', false],
    ],
    constraints: [
      'PRIMARY KEY (id)', "CHECK ((kind = ANY (ARRAY['catalog'::text, 'draft'::text])))",
      "CHECK ((status = ANY (ARRAY['running'::text, 'ready'::text, 'failed'::text])))",
      'CHECK ((revision > 0))',
    ],
    indexes: [
      'UNIQUE USING btree (id)', 'UNIQUE USING btree (created_by, request_id)',
      'USING btree (created_at DESC)',
    ],
  },
  {
    table: 'editorial_ai_imports',
    columns: [
      ['run_id', 'uuid', true], ['item_id', 'uuid', true], ['entry_id', 'uuid', false],
      ['name_keys', 'jsonb', true], ['country_code', 'character varying(2)', true],
      ['created_by', 'character varying', true],
    ],
    constraints: [
      'PRIMARY KEY (run_id, item_id)', 'FOREIGN KEY (run_id) REFERENCES editorial_ai_runs(id)',
      'FOREIGN KEY (entry_id) REFERENCES editorial_entries(id) ON DELETE SET NULL',
    ],
    indexes: ['UNIQUE USING btree (run_id, item_id)'],
  },
  {
    table: 'editorial_ai_batches',
    columns: [
      ['id', 'uuid', true], ['created_by', 'character varying', true],
      ['created_at', 'timestamp with time zone', true, 'now()'],
      ['stopped_at', 'timestamp with time zone', false], ['finished_at', 'timestamp with time zone', false],
    ],
    constraints: ['PRIMARY KEY (id)'],
    indexes: ['UNIQUE USING btree (id)', 'UNIQUE USING btree ((true)) WHERE (finished_at IS NULL)'],
  },
  {
    table: 'editorial_ai_batch_items',
    columns: [
      ['batch_id', 'uuid', true], ['entry_id', 'uuid', true], ['entry_revision', 'integer', true],
      ['title', 'text', true], ['status', 'text', true, "'queued'::text"],
      ['run_id', 'uuid', false], ['detail', 'text', false],
    ],
    constraints: [
      'PRIMARY KEY (batch_id, entry_id)', 'FOREIGN KEY (batch_id) REFERENCES editorial_ai_batches(id) ON DELETE CASCADE',
      'FOREIGN KEY (run_id) REFERENCES editorial_ai_runs(id)', 'CHECK ((entry_revision > 0))',
      "CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'ready'::text, 'failed'::text, 'skipped'::text, 'cancelled'::text])))",
    ],
    indexes: ['UNIQUE USING btree (batch_id, entry_id)', 'USING btree (batch_id, status, title, entry_id)'],
  },
  {
    table: 'editorial_price_watches',
    columns: [
      ['id', 'uuid', true], ['revision', 'integer', true, '1'], ['cheese_id', 'uuid', false],
      ['country', 'text', true], ['store', 'text', true, "''::text"],
      ['source_url', 'text', true], ['active', 'boolean', true, 'true'],
      ['created_by', 'character varying', true],
      ['created_at', 'timestamp with time zone', true, 'now()'],
      ['next_check_at', 'timestamp with time zone', true],
      ['last_check_at', 'timestamp with time zone', false],
    ],
    constraints: [
      'PRIMARY KEY (id)', 'CHECK ((revision > 0))',
      'FOREIGN KEY (cheese_id) REFERENCES editorial_entries(id) ON DELETE SET NULL',
    ],
    indexes: ['UNIQUE USING btree (id)', 'USING btree (next_check_at) WHERE active'],
  },
  {
    table: 'editorial_price_checks',
    columns: [
      ['id', 'uuid', true], ['watch_id', 'uuid', true],
      ['requested_by', 'character varying', true], ['request_id', 'uuid', true],
      ['trigger', 'text', true], ['status', 'text', true], ['params', 'jsonb', true],
      ['observed_on', 'date', true],
      ['started_at', 'timestamp with time zone', true, 'now()'],
      ['finished_at', 'timestamp with time zone', false],
      ['lease_until', 'timestamp with time zone', true], ['result', 'jsonb', false],
      ['error', 'text', false], ['entry_id', 'uuid', false],
      ['applied_params', 'jsonb', false], ['applied_at', 'timestamp with time zone', false],
    ],
    constraints: [
      'PRIMARY KEY (id)',
      'FOREIGN KEY (watch_id) REFERENCES editorial_price_watches(id) ON DELETE CASCADE',
      'FOREIGN KEY (entry_id) REFERENCES editorial_entries(id) ON DELETE SET NULL',
      "CHECK ((trigger = ANY (ARRAY['manual'::text, 'scheduled'::text])))",
      "CHECK ((status = ANY (ARRAY['running'::text, 'ready'::text, 'failed'::text])))",
    ],
    indexes: [
      'UNIQUE USING btree (id)', 'UNIQUE USING btree (requested_by, request_id)',
      "UNIQUE USING btree (watch_id) WHERE (status = 'running'::text)",
      'USING btree (watch_id, started_at DESC)',
    ],
  },
  {
    table: 'editorial_fx_rates',
    columns: [
      ['requested_on', 'date', true], ['effective_on', 'date', true], ['rates', 'jsonb', true],
      ['fetched_at', 'timestamp with time zone', true, 'now()'],
    ],
    constraints: ['PRIMARY KEY (requested_on)'],
    indexes: ['UNIQUE USING btree (requested_on)'],
  },
];
