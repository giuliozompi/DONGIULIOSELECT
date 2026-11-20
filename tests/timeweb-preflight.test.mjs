import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import pg from 'pg';
import { checkTimeweb, connectionConfig } from '../scripts/check-timeweb-compatibility.mjs';
import { editorialRequirements } from '../scripts/editorial-schema-requirements.mjs';

const exec = promisify(execFile);
let directory, pool, url, started;
const indexName = 'web_wishlists_user_product_unique';
// Explicit settings throughout: no inherited app database/role/password/options.
const cleanEnv = () => ({ PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C' });
async function unusedPort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'timeweb-preflight-'));
  const port = await unusedPort();
  await exec('initdb', ['-D', join(directory, 'data'), '-U', 'preflight_test',
    '-A', 'trust', '--no-locale'], { env: cleanEnv() });
  await exec('pg_ctl', ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'),
    '-o', `-F -k ${directory} -h 127.0.0.1 -p ${port}`, '-w', 'start'], { env: cleanEnv() });
  started = true;
  url = `postgresql://preflight_test:fixture-password@127.0.0.1:${port}/postgres?sslmode=disable`;
  pool = new pg.Pool({ ...connectionConfig(url), options: '', max: 2 });
  await pool.query('CREATE TABLE public.web_users(id varchar PRIMARY KEY)');
});
after(async () => {
  await pool?.end();
  if (started) await exec('pg_ctl', ['-D', join(directory, 'data'), '-m', 'immediate', 'stop'],
    { env: cleanEnv() });
  if (directory) await rm(directory, { recursive: true, force: true });
});
beforeEach(async () => {
  await pool.query(`
    DROP TABLE IF EXISTS public.web_wishlists CASCADE;
    DROP TABLE IF EXISTS public.other_wishlists CASCADE;
    DROP TABLE IF EXISTS public.orders;
    CREATE TABLE public.orders (id varchar PRIMARY KEY);
    CREATE TABLE public.web_wishlists (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id varchar NOT NULL, product_id varchar NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX ${indexName} ON public.web_wishlists (user_id, product_id);
  `);
  await pool.query(await readFile(new URL('../migrations/web-order-delivery.sql', import.meta.url), 'utf8'));
  await resetEditorial();
});
async function resetEditorial() {
  await pool.query(`DROP TABLE IF EXISTS ${editorialRequirements.map(r => `public.${r.table}`).join(', ')} CASCADE`);
  for (const name of ['admin', 'publication', 'price-submissions', 'ai', 'ai-batch', 'market']) {
    await pool.query(await readFile(new URL(`../migrations/editorial-${name}.sql`, import.meta.url), 'utf8'));
  }
}
async function check(options = {}) {
  const output = [];
  const ok = await checkTimeweb({
    env: { TIMEWEB_DATABASE_URL: url }, log: line => output.push(line),
    error: line => output.push(line), ...options,
  });
  return { ok, output: output.join('\n') };
}

test('ready schema passes; session is read-only, bounded and pinned to the explicit target', async () => {
  assert.equal((await check()).ok, true);
  const config = connectionConfig(url);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.database, 'postgres');
  assert.equal(config.connectionTimeoutMillis, 3000);
  const client = new pg.Client(config);
  await client.connect();
  try {
    assert.equal((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only, 'on');
    assert.equal((await client.query('SHOW statement_timeout')).rows[0].statement_timeout, '3s');
    assert.equal((await client.query('SHOW lock_timeout')).rows[0].lock_timeout, '1s');
    await assert.rejects(client.query("INSERT INTO public.web_wishlists (user_id, product_id) VALUES ('x', 'y')"),
      error => error.code === '25006');
    await assert.rejects(client.query('CREATE TABLE public.forbidden_write (id int)'),
      error => error.code === '25006');
  } finally { await client.end(); }
});

test('wishlist-only schema cannot authorize an editorial release', async () => {
  await pool.query(`DROP TABLE ${editorialRequirements.map(r => `public.${r.table}`).join(', ')} CASCADE`);
  const result = await check();
  assert.equal(result.ok, false);
  assert.match(result.output, /Push bloccato/);
  assert.doesNotMatch(result.output, /fixture-password|postgresql:\/\//);
  assert.equal((await pool.query("SELECT to_regclass('public.editorial_entries') AS table_name")).rows[0].table_name, null);
});

test('missing or incompatible order delivery columns block release without applying the migration', async () => {
  await pool.query('ALTER TABLE public.orders DROP COLUMN desired_delivery_date');
  const missing = await check();
  assert.equal(missing.ok, false);
  assert.match(missing.output, /colonne di consegna/);
  await pool.query('ALTER TABLE public.orders ADD COLUMN desired_delivery_date text');
  assert.equal((await check()).ok, false);
});

for (const { table } of editorialRequirements) {
  test(`missing ${table} blocks release without recreating it`, async () => {
    await pool.query(`DROP TABLE public.${table} CASCADE`);
    assert.equal((await check()).ok, false);
    assert.equal((await pool.query('SELECT to_regclass($1) AS table_name', [`public.${table}`])).rows[0].table_name, null);
  });
}

test('missing editorial columns on every table block release', async () => {
  for (const { table, columns } of editorialRequirements) {
    await pool.query(`ALTER TABLE public.${table} DROP COLUMN ${columns.at(-1)[0]} CASCADE`);
    assert.equal((await check()).ok, false, table);
    await resetEditorial();
  }
});

test('editorial types, nullability, defaults and bounded varchar lengths must match', async () => {
  for (const mutation of [
    'ALTER TABLE editorial_publications ALTER COLUMN data TYPE text',
    'ALTER TABLE editorial_publications ALTER COLUMN published_by DROP NOT NULL',
    'ALTER TABLE editorial_entries ALTER COLUMN moderation SET NOT NULL',
    'ALTER TABLE editorial_entries ALTER COLUMN id DROP DEFAULT',
    'ALTER TABLE editorial_entries ALTER COLUMN revision SET DEFAULT 2',
    "ALTER TABLE editorial_entries ALTER COLUMN moderation_note SET DEFAULT 'private-default-marker'",
    'ALTER TABLE editorial_fx_rates ALTER COLUMN fetched_at DROP DEFAULT',
    'ALTER TABLE editorial_ai_imports ALTER COLUMN country_code TYPE varchar(3)',
    'ALTER TABLE editorial_price_submissions ALTER COLUMN fingerprint TYPE varchar(80)',
    'ALTER TABLE editorial_ai_runs ADD COLUMN unexpected text NOT NULL',
  ]) {
    await pool.query(mutation);
    const result = await check();
    assert.equal(result.ok, false, mutation);
    assert.doesNotMatch(result.output, /private-default-marker|fixture-password/);
    await resetEditorial();
  }
});

test('editorial checks must exist, be validated, and enforce the approved values', async () => {
  for (const mutation of [
    'ALTER TABLE editorial_entries DROP CONSTRAINT editorial_entries_revision_check',
    `ALTER TABLE editorial_entries DROP CONSTRAINT editorial_entries_kind_check;
      ALTER TABLE editorial_entries ADD CHECK(kind IN ('video','cheese','price','unreviewed'))`,
    `ALTER TABLE editorial_entries DROP CONSTRAINT editorial_entries_moderation_check;
      ALTER TABLE editorial_entries ADD CHECK(moderation IN ('pending','approved','rejected')) NOT VALID`,
    'ALTER TABLE editorial_entries DROP CONSTRAINT editorial_entries_check',
    'ALTER TABLE editorial_publications DROP CONSTRAINT editorial_publications_published_revision_check',
    'ALTER TABLE editorial_price_submissions DROP CONSTRAINT editorial_price_submissions_payload_check',
    'ALTER TABLE editorial_price_submissions DROP CONSTRAINT editorial_price_submissions_fingerprint_check',
    'ALTER TABLE editorial_ai_runs DROP CONSTRAINT editorial_ai_runs_status_check',
    'ALTER TABLE editorial_price_checks DROP CONSTRAINT editorial_price_checks_trigger_check',
    "ALTER TABLE editorial_fx_rates ADD CHECK(rates = '{}'::jsonb)",
  ]) {
    await pool.query(mutation);
    assert.equal((await check()).ok, false, mutation);
    await resetEditorial();
  }
});

test('editorial foreign keys require the right target, delete action and validation', async () => {
  for (const mutation of [
    'ALTER TABLE editorial_publications DROP CONSTRAINT editorial_publications_entry_id_fkey',
    `ALTER TABLE editorial_publications DROP CONSTRAINT editorial_publications_entry_id_fkey;
      ALTER TABLE editorial_publications ADD FOREIGN KEY(entry_id) REFERENCES editorial_entries(id) ON DELETE CASCADE`,
    `ALTER TABLE editorial_price_submissions DROP CONSTRAINT editorial_price_submissions_user_id_fkey;
      ALTER TABLE editorial_price_submissions ADD FOREIGN KEY(user_id) REFERENCES web_users(id) ON DELETE CASCADE NOT VALID`,
    `ALTER TABLE editorial_price_checks DROP CONSTRAINT editorial_price_checks_watch_id_fkey;
      ALTER TABLE editorial_price_checks ADD FOREIGN KEY(watch_id) REFERENCES editorial_entries(id) ON DELETE CASCADE`,
    `ALTER TABLE editorial_ai_imports DROP CONSTRAINT editorial_ai_imports_run_id_fkey;
      ALTER TABLE editorial_ai_imports ADD FOREIGN KEY(run_id) REFERENCES editorial_ai_runs(id) DEFERRABLE`,
  ]) {
    await pool.query(mutation);
    assert.equal((await check()).ok, false, mutation);
    await resetEditorial();
  }
});

test('editorial primary keys and idempotency uniqueness cannot be absent or deferrable', async () => {
  for (const mutation of [
    'ALTER TABLE editorial_publications DROP CONSTRAINT editorial_publications_pkey',
    'ALTER TABLE editorial_ai_imports DROP CONSTRAINT editorial_ai_imports_pkey',
    'ALTER TABLE editorial_ai_runs DROP CONSTRAINT editorial_ai_runs_created_by_request_id_key',
    `ALTER TABLE editorial_ai_runs DROP CONSTRAINT editorial_ai_runs_created_by_request_id_key;
      ALTER TABLE editorial_ai_runs ADD UNIQUE(created_by,request_id) DEFERRABLE`,
    'ALTER TABLE editorial_price_submissions DROP CONSTRAINT editorial_price_submissions_entry_id_key',
    'ALTER TABLE editorial_price_checks DROP CONSTRAINT editorial_price_checks_requested_by_request_id_key',
    'CREATE UNIQUE INDEX unexpected_unique ON editorial_publications(kind)',
  ]) {
    await pool.query(mutation);
    assert.equal((await check()).ok, false, mutation);
    await resetEditorial();
  }
});

test('editorial index names cannot conceal wrong keys, order, uniqueness or predicates', async () => {
  for (const definition of [
    '',
    'CREATE INDEX editorial_price_checks_running ON editorial_price_checks(watch_id)',
    "CREATE UNIQUE INDEX editorial_price_checks_running ON editorial_price_checks(watch_id) WHERE status='ready'",
    "CREATE UNIQUE INDEX editorial_price_checks_running ON editorial_price_checks(request_id) WHERE status='running'",
    "CREATE UNIQUE INDEX editorial_price_checks_running ON editorial_price_checks(watch_id) INCLUDE(id) WHERE status='running'",
  ]) {
    await pool.query('DROP INDEX editorial_price_checks_running');
    if (definition) await pool.query(definition);
    assert.equal((await check()).ok, false, definition || 'missing running index');
    await resetEditorial();
  }
  for (const mutation of [
    'DROP INDEX editorial_entries_kind_updated',
    `DROP INDEX editorial_price_checks_history;
      CREATE INDEX editorial_price_checks_history ON editorial_price_checks(watch_id,started_at ASC)`,
    `DROP INDEX editorial_price_watches_due;
      CREATE INDEX editorial_price_watches_due ON editorial_price_watches(next_check_at)`,
    `DROP INDEX editorial_submissions_user_cheese;
      CREATE INDEX editorial_submissions_user_cheese ON editorial_price_submissions(cheese_id,user_id,created_at)`,
  ]) {
    await pool.query(mutation);
    assert.equal((await check()).ok, false, mutation);
    await resetEditorial();
  }
});

test('invalid editorial index is rejected even with the expected definition', async () => {
  await pool.query('ALTER TABLE editorial_ai_runs DROP CONSTRAINT editorial_ai_runs_created_by_request_id_key');
  await pool.query(`INSERT INTO editorial_ai_runs(id,kind,status,request_id,params,model,created_by,lease_until)
    SELECT gen_random_uuid(),'catalog','ready','11111111-1111-4111-8111-111111111111',
      '{}'::jsonb,'test-model','private-operator-marker',now() FROM generate_series(1,2)`);
  await assert.rejects(pool.query(`CREATE UNIQUE INDEX CONCURRENTLY editorial_ai_runs_created_by_request_id_key
    ON editorial_ai_runs(created_by,request_id)`));
  const result = await check();
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.output, /private-operator-marker/);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM editorial_ai_runs')).rows[0].n, 2);
});

test('editorial names are not required, but structure is; ordinary extra indexes are allowed', async () => {
  await pool.query(`ALTER INDEX editorial_publications_kind RENAME TO renamed_publications_kind;
    ALTER TABLE editorial_entries RENAME CONSTRAINT editorial_entries_revision_check TO renamed_revision_check;
    CREATE INDEX extra_editorial_index ON editorial_entries(updated_at)`);
  assert.equal((await check()).ok, true);
});

test('row security, replacement views and missing editorial read permissions fail closed', async () => {
  await pool.query('ALTER TABLE editorial_publications ENABLE ROW LEVEL SECURITY');
  assert.equal((await check()).ok, false);
  await resetEditorial();
  await pool.query(`ALTER TABLE editorial_publications RENAME TO hidden_publications;
    CREATE VIEW editorial_publications AS SELECT * FROM hidden_publications`);
  try { assert.equal((await check()).ok, false); }
  finally {
    await pool.query('DROP VIEW editorial_publications; DROP TABLE hidden_publications');
  }
  await resetEditorial();
  await pool.query(`CREATE ROLE editorial_reader LOGIN PASSWORD 'fixture-only-reader';
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO editorial_reader;
    REVOKE SELECT ON editorial_publications FROM editorial_reader`);
  try {
    const result = await check({ env: { TIMEWEB_DATABASE_URL: url.replace(
      'preflight_test:fixture-password', 'editorial_reader:fixture-only-reader') } });
    assert.equal(result.ok, false);
    assert.doesNotMatch(result.output, /fixture-only-reader|permission denied/);
  } finally {
    await pool.query('DROP OWNED BY editorial_reader; DROP ROLE editorial_reader');
  }
});

test('missing table or required column fails closed instead of treating database as fresh', async () => {
  await pool.query('ALTER TABLE public.web_wishlists DROP COLUMN created_at');
  assert.equal((await check()).ok, false);
  await pool.query('DROP TABLE public.web_wishlists');
  assert.equal((await check()).ok, false);
});

test('incompatible column types, nullable keys and missing defaults fail', async () => {
  await pool.query('ALTER TABLE public.web_wishlists ALTER COLUMN user_id DROP NOT NULL');
  assert.equal((await check()).ok, false);
  await pool.query('ALTER TABLE public.web_wishlists ALTER COLUMN user_id SET NOT NULL');
  await pool.query('ALTER TABLE public.web_wishlists ALTER COLUMN created_at DROP DEFAULT');
  assert.equal((await check()).ok, false);
  await pool.query('ALTER TABLE public.web_wishlists ALTER COLUMN created_at SET DEFAULT now()');
  await pool.query('ALTER TABLE public.web_wishlists ALTER COLUMN user_id TYPE text');
  assert.equal((await check()).ok, false);
});

test('index name alone does not suffice: check uniqueness, keys, predicate and expression', async () => {
  const definitions = [
    '', // absent
    `CREATE INDEX ${indexName} ON public.web_wishlists (user_id, product_id)`,
    `CREATE UNIQUE INDEX ${indexName} ON public.web_wishlists (product_id, user_id)`,
    `CREATE UNIQUE INDEX ${indexName} ON public.web_wishlists (user_id, id)`,
    `CREATE UNIQUE INDEX ${indexName} ON public.web_wishlists (user_id, product_id, id)`,
    `CREATE UNIQUE INDEX ${indexName} ON public.web_wishlists (user_id, product_id) INCLUDE (id)`,
    `CREATE UNIQUE INDEX ${indexName} ON public.web_wishlists (user_id, product_id) WHERE user_id <> ''`,
    `CREATE UNIQUE INDEX ${indexName} ON public.web_wishlists (lower(user_id), product_id)`,
    `CREATE TABLE public.other_wishlists (user_id varchar, product_id varchar);
     CREATE UNIQUE INDEX ${indexName} ON public.other_wishlists (user_id, product_id)`,
  ];
  for (const definition of definitions) {
    await pool.query(`DROP INDEX IF EXISTS public.${indexName}`);
    if (definition) await pool.query(definition);
    assert.equal((await check()).ok, false, definition || 'missing index');
  }
});

test('a failed concurrent index is invalid; duplicate diagnostic reports only aggregate counts', async () => {
  await pool.query(`DROP INDEX public.${indexName}`);
  await pool.query(`INSERT INTO public.web_wishlists (user_id, product_id)
    VALUES ('private-customer-marker', 'private-product-marker'), ('private-customer-marker', 'private-product-marker')`);
  await assert.rejects(pool.query(`CREATE UNIQUE INDEX CONCURRENTLY ${indexName}
    ON public.web_wishlists (user_id, product_id)`));
  assert.equal((await pool.query(`SELECT indisvalid FROM pg_index
    WHERE indexrelid = 'public.${indexName}'::regclass`)).rows[0].indisvalid, false);
  const before = (await pool.query('SELECT * FROM public.web_wishlists ORDER BY id')).rows;
  const result = await check({ countDuplicates: true });
  assert.equal(result.ok, false);
  assert.match(result.output, /duplicati=1; righe extra=1/);
  assert.doesNotMatch(result.output, /private-|fixture-password|postgresql:\/\//);
  assert.deepEqual((await pool.query('SELECT * FROM public.web_wishlists ORDER BY id')).rows, before);
});

test('a deferrable unique constraint is not a usable ON CONFLICT arbiter', async () => {
  await pool.query(`DROP INDEX public.${indexName}`);
  await pool.query(`ALTER TABLE public.web_wishlists ADD CONSTRAINT ${indexName}
    UNIQUE (user_id, product_id) DEFERRABLE INITIALLY IMMEDIATE`);
  assert.equal((await check()).ok, false);
});

test('insufficient permissions block the check rather than assuming readiness', async () => {
  await pool.query("CREATE ROLE preflight_no_access LOGIN PASSWORD 'fixture-restricted-password'");
  try {
    const target = url.replace('preflight_test:fixture-password',
      'preflight_no_access:fixture-restricted-password');
    const result = await check({ env: { TIMEWEB_DATABASE_URL: target } });
    assert.equal(result.ok, false);
    assert.doesNotMatch(result.output, /fixture-restricted-password|permission denied/);
  } finally {
    await pool.query('DROP ROLE preflight_no_access');
  }
});

test('missing or malformed TIMEWEB URL never falls back to workspace or Neon', async () => {
  for (const value of [undefined, '', 'not-a-url', 'postgresql:///postgres',
    `${url}&options=-c%20default_transaction_read_only=off`,
    `${url}&host=wrong-host`]) {
    let clients = 0;
    class UnexpectedClient { constructor() { clients++; throw new Error('must not connect'); } }
    const result = await check({ env: {
      TIMEWEB_DATABASE_URL: value, DATABASE_URL: url, NEON_DATABASE_URL: url,
    }, Client: UnexpectedClient });
    assert.equal(result.ok, false);
    assert.equal(clients, 0);
  }
});

test('wrong database and unreachable server fail without secret/error details', async () => {
  for (const target of [url.replace('/postgres?', '/database_does_not_exist?'),
    url.replace(/:\d+\//, `:${await unusedPort()}/`)]) {
    const result = await check({ env: { TIMEWEB_DATABASE_URL: target, DATABASE_URL: url, NEON_DATABASE_URL: url } });
    assert.equal(result.ok, false);
    assert.match(result.output, /Push bloccato/);
    assert.doesNotMatch(result.output, /fixture-password|database_does_not_exist|127\.0\.0\.1|ECONNREFUSED/);
  }
});

test('an arbitrary driver error cannot disclose a connection URL', async () => {
  class BadClient {
    on() {}
    async connect() { throw new Error(`${url} private-customer-marker`); }
    async query() { throw new Error(url); }
    async end() { throw new Error(url); }
  }
  const result = await check({ Client: BadClient });
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.output, /fixture-password|private-customer-marker|postgresql:\/\//);
});

test('blocked schema lock fails within the short lock timeout', async () => {
  const blocker = await pool.connect();
  try {
    await blocker.query('BEGIN');
    await blocker.query('LOCK TABLE public.web_wishlists IN ACCESS EXCLUSIVE MODE');
    const start = Date.now();
    assert.equal((await check()).ok, false);
    assert.ok(Date.now() - start < 6000);
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
  }
});

test('both push helpers block before git/curl; ready target allows mocked outbound commands only', async () => {
  const bin = join(directory, 'bin');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(bin);
  const marker = join(directory, 'outbound');
  for (const name of ['git', 'curl']) {
    await writeFile(join(bin, name), `#!/bin/sh
printf '%s\\n' '${name}' >> "$OUTBOUND_MARKER"
if [ '${name}' = 'curl' ]; then printf '%s' '{"sha":"mock-sha"}'; fi
`, { mode: 0o700 });
  }
  for (const script of ['push-github.sh', 'push-dockerfile.sh']) {
    for (const target of ['', url.replace('/postgres?', '/wrong_database?'), url]) {
      await rm(marker, { force: true });
      const env = { ...cleanEnv(), PATH: `${bin}:${process.env.PATH}`,
        TIMEWEB_DATABASE_URL: target, DATABASE_URL: url, NEON_DATABASE_URL: url,
        GITHUB_PERSONAL_ACCESS_TOKEN: 'private-token-marker', OUTBOUND_MARKER: marker };
      let result;
      try {
        result = await exec('bash', [resolve('scripts', script)], { env });
        assert.equal(target, url, 'only a ready target may reach outbound commands');
      } catch (error) {
        assert.notEqual(target, url, 'ready target should pass');
        result = error;
      }
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, /private-token-marker|fixture-password|postgresql:\/\//);
      if (target === url) assert.match(await readFile(marker, 'utf8'), /git|curl/);
      else await assert.rejects(readFile(marker), { code: 'ENOENT' });
    }
  }
  // Even with a valid connection, a missing index must block before any push.
  await pool.query(`DROP INDEX public.${indexName}`);
  for (const script of ['push-github.sh', 'push-dockerfile.sh']) {
    await rm(marker, { force: true });
    await assert.rejects(exec('bash', [resolve('scripts', script)], { env: {
      ...cleanEnv(), PATH: `${bin}:${process.env.PATH}`, TIMEWEB_DATABASE_URL: url,
      GITHUB_PERSONAL_ACCESS_TOKEN: 'private-token-marker', OUTBOUND_MARKER: marker,
    } }));
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
  }
});

test('CLI works from another directory and returns nonzero for invalid options', async () => {
  const script = resolve('scripts/check-timeweb-compatibility.mjs');
  const env = { ...cleanEnv(), TIMEWEB_DATABASE_URL: url };
  await exec(process.execPath, [script], { cwd: tmpdir(), env });
  await assert.rejects(exec(process.execPath, [script, '--unknown'], { env }));
});
