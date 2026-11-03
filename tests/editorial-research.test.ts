import assert from 'node:assert/strict';
import { test, before, after, beforeEach } from 'node:test';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import express from 'express';
import type { Server } from 'node:http';
import { registerAdminEditorialAiRoutes } from '../server/adminEditorialAiRoutes';
import { reserveAiRun, executeAiRun, getAiRun } from '../server/services/editorial-ai';
import { applyAiDraft } from '../server/services/editorial-ai-changes';
import { researchEditorialSources, searchEditorialWeb, editorialSourceMatchesCheese } from '../server/services/editorial-ai-research';
import { fetchOriginCandidates, originProviderSettings } from '../server/services/editorial-origin-provider';
import { lookupEditorialOrigin, applyEditorialOrigin } from '../server/services/editorial-origin';
import { EditorialError, saveEditorial } from '../server/services/editorial';
import { changePublication } from '../server/services/editorial-publication';
import { EditorialModelError } from '../server/services/editorial-ai-config';
import { EditorialSourceError } from '../server/services/editorial-ai-sources';
import { cheeseDataSchema } from '../shared/editorial';
import type { DraftResult } from '../shared/editorial-ai';

const exec = promisify(execFile);
let dir: string, db: pg.Pool, server: Server, base: string;
const sensitive = 'PRIVATE_NEVER_SEND_OR_LOG';
const identity = { title: 'Кастельманьо', nameOriginal: 'Castelmagno', country: 'Италия', region: 'Пьемонт' };
const text = 'Castelmagno cheese is traditionally produced in Piemonte, Italy. Its history dates to documented medieval references. '.repeat(4);
const source = async (url: string) => ({
  url, finalUrl: url, title: 'Official cheese source', text, retrievedAt: new Date().toISOString(),
  sha256: 'test-fixture', characters: text.length, truncated: false,
});
const candidate = {
  id: 'relation/123', label: 'Castelmagno, Piemonte, Italia', type: 'administrative',
  latitude: 44.407, longitude: 7.212, url: 'https://www.openstreetmap.org/relation/123',
};
const hit = (n: number) => ({ url: `https://example.org/source-${n}`, title: `Consorzio Castelmagno ${n}`, description: 'History and origin' });
const parameters = (entry: { id: string; revision: number }) => ({
  requestId: randomUUID(), entryId: entry.id, revision: entry.revision, sources: [], research: true,
});
const fails = (status: number) => (error: unknown) => error instanceof EditorialError && error.status === status;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'editorial-research-'));
  await exec('initdb', ['-D', join(dir, 'data'), '-U', 'editorial_test', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
  await exec('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'postgres.log'), '-o', `-k ${dir} -p 55475 -h ''`, '-w', 'start']);
  db = new pg.Pool({ host: dir, port: 55475, user: 'editorial_test', database: 'postgres', password: '', ssl: false, max: 8 });
  await db.query(`CREATE TABLE products(id varchar PRIMARY KEY);
    CREATE TABLE admin_action_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),admin_user_id varchar NOT NULL,
      action_type text NOT NULL,entity_type text NOT NULL,entity_id varchar,action_data jsonb NOT NULL);`);
  for (const file of ['editorial-admin.sql', 'editorial-publication.sql', 'editorial-ai.sql'])
    await db.query(await readFile(`migrations/${file}`, 'utf8'));
  const app = express(); app.use(express.json());
  registerAdminEditorialAiRoutes(app, [
    (req, res, next) => req.headers.authorization ? next() : void res.sendStatus(401),
    (req, res, next) => req.headers.authorization === 'admin' ? next() : void res.sendStatus(403),
  ], () => 'operator', db);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}/web-api/admin/editorial-ai`;
}, { timeout: 30000 });
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await db?.end();
  if (dir) { await exec('pg_ctl', ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop']).catch(() => {}); await rm(dir, { recursive: true, force: true }); }
});
beforeEach(async () => {
  await db.query('TRUNCATE editorial_ai_imports,editorial_ai_runs,editorial_publications,editorial_entries,admin_action_logs');
});
async function cheese(published = false) {
  let entry = await saveEditorial('cheese', cheeseDataSchema.parse({
    ...identity, description: sensitive, history: 'Old history', characteristics: 'Old characteristics',
    culinaryUses: 'Old uses', photos: ['https://example.org/photo.jpg'], sources: ['https://example.org/original'],
    latitude: 40, longitude: 10, productionCountry: 'Россия', status: published ? 'ready' : 'draft',
  }), 'operator', undefined, db);
  if (published) entry = await changePublication(entry.id, entry.revision, true, 'operator', db);
  return entry;
}
test('Brave uses the direct fixed endpoint and credential, one request, bounded results, no private URLs', async () => {
  let calls = 0;
  const results = await searchEditorialWeb('Castelmagno history', { BRAVE_API_KEY: 'fixture-key' }, async (url, init) => {
    calls++;
    const parsed = new URL(String(url));
    assert.equal(parsed.origin, 'https://api.search.brave.com');
    assert.equal(parsed.pathname, '/res/v1/web/search');
    assert.equal(parsed.searchParams.get('operators'), 'false');
    assert.equal(new Headers(init?.headers).get('X-Subscription-Token'), 'fixture-key');
    assert.equal(init?.redirect, 'error');
    return new Response(JSON.stringify({ web: { results: [
      hit(1), { ...hit(2), url: 'http://example.org/' }, { ...hit(3), url: 'https://127.0.0.1/' },
    ] } }), { status: 200 });
  });
  assert.equal(calls, 1); assert.deepEqual(results, [hit(1)]);
  await assert.rejects(searchEditorialWeb('test', {}, async () => { throw new Error('must not call'); }), /BRAVE_API_KEY/);
});
for (const status of [401, 402, 403, 429, 503]) {
  test(`Brave ${status} is sanitized and never retried`, async () => {
    let calls = 0;
    await assert.rejects(searchEditorialWeb('test', { BRAVE_API_KEY: 'fixture' }, async () => {
      calls++; return new Response(sensitive, { status });
    }), error => error instanceof EditorialModelError && !error.message.includes(sensitive) && error.message.includes(String(status)));
    assert.equal(calls, 1);
  });
}
test('research limits search to three queries and reading to nine candidates, tolerates failed sources and deduplicates', async () => {
  let searches = 0, reads = 0, active = 0, maxActive = 0;
  const found = await researchEditorialSources(identity, [], {
    search: async () => { searches++; return Array.from({ length: 5 }, (_, n) => hit(n + (searches - 1) * 5)); },
    source: async url => {
      reads++; active++; maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 2)); active--;
      if (url.endsWith('0')) throw new EditorialSourceError('example.org: HTTP 404');
      return source(url);
    },
  }, async () => {});
  assert.equal(searches, 3); assert.ok(reads <= 9); assert.ok(maxActive <= 3);
  assert.equal(found.sources.length, 6); assert.equal(found.report.failures.length, 1);
  assert.match(found.report.failures[0].reason, /404/);
});
test('provider failure stops further search calls and preserves readable manual sources', async () => {
  let calls = 0;
  const found = await researchEditorialSources(identity, ['https://example.org/manual'], {
    search: async () => { calls++; throw new EditorialModelError('Brave Search: HTTP 403'); }, source,
  }, async () => {});
  assert.equal(calls, 1); assert.equal(found.sources.length, 1);
  assert.match(found.report.warnings.join(' '), /403/);
});
test('research rejects unrelated consortia before fetching and checks actual content after redirects', async () => {
  const reads: string[] = [];
  const unrelated = 'https://www.tripadvisor.com/Maniago_Consorzio_Coltellinai';
  const redirected = 'https://example.org/castelmagno';
  const found = await researchEditorialSources(identity, ['https://example.org/manual-unrelated'], {
    search: async () => [
      { url: unrelated, title: 'Consorzio Coltellinai Maniago', description: 'Official consortium' },
      { url: redirected, title: 'Castelmagno DOP', description: 'Formaggio' }, hit(1),
    ],
    source: async url => {
      reads.push(url);
      if (url === redirected || url.includes('manual-unrelated'))
        return { ...await source(url), finalUrl: 'https://example.org/knives', text: 'Consorzio Coltellinai Maniago. Handmade knives.' };
      return source(url);
    },
  }, async () => {});
  assert.ok(!reads.includes(unrelated));
  assert.equal(reads.length, 3);
  assert.deepEqual(found.sources.map(item => item.url), [hit(1).url]);
  assert.match(found.report.warnings.join(' '), /название выбранного сыра/);
  assert.match(found.report.warnings.join(' '), /в тексте не подтверждена связь/);
});
test('topic matching supports original and Russian names, accents and designations, not homonyms or partial names', async () => {
  const evidence = await source('https://example.org/source');
  const matches = (body: string, name = identity) => editorialSourceMatchesCheese({ ...evidence, text: body }, name);
  assert.equal(matches('Кастельманьо — итальянский сыр.'), true);
  assert.equal(matches('Il formaggio Castelmagno DOP è prodotto in Piemonte.'), true);
  assert.equal(matches('Le fromage Comté est produit dans le Jura.', { ...identity, nameOriginal: 'Comté AOP' }), true);
  assert.equal(matches('Castelmagno is a mountain municipality, with hiking trails.'), false);
  assert.equal(matches('Castelmagnolia cheese from a different place.'), false);
  assert.equal(matches('A cheese shop in Maniago. A consortium makes knives.'), false);
});
test('no model is called when all readable research pages are off topic', async () => {
  const entry = await cheese(), run = (await reserveAiRun('draft', parameters(entry), 'operator', db)).run;
  let models = 0;
  await executeAiRun(run.id, db, {
    source: async url => ({ ...await source(url), text: 'A consortium of knife makers in Maniago.' }),
    search: async () => [hit(1)], pause: async () => {},
    model: async () => { models++; return {}; },
  });
  const failed = await getAiRun(run.id, db);
  assert.equal(failed.status, 'failed'); assert.equal(models, 0);
  const result = failed.result as DraftResult;
  assert.equal(result.sources.length, 0);
  assert.match(result.warnings.join(' '), /в тексте не подтверждена связь/);
});
test('research run is idempotent, source-based, review-only, warns on missing fields, and preserves publication', async () => {
  const entry = await cheese(true), params = parameters(entry);
  const first = await reserveAiRun('draft', params, 'operator', db);
  const duplicate = await reserveAiRun('draft', params, 'operator', db);
  assert.equal(duplicate.created, false); assert.equal(duplicate.run.id, first.run.id);
  let searches = 0, models = 0;
  await executeAiRun(first.run.id, db, {
    source, pause: async () => {},
    search: async query => { searches++; assert.ok(!query.includes(sensitive)); return [hit(searches)]; },
    model: async (system, input) => {
      models++; assert.match(system, /history/);
      assert.ok(!JSON.stringify(input).includes(sensitive));
      return { fields: { history: 'Документированная история.' }, citations: [{ field: 'history', sourceIndex: 0, passageId: 0 }], warnings: [] };
    },
  });
  const ready = await getAiRun(first.run.id, db), result = ready.result as DraftResult;
  assert.equal(ready.status, 'ready'); assert.equal(searches, 3); assert.equal(models, 1);
  assert.equal(result.research?.queries.length, 3);
  assert.match(result.warnings.join(' '), /зона происхождения/);
  assert.equal((await db.query('SELECT revision FROM editorial_entries WHERE id=$1', [entry.id])).rows[0].revision, entry.revision);
  const publication = (await db.query('SELECT data FROM editorial_publications WHERE entry_id=$1', [entry.id])).rows[0].data;
  assert.equal(publication.history, 'Old history');
  await assert.rejects(reserveAiRun('draft', parameters(entry), 'operator', db), fails(429));
  const applied = await applyAiDraft(ready.id, { entryId: entry.id, revision: entry.revision, fields: ['history'] }, 'operator', db);
  assert.equal(applied.data.productionCountry, 'Россия'); assert.equal(applied.data.latitude, 40);
  assert.equal(applied.data.status, 'draft');
  assert.equal((await db.query('SELECT data FROM editorial_publications WHERE entry_id=$1', [entry.id])).rows[0].data.history, 'Old history');
});
test('model failure keeps search results without storing raw pages, changing the entry, or retrying', async () => {
  const entry = await cheese(), run = (await reserveAiRun('draft', parameters(entry), 'operator', db)).run;
  let calls = 0;
  await executeAiRun(run.id, db, { source, search: async () => [hit(1)], pause: async () => {},
    model: async () => { calls++; throw new EditorialModelError('AI вернул некорректный JSON'); } });
  const failed = await getAiRun(run.id, db);
  assert.equal(failed.status, 'failed'); assert.equal(calls, 1);
  assert.equal((failed.result as DraftResult).sources.length, 1);
  assert.ok(!JSON.stringify(failed.result).includes(text));
});
test('zero readable sources skip the model and preserve source diagnostics', async () => {
  const entry = await cheese(), run = (await reserveAiRun('draft', parameters(entry), 'operator', db)).run;
  let models = 0;
  await executeAiRun(run.id, db, { source: async () => { throw new EditorialSourceError('example.org: HTTP 404'); },
    search: async () => [hit(1)], pause: async () => {}, model: async () => { models++; return {}; } });
  const failed = await getAiRun(run.id, db);
  assert.equal(failed.status, 'failed'); assert.equal(models, 0);
  assert.match((failed.result as DraftResult).research!.failures[0].reason, /404/);
});
test('manual drafts skip failed sources, preserve source order and remap citations without searching or retries', async () => {
  const entry = await cheese(true);
  const urls = ['https://bad.example.org/cheese', 'https://example.org/second', 'https://example.org/third'];
  const run = await reserveAiRun('draft', {
    requestId: randomUUID(), entryId: entry.id, revision: entry.revision, sources: urls,
  }, 'operator', db);
  const reads: string[] = []; let models = 0, searches = 0;
  await executeAiRun(run.run.id, db, {
    source: async url => {
      reads.push(url);
      if (url === urls[0]) throw new EditorialSourceError('bad.example.org: Страница не найдена (HTTP 404).');
      const evidence = await source(url);
      return { ...evidence, text: `${url.endsWith('third') ? 'Third' : 'Second'} source. ${text}` };
    },
    search: async () => { searches++; return []; },
    model: async (_system, input) => {
      models++;
      const pages = (input as any).sources;
      assert.deepEqual(pages.map((p: any) => p.url), urls.slice(1));
      assert.match(pages[1].passages[0].text, /Third source/);
      return { fields: { history: 'Проверенная история.' },
        citations: [{ field: 'history', sourceIndex: 1, passageId: 0 }], warnings: [] };
    },
  });
  const ready = await getAiRun(run.run.id, db), result = ready.result as DraftResult;
  assert.equal(ready.status, 'ready'); assert.equal(models, 1); assert.equal(searches, 0);
  assert.deepEqual(reads, urls);
  assert.deepEqual(result.sources.map(s => s.url), urls.slice(1));
  assert.match(result.warnings.join(' '), /Источник пропущен — bad\.example\.org: Страница не найдена/);
  assert.equal(result.citations[0].sourceIndex, 1); assert.match(result.citations[0].quote, /Third source/);
  assert.equal(result.research, undefined);
  assert.equal((await db.query('SELECT revision FROM editorial_entries WHERE id=$1', [entry.id])).rows[0].revision, entry.revision);
  assert.equal((await db.query('SELECT published_revision FROM editorial_publications WHERE entry_id=$1', [entry.id])).rows[0].published_revision, entry.revision);
});
test('manual drafts with no readable sources keep safe diagnostics and never call AI or Brave', async () => {
  const entry = await cheese();
  const urls = ['https://bad.example.org/cheese', 'https://other.example.org/cheese'];
  const run = await reserveAiRun('draft', {
    requestId: randomUUID(), entryId: entry.id, revision: entry.revision, sources: urls,
  }, 'operator', db);
  let reads = 0, paid = 0;
  await executeAiRun(run.run.id, db, {
    source: async () => { reads++; throw new Error(sensitive); },
    search: async () => { paid++; return []; },
    model: async () => { paid++; return {}; },
  });
  const failed = await getAiRun(run.run.id, db), result = failed.result as DraftResult;
  assert.equal(failed.status, 'failed'); assert.equal(reads, 2); assert.equal(paid, 0);
  assert.match(failed.error || '', /Среди выбранных источников нет читаемых страниц/);
  assert.match(failed.error || '', /Найти источники и подготовить текст/);
  assert.match(failed.error || '', /bad\.example\.org/);
  assert.equal(result.sources.length, 0); assert.equal(result.warnings.length, 2);
  assert.ok(!JSON.stringify(failed).includes(sensitive));
});
test('manual drafts reject generic homepages even with relevant URL/title and never call paid services', async () => {
  const entry = await cheese(true);
  const urls = ['https://example.org/Castelmagno', 'https://bad.example.org/cheese'];
  const run = (await reserveAiRun('draft', {
    requestId: randomUUID(), entryId: entry.id, revision: entry.revision, sources: urls,
  }, 'operator', db)).run;
  let reads = 0, models = 0, searches = 0;
  await executeAiRun(run.id, db, {
    source: async url => {
      reads++;
      if (url === urls[1]) throw new EditorialSourceError('bad.example.org: HTTP 403');
      return { ...await source(url), finalUrl: 'https://example.org/home',
        title: 'Castelmagno cheese producer', text: 'Our family dairy welcomes visitors. Explore our cheese catalogue and contact details.' };
    },
    model: async () => { models++; return {}; },
    search: async () => { searches++; return []; },
  });
  const failed = await getAiRun(run.id, db), result = failed.result as DraftResult;
  assert.equal(failed.status, 'failed'); assert.equal(reads, 2);
  assert.equal(models, 0); assert.equal(searches, 0);
  assert.match(failed.error || '', /AI не вызван/);
  assert.match(result.warnings.join(' '), /Источник исключён — example\.org/);
  assert.match(result.warnings.join(' '), /Источник пропущен — bad\.example\.org/);
  assert.equal(result.sources.length, 0);
  assert.ok(!JSON.stringify(result).includes('Our family dairy'));
  assert.equal((await db.query('SELECT revision FROM editorial_entries WHERE id=$1', [entry.id])).rows[0].revision, entry.revision);
  assert.equal((await db.query('SELECT published_revision FROM editorial_publications WHERE entry_id=$1', [entry.id])).rows[0].published_revision, entry.revision);
});
test('manual drafts keep relevant content only, remap citations and do not require original name when Russian name is supported', async () => {
  const entry = await cheese();
  const urls = ['https://example.org/home', 'https://example.org/actual-cheese'];
  const run = (await reserveAiRun('draft', {
    requestId: randomUUID(), entryId: entry.id, revision: entry.revision, sources: urls,
  }, 'operator', db)).run;
  let models = 0, reads = 0, searches = 0;
  await executeAiRun(run.id, db, {
    source: async url => {
      reads++;
      return { ...await source(url), text: url === urls[0] ? 'Welcome to our dairy cheese shop.' :
        'Кастельманьо — итальянский сыр из Пьемонта. Его история описана в документах региона. '.repeat(3) };
    },
    search: async () => { searches++; return []; },
    model: async (_system, input) => {
      models++;
      assert.deepEqual((input as any).sources.map((page: any) => page.url), [urls[1]]);
      return { fields: { history: 'История описана в документах региона.' },
        citations: [{ field: 'history', sourceIndex: 0, passageId: 0 }], warnings: [] };
    },
  });
  const ready = await getAiRun(run.id, db), result = ready.result as DraftResult;
  assert.equal(ready.status, 'ready'); assert.equal(models, 1);
  assert.equal(reads, 2); assert.equal(searches, 0);
  assert.deepEqual(result.sources.map(page => page.url), [urls[1]]);
  assert.equal(result.citations[0].sourceIndex, 0);
  assert.match(result.citations[0].quote, /Кастельманьо/);
  assert.match(result.warnings.join(' '), /Источник исключён/);
});
test('manual source warnings and readable metadata survive model failure without persisting raw text', async () => {
  const entry = await cheese();
  const urls = ['https://bad.example.org/cheese', 'https://example.org/readable'];
  const run = await reserveAiRun('draft', {
    requestId: randomUUID(), entryId: entry.id, revision: entry.revision, sources: urls,
  }, 'operator', db);
  let models = 0;
  await executeAiRun(run.run.id, db, {
    source: async url => {
      if (url === urls[0]) throw new EditorialSourceError('Не удалось получить публичный источник.');
      return source(url);
    },
    model: async () => { models++; throw new EditorialModelError('Fixture model failure'); },
    search: async () => { throw new Error('Manual mode must never search'); },
  });
  const failed = await getAiRun(run.run.id, db), result = failed.result as DraftResult;
  assert.equal(failed.status, 'failed'); assert.equal(models, 1);
  assert.equal(result.sources.length, 1); assert.equal(result.sources[0].url, urls[1]);
  assert.match(result.warnings.join(' '), /bad\.example\.org/);
  assert.ok(!JSON.stringify(result).includes('Its history dates'));
  assert.ok(result.sources.every(s => !('text' in s)));
  await executeAiRun(run.run.id, db, { source, model: async () => { models++; return {}; } });
  assert.equal(models, 1);
});
test('Nominatim request identifies the app, filters country and rejects invalid coordinate data', async () => {
  let calls = 0;
  const candidates = await fetchOriginCandidates('Castelmagno, Италия', 'it', originProviderSettings({}), async (url, init) => {
    calls++;
    assert.equal(new URL(String(url)).searchParams.get('countrycodes'), 'it');
    assert.match(new Headers(init?.headers).get('User-Agent')!, /dongiulioselect\.ru/);
    assert.equal(init?.redirect, 'error');
    return new Response(JSON.stringify([
      { osm_type: 'relation', osm_id: 123, display_name: candidate.label, lat: '44.407', lon: '7.212', type: 'administrative', address: { country_code: 'it' } },
      { osm_type: 'node', osm_id: 999, display_name: 'Wrong country', lat: '40', lon: '7', address: { country_code: 'fr' } },
      { osm_type: 'way', osm_id: 111, display_name: 'Bad coordinates', lat: '999', lon: '7', address: { country_code: 'it' } },
    ]));
  });
  assert.deepEqual(candidates, [candidate]); assert.equal(calls, 1);
  assert.throws(() => originProviderSettings({ EDITORIAL_GEOCODER_DISABLED: 'true' }), fails(503));
  assert.throws(() => originProviderSettings({ EDITORIAL_GEOCODER_URL: 'https://127.0.0.1/' }));
});
test('geocoding caches across operators, throttles uncached calls globally, applies only saved selections and never publishes', async () => {
  const entry = await cheese(true);
  let calls = 0;
  const provider = async () => { calls++; return [candidate]; };
  const body = { entryId: entry.id, revision: entry.revision, place: 'Castelmagno' };
  const first = await lookupEditorialOrigin(body, 'operator', db, provider, {});
  const cached = await lookupEditorialOrigin(body, 'operator-2', db, provider, {});
  assert.equal(cached.cached, true); assert.equal(calls, 1);
  assert.notEqual(cached.lookupId, first.lookupId); assert.equal(cached.retrievedAt, first.retrievedAt);
  await assert.rejects(lookupEditorialOrigin({ ...body, place: 'Other place' }, 'operator-2', db, provider, {}), fails(429));
  await assert.rejects(applyEditorialOrigin({ ...body, place: undefined, lookupId: first.lookupId, candidateId: 'forged' }, 'operator', db));
  await assert.rejects(applyEditorialOrigin({ entryId: entry.id, revision: entry.revision, lookupId: first.lookupId, candidateId: 'forged' }, 'operator', db), fails(400));
  const saved = await applyEditorialOrigin({ entryId: entry.id, revision: entry.revision, lookupId: first.lookupId, candidateId: candidate.id }, 'operator', db);
  assert.equal(saved.data.latitude, candidate.latitude); assert.equal(saved.data.longitude, candidate.longitude);
  assert.equal(saved.data.productionCountry, 'Россия'); assert.equal(saved.data.status, 'draft');
  assert.ok(saved.data.sources.includes(candidate.url));
  assert.equal((await db.query('SELECT data FROM editorial_publications WHERE entry_id=$1', [entry.id])).rows[0].data.latitude, 40);
  await assert.rejects(applyEditorialOrigin({ entryId: entry.id, revision: entry.revision, lookupId: first.lookupId, candidateId: candidate.id }, 'operator', db), fails(409));
});
test('geocoding network failures are sanitized and consume the global reservation without retries', async () => {
  const entry = await cheese(); let calls = 0;
  const body = { entryId: entry.id, revision: entry.revision, place: 'Castelmagno' };
  const provider = async () => { calls++; throw new Error(sensitive); };
  await assert.rejects(lookupEditorialOrigin(body, 'operator', db, provider, {}), error =>
    error instanceof EditorialError && !error.message.includes(sensitive));
  await assert.rejects(lookupEditorialOrigin(body, 'operator', db, provider, {}), fails(429));
  assert.equal(calls, 1);
});
test('parallel geocoding reservations allow only one new external call across operators', async () => {
  const entry = await cheese(); let calls = 0;
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const provider = async () => { calls++; await wait; return [candidate]; };
  const body = { entryId: entry.id, revision: entry.revision, place: 'Castelmagno' };
  const first = lookupEditorialOrigin(body, 'operator', db, provider, {});
  while (!calls) await new Promise(resolve => setTimeout(resolve, 2));
  await assert.rejects(lookupEditorialOrigin({ ...body, place: 'Other' }, 'operator-2', db, provider, {}), fails(429));
  release(); await first; assert.equal(calls, 1);
});
test('late geographic responses and cross-entry selections cannot overwrite an edited article', async () => {
  const entry = await cheese();
  const body = { entryId: entry.id, revision: entry.revision, place: 'Castelmagno' };
  await assert.rejects(lookupEditorialOrigin(body, 'operator', db, async () => {
    await saveEditorial('cheese', { ...entry.data, history: 'New operator history' }, 'operator',
      { id: entry.id, revision: entry.revision }, db);
    return [candidate];
  }, {}), fails(409));
  const current = (await db.query('SELECT data,revision FROM editorial_entries WHERE id=$1', [entry.id])).rows[0];
  assert.equal(current.data.history, 'New operator history'); assert.equal(current.data.latitude, 40);
  await db.query(`DELETE FROM admin_action_logs WHERE action_type='origin_lookup_requested'`);
  const fresh = await lookupEditorialOrigin({ ...body, revision: current.revision }, 'operator', db, async () => [candidate], {});
  const other = await cheese();
  await assert.rejects(applyEditorialOrigin({
    entryId: other.id, revision: other.revision, lookupId: fresh.lookupId, candidateId: candidate.id,
  }, 'operator', db), fails(409));
  await assert.rejects(applyEditorialOrigin({
    entryId: entry.id, revision: current.revision, lookupId: fresh.lookupId,
    candidateId: candidate.id, latitude: 0, longitude: 0,
  }, 'operator', db));
});
test('geographic cache expiry uses original retrieval time, not the most recent cache hit', async () => {
  const entry = await cheese(); let calls = 0;
  const body = { entryId: entry.id, revision: entry.revision, place: 'Castelmagno' };
  const provider = async () => { calls++; return [candidate]; };
  const original = await lookupEditorialOrigin(body, 'operator', db, provider, {});
  const cached = await lookupEditorialOrigin(body, 'operator-2', db, provider, {});
  assert.equal(cached.retrievedAt, original.retrievedAt);
  await db.query(`UPDATE admin_action_logs SET action_data=jsonb_set(action_data,'{newData,fetchedAt}',
    to_jsonb((extract(epoch FROM clock_timestamp())*1000-2678400000)::bigint))
    WHERE action_type='origin_lookup_ready'`);
  await db.query("DELETE FROM admin_action_logs WHERE action_type='origin_lookup_requested'");
  const renewed = await lookupEditorialOrigin(body, 'operator-2', db, provider, {});
  assert.equal(renewed.cached, false); assert.equal(calls, 2);
});
test('research and origin endpoints reject guests, customers and forged request data before external requests', async () => {
  for (const path of ['/research', '/origin-geocoding', '/origin-geocoding/apply']) {
    for (const [auth, status] of [[undefined, 401], ['customer', 403], ['admin', 400]] as const) {
      const response = await fetch(base + path, { method: 'POST', headers: {
        'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}),
      }, body: JSON.stringify({ forged: true }) });
      assert.equal(response.status, status);
    }
  }
});
