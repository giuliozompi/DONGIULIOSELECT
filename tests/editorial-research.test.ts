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
import { applyAiDraft, importAiPhotos } from '../server/services/editorial-ai-changes';
import { researchEditorialSources, searchEditorialWeb, editorialSourceMatchesCheese, editorialSourceCheeseMatch } from '../server/services/editorial-ai-research';
import { structuredResearchPlan, researchCoverage, editorialSourcePassages } from '../server/services/editorial-research-topics';
import { sourcePageImages, researchPhotos } from '../server/services/editorial-research-photos';
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
test('research limits search to five topic queries and reading to nine candidates, tolerates failed sources and deduplicates', async () => {
  let searches = 0, reads = 0, active = 0, maxActive = 0;
  const found = await researchEditorialSources(identity, [], {
    search: async () => { searches++; return Array.from({ length: 5 }, (_, n) => hit(n + (searches - 1) * 5)); },
    source: async url => {
      reads++; active++; maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 2)); active--;
      if (url.endsWith('/source-0')) throw new EditorialSourceError('example.org: HTTP 404');
      return source(url);
    },
  }, async () => {});
  assert.equal(searches, 5); assert.ok(reads <= 9); assert.ok(maxActive <= 3);
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
test('five bounded searches follow topics in the origin language instead of mixed generic phrases', () => {
  const plan = structuredResearchPlan(identity);
  assert.equal(plan.length, 5);
  assert.deepEqual(plan.map(item => item.topic), ['history', 'origin', 'characteristics', 'culinaryUses', 'photos']);
  assert.ok(plan.every(item => item.query.includes('Castelmagno formaggio Italia') && item.query.length <= 400));
  assert.match(plan[0].query, /storia/); assert.match(plan[1].query, /disciplinare/);
  assert.match(plan[0].query, /Wikipedia/);
  assert.match(plan[2].query, /stagionatura/); assert.match(plan[3].query, /ricette/);
  assert.match(plan[4].query, /foto/);
  assert.match(structuredResearchPlan({ ...identity, country: 'Франция', nameOriginal: 'Comté' })[0].query, /Comté fromage France histoire/);
  assert.match(structuredResearchPlan({ ...identity, country: 'Неизвестная страна' })[0].query, /cheese .*history/);
});
test('Wikipedia is retained as supplementary evidence within existing research budgets', async () => {
  let searches = 0, reads = 0;
  const wiki = 'https://it.wikipedia.org/wiki/Castelmagno_(formaggio)';
  const found = await researchEditorialSources(identity, [], {
    search: async () => {
      searches++;
      return [hit(searches), hit(searches + 10), hit(searches + 20),
        { url: wiki, title: 'Castelmagno (formaggio) — Wikipedia', description: 'Castelmagno cheese history' }];
    },
    source: async url => { reads++; return source(url); },
  }, async () => {});
  assert.equal(searches, 5);
  assert.ok(reads <= 9);
  assert.ok(found.sources.length <= 6);
  assert.ok(found.sources.some(item => item.finalUrl === wiki));
  assert.match(found.report.warnings.join(' '), /Wikipedia.*не официальный/);
});
test('blocked Wikipedia pages do not become evidence and do not prevent other sources', async () => {
  const wiki = 'https://ru.wikipedia.org/wiki/Castelmagno';
  const found = await researchEditorialSources(identity, [], {
    search: async () => [hit(1), { url: wiki, title: 'Castelmagno cheese', description: '' }],
    source: async url => {
      if (url === wiki) throw new EditorialSourceError('ru.wikipedia.org: HTTP 403');
      return source(url);
    },
  }, async () => {});
  assert.equal(found.sources.length, 1);
  assert.ok(!found.sources.some(item => item.finalUrl === wiki));
  assert.ok(found.report.failures.some(item => item.url === wiki));
});
test('coverage routes real numbered passages by topic and leaves missing subjects explicit', async () => {
  const evidence = { ...await source('https://example.org/history'),
    text: 'Castelmagno cheese history documented in medieval records. '.repeat(12) };
  const coverage = researchCoverage([evidence]);
  assert.equal(coverage.find(item => item.topic === 'history')!.status, 'evidence');
  assert.equal(coverage.find(item => item.topic === 'culinaryUses')!.status, 'missing');
  const history = coverage.find(item => item.topic === 'history')!.evidence[0];
  assert.equal(history.sourceIndex, 0);
  assert.ok(history.passageIds.every(id => editorialSourcePassages(evidence.text).some(p => p.id === id)));
  assert.ok(history.excerpt.length <= 360);
});
test('topic diversity keeps specific culinary and technical pages as well as institutional sources', async () => {
  const bodies = [
    'Castelmagno cheese history in medieval records.',
    'Castelmagno cheese traditional production territory in Piemonte, Italy.',
    'Castelmagno cheese milk texture taste aging technical specifications.',
    'Castelmagno cheese recipes cooking salads pairing.',
    'Castelmagno cheese photographs.',
  ];
  let searches = 0;
  const reads: string[] = [];
  const found = await researchEditorialSources(identity, [], {
    search: async () => {
      const index = searches++;
      return [
        { url: 'https://example.org/', title: 'Consorzio Castelmagno', description: 'Homepage' },
        { url: `https://example.org/topic-${index}`, title: 'Castelmagno cheese', description: bodies[index] },
      ];
    },
    source: async url => {
      reads.push(url);
      const index = Number(url.match(/topic-(\d)/)?.[1] ?? 0);
      return { ...await source(url), text: bodies[index].repeat(5) };
    },
  }, async () => {});
  assert.equal(searches, 5); assert.ok(reads.length <= 9);
  assert.ok(reads.indexOf('https://example.org/topic-3') < reads.indexOf('https://example.org/'));
  assert.ok(found.report.coverage!.every(topic => topic.status === 'evidence'));
  assert.ok(found.sources.some(page => page.url.endsWith('topic-3')));
});
test('photo candidates are actual safe HTML references, deduplicated, provenance-bound and not license-certified', async () => {
  const html = `<meta property="og:image" content="/photos/cheese.jpg?x=1&amp;y=2">
    <meta name="twitter:image" content="/photos/cheese.jpg?x=1&amp;y=2">
    <link rel="license" href="https://example.org/licence">
    <header><img src="/unrelated-navigation.jpg"></header>
    <main><img src="/photos/detail.jpg" alt="Castelmagno cheese" width="600" height="400">
    <img src="/logo.png"><img src="https://127.0.0.1/private.jpg"><img src="http://example.org/no.jpg">
    <img src="/tiny.jpg" width="1" height="1"><img src="data:image/png;base64,secret">
    <script>const fake='<img src="/not-real.jpg">'</script></main>`;
  const images = sourcePageImages(html, 'https://example.org/cheese');
  assert.deepEqual(images.map(image => image.url), [
    'https://example.org/photos/cheese.jpg?x=1&y=2', 'https://example.org/photos/detail.jpg',
  ]);
  assert.ok(images.every(image => image.licenseUrl === 'https://example.org/licence'));
  const photos = researchPhotos([{ ...await source('https://example.org/cheese'), images }]);
  assert.equal(photos.length, 2);
  assert.equal(photos[0].sourceUrl, 'https://example.org/cheese');
  assert.equal(photos[0].id, researchPhotos([{ ...await source('https://example.org/cheese'), images }])[0].id);
  assert.equal((photos[0] as any).rightsConfirmed, undefined);
});
test('Russian Italian-cheese names can match Italian body names without inventing an original name', async () => {
  for (const [title, original] of [
    ['Кастельманьо', 'Castelmagno'], ['Рикотта Салата', 'Ricotta salata'],
    ['Моцарелла', 'Mozzarella'], ['Пармиджано Реджано', 'Parmigiano Reggiano'],
    ['Буррата', 'Burrata'],
  ]) {
    const page = { ...await source('https://example.org/cheese'), text: `${original} è un formaggio italiano. Storia e caratteristiche.`.repeat(5) };
    const cheeseIdentity = { ...identity, title, nameOriginal: '' };
    assert.equal(editorialSourceCheeseMatch(page, cheeseIdentity), 'transcription', title);
    assert.equal(cheeseIdentity.nameOriginal, '', 'matching does not write a guessed original spelling');
    assert.equal(editorialSourceCheeseMatch(page, { ...cheeseIdentity, nameOriginal: original }), 'exact');
  }
});
test('transcription is bounded to missing Italian names and still rejects wrong bodies, domains and distant cheese mentions', async () => {
  const cheeseIdentity = { ...identity, nameOriginal: '' };
  const metadata = { ...await source('https://example.org/castelmagno'), title: 'Castelmagno formaggio' };
  for (const body of [
    'Castelmagno è un comune nella provincia di Cuneo. '.repeat(8),
    'Consorzio coltellinai di Maniago. Coltelli tradizionali. '.repeat(8),
    'CastelmagnoExtra formaggio italiano. '.repeat(8),
    `Castelmagno ${'Un paese con monti e sentieri. '.repeat(30)} Formaggio italiano.`,
    'Ricotta salata è un formaggio italiano. '.repeat(8),
  ]) assert.equal(editorialSourceMatchesCheese({ ...metadata, text: body }, cheeseIdentity), false);
  const page = { ...metadata, text: 'Castelmagno è un formaggio italiano. '.repeat(8) };
  assert.equal(editorialSourceMatchesCheese(page, { ...cheeseIdentity, country: 'Франция' }), false);
  assert.equal(editorialSourceMatchesCheese(page, { ...cheeseIdentity, nameOriginal: 'Comté' }), false, 'do not override an explicit original name');
});
for (const research of [false, true]) test(`missing native name still generates from an Italian body (${research ? 'Brave' : 'manual'} mode)`, async () => {
  const previous = await cheese();
  const entry = await saveEditorial('cheese', { ...previous.data, nameOriginal: '' }, 'operator', previous, db);
  const params = { ...parameters(entry), ...(research ? {} : { research: undefined }), sources: ['https://example.org/castelmagno'] };
  const run = (await reserveAiRun('draft', params, 'operator', db)).run;
  let searches = 0, models = 0;
  await executeAiRun(run.id, db, {
    source,
    search: async () => { searches++; return [{ url: 'https://example.org/castelmagno', title: 'Castelmagno: formaggio DOP', description: 'Storia e caratteristiche' }]; },
    pause: async () => {},
    model: async (_system, input) => {
      models++; assert.equal((input as any).cheese.nameOriginal, '');
      assert.ok(JSON.stringify(input).includes('Castelmagno'));
      return { fields: { history: 'Документированная история.' }, citations: [{ field: 'history', sourceIndex: 0, passageId: 0 }], warnings: [] };
    },
  });
  const ready = await getAiRun(run.id, db), result = ready.result as DraftResult;
  assert.equal(ready.status, 'ready', ready.error || '');
  assert.equal(searches, research ? 5 : 0); assert.equal(models, 1);
  assert.equal(result.sources.length, 1);
  assert.ok(result.warnings.some(warning => /транскрипции/.test(warning)));
  assert.equal((await db.query('SELECT data FROM editorial_entries WHERE id=$1', [entry.id])).rows[0].data.nameOriginal, '');
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
  assert.equal(ready.status, 'ready'); assert.equal(searches, 5); assert.equal(models, 1);
  assert.equal(result.research?.queries.length, 5);
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
async function readyPhotoDraft(published = false) {
  const entry = await cheese(published), params = parameters(entry);
  const run = (await reserveAiRun('draft', params, 'operator', db)).run;
  await executeAiRun(run.id, db, {
    source: async url => ({ ...await source(url), images: [
      { url: 'https://example.org/castelmagno-photo.jpg', alt: 'Castelmagno cheese' },
      { url: 'https://example.org/castelmagno-detail.jpg', alt: 'Castelmagno detail', licenseUrl: 'https://example.org/license' },
    ] }),
    search: async () => [hit(1)], pause: async () => {},
    model: async (_system, input) => {
      assert.equal((input as any).topicEvidence.length, 4);
      assert.ok(!(input as any).sources[0].images, 'the model does not author image suggestions');
      return { fields: { history: 'Документированная история.' },
        citations: [{ field: 'history', sourceIndex: 0, passageId: 0 }], warnings: [] };
    },
  });
  const ready = await getAiRun(run.id, db);
  assert.equal(ready.status, 'ready');
  return { entry, ready, photos: (ready.result as DraftResult).research!.photos! };
}
test('photos can be imported after text and later article edits without losing data or changing publication', async () => {
  const { entry, ready, photos } = await readyPhotoDraft(true);
  const text = await applyAiDraft(ready.id, {
    entryId: entry.id, revision: entry.revision, fields: ['history'],
  }, 'operator', db);
  const edited = await saveEditorial('cheese', { ...text.data, region: 'Revised region', latitude: 45.1, longitude: 7.2 },
    'operator', { id: entry.id, revision: text.revision }, db);
  const saved = await importAiPhotos(ready.id, {
    entryId: entry.id, revision: edited.revision, photoIds: [photos[0].id], photoRightsConfirmed: true,
  }, 'operator', db);
  assert.deepEqual(saved.data.photos, ['https://example.org/photo.jpg', photos[0].imageUrl]);
  assert.equal(saved.data.history, 'Документированная история.');
  assert.equal(saved.data.region, 'Revised region');
  assert.equal(saved.data.latitude, 45.1);
  assert.equal(saved.data.longitude, 7.2);
  assert.equal(saved.data.status, 'draft');
  assert.ok(saved.data.sources.includes(photos[0].sourceUrl));
  const pub = (await db.query('SELECT data FROM editorial_publications WHERE entry_id=$1', [entry.id])).rows[0].data;
  assert.deepEqual(pub.photos, ['https://example.org/photo.jpg']);
  const run = await getAiRun(ready.id, db);
  assert.deepEqual(run.appliedTo, { entryId: entry.id, revision: text.revision }, 'photo import does not reapply or rebase text');
  const duplicate = await importAiPhotos(ready.id, {
    entryId: entry.id, revision: saved.revision, photoIds: [photos[0].id], photoRightsConfirmed: true,
  }, 'operator', db);
  assert.equal(duplicate.revision, saved.revision);
  const logs = (await db.query("SELECT action_data FROM admin_action_logs WHERE entity_id=$1 AND action_type='ai_photos_imported'", [entry.id])).rows;
  assert.equal(logs.length, 1);
  assert.ok(JSON.stringify(logs).includes('"photoRightsConfirmed":true'));
});
test('independent photo import rejects stale revisions, forged URLs or IDs, wrong articles and absent rights', async () => {
  const { entry, ready, photos } = await readyPhotoDraft();
  const body = { entryId: entry.id, revision: entry.revision, photoIds: [photos[0].id], photoRightsConfirmed: true };
  await assert.rejects(importAiPhotos(ready.id, { ...body, revision: entry.revision + 1 }, 'operator', db), fails(409));
  await assert.rejects(importAiPhotos(ready.id, { ...body, photoIds: ['forged'] }, 'operator', db), fails(400));
  await assert.rejects(importAiPhotos(ready.id, { ...body, entryId: randomUUID() }, 'operator', db), fails(400));
  for (const invalid of [
    { ...body, photoRightsConfirmed: false }, { ...body, photoIds: [] },
    { ...body, photoIds: [photos[0].id, photos[0].id] }, { ...body, imageUrl: 'https://example.org/forged.jpg' },
  ]) await assert.rejects(importAiPhotos(ready.id, invalid, 'operator', db));
  await assert.rejects(importAiPhotos(ready.id, body, '', db), fails(401));
  await db.query("UPDATE editorial_ai_runs SET status='running' WHERE id=$1", [ready.id]);
  await assert.rejects(importAiPhotos(ready.id, body, 'operator', db), fails(409));
  await db.query("UPDATE editorial_ai_runs SET status='failed' WHERE id=$1", [ready.id]);
  await assert.rejects(importAiPhotos(ready.id, body, 'operator', db), fails(409));
  for (const auth of [undefined, 'customer']) {
    const response = await fetch(`${base}/runs/${ready.id}/photos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body),
    });
    assert.equal(response.status, auth ? 403 : 401);
  }
});
test('independent photo import does not consume an unapplied text proposal', async () => {
  const { entry, ready, photos } = await readyPhotoDraft();
  const response = await fetch(`${base}/runs/${ready.id}/photos`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', authorization: 'admin' },
    body: JSON.stringify({ entryId: entry.id, revision: entry.revision, photoIds: [photos[0].id], photoRightsConfirmed: true }),
  });
  assert.equal(response.status, 200);
  assert.ok((await response.json()).data.photos.includes(photos[0].imageUrl));
  assert.equal((await getAiRun(ready.id, db)).appliedTo, null);
});
test('independent photo import rejects unproven candidates and full galleries without partial writes', async () => {
  const { entry, ready, photos } = await readyPhotoDraft();
  const data = { ...entry.data, photos: Array.from({ length: 12 }, (_, index) => `https://example.org/existing-${index}.jpg`) };
  const full = await saveEditorial('cheese', data, 'operator', { id: entry.id, revision: entry.revision }, db);
  const body = { entryId: entry.id, revision: full.revision, photoIds: [photos[0].id], photoRightsConfirmed: true };
  await assert.rejects(importAiPhotos(ready.id, body, 'operator', db), fails(400));
  const proposal = ready.result as DraftResult;
  proposal.research!.photos![0].sourceUrl = 'https://example.org/not-read';
  await db.query('UPDATE editorial_ai_runs SET result=$2 WHERE id=$1', [ready.id, JSON.stringify(proposal)]);
  await assert.rejects(importAiPhotos(ready.id, body, 'operator', db), fails(400));
  const saved = (await db.query('SELECT revision,data FROM editorial_entries WHERE id=$1', [entry.id])).rows[0];
  assert.equal(saved.revision, full.revision);
  assert.deepEqual(saved.data.photos, data.photos);
});
test('selected photos append atomically with text, keep provenance, audit rights and never replace a publication', async () => {
  const { entry, ready, photos } = await readyPhotoDraft(true);
  const body = { entryId: entry.id, revision: entry.revision, fields: ['history'],
    photoIds: [photos[0].id], photoRightsConfirmed: true };
  const saved = await applyAiDraft(ready.id, body, 'operator', db);
  assert.deepEqual(saved.data.photos, ['https://example.org/photo.jpg', photos[0].imageUrl]);
  assert.equal(saved.data.history, 'Документированная история.');
  assert.ok(saved.data.sources.includes(photos[0].sourceUrl));
  assert.equal(saved.data.productionCountry, 'Россия');
  assert.equal(saved.data.status, 'draft');
  const pub = (await db.query('SELECT data FROM editorial_publications WHERE entry_id=$1', [entry.id])).rows[0].data;
  assert.deepEqual(pub.photos, ['https://example.org/photo.jpg']);
  assert.equal(pub.history, 'Old history');
  const retry = await applyAiDraft(ready.id, body, 'operator', db);
  assert.equal(retry.revision, saved.revision);
  const logs = (await db.query("SELECT action_data FROM admin_action_logs WHERE entity_id=$1 AND action_type='ai_applied'", [entry.id])).rows;
  assert.equal(logs.length, 1);
  assert.ok(JSON.stringify(logs).includes('"photoRightsConfirmed":true'));
  await assert.rejects(applyAiDraft(ready.id, { ...body, photoIds: [photos[1].id] }, 'operator', db), fails(409));
});
test('photo-only application requires rights, saved candidate IDs and the unchanged article revision', async () => {
  const { entry, ready, photos } = await readyPhotoDraft();
  const body = { entryId: entry.id, revision: entry.revision, fields: [],
    photoIds: [photos[0].id], photoRightsConfirmed: true };
  await assert.rejects(applyAiDraft(ready.id, { ...body, photoRightsConfirmed: false }, 'operator', db));
  await assert.rejects(applyAiDraft(ready.id, { ...body, photoIds: ['forged'] }, 'operator', db), fails(400));
  await assert.rejects(applyAiDraft(ready.id, { ...body, imageUrl: 'https://example.org/forged.jpg' }, 'operator', db));
  await assert.rejects(applyAiDraft(ready.id, { ...body, photoIds: [] }, 'operator', db));
  await assert.rejects(applyAiDraft(ready.id, { ...body, entryId: randomUUID() }, 'operator', db), fails(400));
  const saved = await applyAiDraft(ready.id, body, 'operator', db);
  assert.equal(saved.data.history, 'Old history');
  assert.ok(saved.data.photos.includes(photos[0].imageUrl));
  assert.equal(saved.revision, entry.revision + 1);
});
test('photos cannot be applied from an old revision or from candidates without saved source provenance', async () => {
  const { entry, ready, photos } = await readyPhotoDraft();
  const body = { entryId: entry.id, revision: entry.revision, fields: [],
    photoIds: [photos[0].id], photoRightsConfirmed: true };
  const result = ready.result as DraftResult;
  result.research!.photos![0].sourceUrl = 'https://example.org/not-read';
  await db.query('UPDATE editorial_ai_runs SET result=$2 WHERE id=$1', [ready.id, JSON.stringify(result)]);
  await assert.rejects(applyAiDraft(ready.id, body, 'operator', db), fails(400));
  await saveEditorial('cheese', { ...entry.data, history: 'Operator changed the article' }, 'other-operator', entry, db);
  await assert.rejects(applyAiDraft(ready.id, body, 'operator', db), fails(409));
});
test('failed model retains coverage and real candidate URLs without retrying or applying them', async () => {
  const entry = await cheese(), run = (await reserveAiRun('draft', parameters(entry), 'operator', db)).run;
  let models = 0;
  await executeAiRun(run.id, db, {
    source: async url => ({ ...await source(url), images: [{ url: 'https://example.org/real-photo.jpg', alt: 'Castelmagno' }] }),
    search: async () => [hit(1)], pause: async () => {},
    model: async () => { models++; throw new EditorialModelError('Model unavailable'); },
  });
  const failed = await getAiRun(run.id, db), result = failed.result as DraftResult;
  assert.equal(failed.status, 'failed'); assert.equal(models, 1);
  assert.equal(result.research!.coverage!.length, 4);
  assert.equal(result.research!.photos![0].imageUrl, 'https://example.org/real-photo.jpg');
  assert.ok(!(result.sources[0] as any).images, 'raw extractor metadata is not duplicated in source DTOs');
  assert.deepEqual((await db.query('SELECT data FROM editorial_entries WHERE id=$1', [entry.id])).rows[0].data.photos, ['https://example.org/photo.jpg']);
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
