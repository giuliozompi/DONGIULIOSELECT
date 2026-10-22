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
    CREATE TABLE public.web_wishlists (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id varchar NOT NULL, product_id varchar NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX ${indexName} ON public.web_wishlists (user_id, product_id);
  `);
});
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
