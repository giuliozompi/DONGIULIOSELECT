import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createHmac } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../shared/schema';
import { saveWebTelegramLink, unlinkWebTelegram, telegramLinkCodeHandler } from '../server/services/web-telegram-link';
import { issueTelegramLinkCode, verifyTelegramLinkCode } from '../server/utils/telegram-link-code';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const testSecret = 'fixture-only-not-a-real-signing-key';
const exec = promisify(execFile);
let directory: string;
let pool: pg.Pool;
let database: ReturnType<typeof drizzle<typeof schema>>;
let server: ReturnType<ReturnType<typeof express>['listen']>;
let base: string;
let started = false;
let issued = 0;
let failRead = false;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'telegram-link-pg-'));
  await exec('initdb', ['-D', join(directory, 'data'), '-U', 'telegram_test', '-A', 'trust', '--no-locale']);
  await exec('pg_ctl', ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'),
    '-o', `-F -k ${directory} -h ''`, '-w', 'start']);
  started = true;
  pool = new pg.Pool({ host: directory, port: 5432, user: 'telegram_test', database: 'postgres', max: 12 });
  database = drizzle({ client: pool, schema });
  await pool.query(`CREATE TABLE web_users(id varchar PRIMARY KEY, telegram_user_id varchar,
    updated_at timestamp NOT NULL DEFAULT now())`);
  const app = express();
  app.get('/web-api/auth/telegram-link-code', (req, res, next) => {
    const owner = req.headers.authorization;
    if (!['owner-a', 'owner-b', 'missing'].includes(owner || '')) return res.sendStatus(401);
    (req as any).webUser = { sub: owner === 'owner-a' ? A : owner === 'owner-b' ? B : 'missing' };
    next();
  }, telegramLinkCodeHandler({
    loadProfile: async id => {
      if (failRead) throw new Error('Fixture read failure');
      return (await pool.query(`SELECT id,telegram_user_id AS "telegramUserId" FROM web_users WHERE id=$1`, [id])).rows[0];
    },
    issueCode: async id => {
      issued++;
      const code = issueTelegramLinkCode(id, testSecret);
      return { code, botUrl: `https://t.me/example_fixture_bot?start=link_${code}`,
        expiresAt: new Date(Date.now() + 600_000).toISOString() };
    },
  }));
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/web-api/auth/telegram-link-code`;
}, { timeout: 30000 });

after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await pool?.end();
  if (started) await exec('pg_ctl', ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop']);
  if (directory) await rm(directory, { recursive: true, force: true });
});
beforeEach(async () => {
  issued = 0; failRead = false;
  await pool.query('TRUNCATE web_users');
  await pool.query(`INSERT INTO web_users(id) VALUES($1),($2)`, [A, B]);
});
const getCode = (owner = 'owner-a', query = '') => fetch(base + query, { headers: owner ? { Authorization: owner } : {} });

test('code endpoint requires authentication and recognizes deleted profiles', async () => {
  assert.equal((await getCode('')).status, 401);
  assert.equal((await getCode('missing')).status, 404);
  assert.equal(issued, 0);
});

test('persisted linkage is returned without generating another code or trusting a query owner', async () => {
  await saveWebTelegramLink(A, '123456789', database);
  const response = await getCode('owner-a', `?userId=${B}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.deepEqual(data, { linked: true, telegramUserId: '123456789' });
  assert.equal(issued, 0);
});

test('a genuinely unlinked profile gets a usable short start parameter, not a false connected state', async () => {
  const data = await (await getCode()).json();
  assert.equal(data.linked, false);
  assert.equal(issued, 1);
  assert.ok(new URL(data.botUrl).searchParams.get('start')!.length <= 64);
  assert.equal(verifyTelegramLinkCode(data.code, testSecret), A);
  assert.equal((await pool.query('SELECT telegram_user_id FROM web_users WHERE id=$1', [A])).rows[0].telegram_user_id, null);
});

test('database verification errors never return unlinked state or issue another code', async () => {
  failRead = true;
  const response = await getCode();
  assert.equal(response.status, 500);
  assert.equal('linked' in await response.json(), false);
  assert.equal(issued, 0);
});

test('repeating the same successful linkage is idempotent and preserves its persisted state', async () => {
  assert.equal(await saveWebTelegramLink(A, '123456789', database), 'linked');
  const before = (await pool.query('SELECT updated_at FROM web_users WHERE id=$1', [A])).rows[0].updated_at;
  assert.equal(await saveWebTelegramLink(A, '123456789', database), 'already_linked');
  const after = (await pool.query('SELECT updated_at FROM web_users WHERE id=$1', [A])).rows[0].updated_at;
  assert.equal(+before, +after);
});

test('an existing link cannot be replaced silently or claimed by another web profile', async () => {
  await saveWebTelegramLink(A, '123456789', database);
  assert.equal(await saveWebTelegramLink(A, '987654321', database), 'profile_conflict');
  assert.equal(await saveWebTelegramLink(B, '123456789', database), 'telegram_conflict');
  assert.equal((await pool.query('SELECT telegram_user_id FROM web_users WHERE id=$1', [A])).rows[0].telegram_user_id, '123456789');
});

test('simultaneous profiles cannot claim the same Telegram ID', async () => {
  const results = await Promise.all([saveWebTelegramLink(A, '123456789', database), saveWebTelegramLink(B, '123456789', database)]);
  assert.deepEqual(results.sort(), ['linked', 'telegram_conflict']);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM web_users WHERE telegram_user_id=$1', ['123456789'])).rows[0].n, 1);
});

test('simultaneous Telegram IDs cannot overwrite one web profile', async () => {
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => saveWebTelegramLink(A, String(100000000 + i), database)));
  assert.equal(results.filter(result => result === 'linked').length, 1);
  assert.equal(results.filter(result => result === 'profile_conflict').length, 11);
});

test('only an explicit unlink permits a different Telegram account to replace the old one', async () => {
  await saveWebTelegramLink(A, '123456789', database);
  assert.equal(await unlinkWebTelegram(A, A, database), 'unlinked');
  assert.equal(await saveWebTelegramLink(A, '987654321', database), 'linked');
  assert.equal(await saveWebTelegramLink(B, '123456789', database), 'linked');
  assert.equal(await saveWebTelegramLink('missing', '555555555', database), 'profile_missing');
});

test('compact signed codes round-trip exact owner and reject tampering, expiry and future timestamps', () => {
  const now = Date.now();
  const code = issueTelegramLinkCode(A, testSecret, now);
  assert.ok(('link_' + code).length <= 64);
  assert.equal(verifyTelegramLinkCode(code, testSecret, now), A);
  assert.equal(verifyTelegramLinkCode(code, 'other-fixture-key', now), null);
  assert.equal(verifyTelegramLinkCode(code, testSecret, now + 600_001), null);
  assert.equal(verifyTelegramLinkCode(issueTelegramLinkCode(A, testSecret, now + 31_000), testSecret, now), null);
  assert.equal(verifyTelegramLinkCode(code.slice(0, 10) + '!' + code.slice(11), testSecret, now), null);
});

test('a previous account confirmation cannot unlink the newly authenticated account', async () => {
  await saveWebTelegramLink(B, '987654321', database);
  assert.equal(await unlinkWebTelegram(B, A, database), 'owner_mismatch');
  assert.equal(await unlinkWebTelegram(B, undefined, database), 'owner_mismatch');
  assert.equal((await pool.query('SELECT telegram_user_id FROM web_users WHERE id=$1', [B])).rows[0].telegram_user_id, '987654321');
});

test('previously issued signed commands remain valid for their original ten-minute lifetime', () => {
  const now = Date.now();
  const payload = `${A}:${now}`;
  const signature = createHmac('sha256', testSecret).update(payload).digest('hex').slice(0, 16);
  const legacy = Buffer.from(`${payload}:${signature}`).toString('base64url');
  assert.equal(verifyTelegramLinkCode(legacy, testSecret, now), A);
  assert.equal(verifyTelegramLinkCode(legacy, testSecret, now + 600_001), null);
});
