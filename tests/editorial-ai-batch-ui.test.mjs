import assert from 'node:assert/strict';
import { test } from 'node:test';
import { launchBrowser } from './helpers/browser.mjs';

test('admin confirms draft count, reopens the queue and reviews a proposal without saving', {
  skip: !process.env.REPLIT_DEV_DOMAIN, timeout: 75000,
}, async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const id = '98989898-9898-4989-8989-989898989898';
  const date = '2026-11-19T12:00:00Z';
  const entry = {
    id, kind: 'cheese', revision: 1, publication: null, createdAt: date, updatedAt: date,
    data: {
      title: 'Кастельманьо', nameOriginal: 'Castelmagno', description: '', history: '',
      characteristics: '', culinaryUses: '', country: 'Италия', region: 'Пьемонт',
      status: 'draft', sortOrder: 0, photos: [], sources: [], latitude: null, longitude: null, productionPoints: [],
      productIds: [], videoIds: [], externalVideoUrls: [],
    },
  };
  const run = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', kind: 'draft', status: 'ready', revision: 2,
    model: 'fixture', createdAt: date, finishedAt: date, error: null, appliedTo: null,
    params: { entryId: id, revision: 1, sources: [], research: true, fullDraft: true },
    result: { fields: { history: 'История из фонового черновика' }, warnings: [], citations: [], sources: [] },
  };
  const starts = [], unexpected = [];
  let stage = 'idle', firstBatchId;
  const path = '/web-api/admin/editorial-ai/batches';
  try {
    await page.send('Network.enable');
    await page.send('Network.setBypassServiceWorker', { bypass: true });
    await page.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `if ('serviceWorker' in navigator) navigator.serviceWorker.register=async()=>({});`,
    });
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*/web-api/*' }, { urlPattern: 'https://tile.openstreetmap.org/*' }] });
    page.on('Fetch.requestPaused', async event => {
      const requestPath = new URL(event.request.url).pathname;
      const method = event.request.method;
      let response = [], responseCode = 200;
      if (requestPath === '/web-api/auth/refresh') response = { accessToken: 'batch-fixture', user: { id: 'fixture', firstName: 'Fixture' } };
      else if (requestPath === '/web-api/admin/check') response = { ok: true, isMasterAdmin: true };
      else if (requestPath === '/web-api/admin/editorial') {
        const kind = new URL(event.request.url).searchParams.get('kind');
        response = kind === 'cheese' ? { items: [entry], total: 1 } : { items: [], total: 0 };
      } else if (requestPath === path && method === 'GET') {
        const active = stage === 'running';
        response = { eligibleCount: stage === 'idle' ? 1 : 0, active, history: [], latest: stage === 'idle' ? null : {
          id: firstBatchId, finishedAt: active ? null : date, stoppedAt: null, page: 1, limit: 20, total: 1,
          counts: { running: active ? 1 : 0, ready: active ? 0 : 1, queued: 0, skipped: 0, failed: 0, cancelled: 0 },
          items: [{ entryId: id, title: entry.data.title, status: active ? 'running' : 'ready', detail: null }],
        } };
      } else if (requestPath === path && method === 'POST') {
        const payload = JSON.parse(event.request.postData);
        starts.push(payload);
        stage = 'running'; firstBatchId = payload.requestId;
        responseCode = 202; response = { id: firstBatchId };
      } else if (requestPath === `${path}/${firstBatchId}/review/${id}` && stage === 'ready') response = { entry, run };
      else if (method !== 'GET') unexpected.push(requestPath);
      await page.send('Fetch.fulfillRequest', {
        requestId: event.requestId, responseCode,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify(response)).toString('base64'),
      });
    });
    const panel = '[data-testid="editorial-draft-batch"]';
    const toggle = `${panel} > button`;
    const progress = '[data-testid="draft-batch-progress"]';
    await page.send('Page.navigate', { url: `https://${process.env.REPLIT_DEV_DOMAIN}/web/admin/cheeses` });
    await page.click(toggle);
    await page.click('[data-testid="draft-batch-review-start"]');
    await page.wait(`document.querySelector('#draft-batch-confirmation')?.textContent.includes('Статей: 1')`);
    assert.equal(starts.length, 0);
    await page.click('[data-testid="draft-batch-start"]');
    await page.wait(`document.querySelector('${progress}')?.textContent.includes('Очередь работает')`);
    assert.equal(starts.length, 1);
    assert.equal(starts[0].eligibleCount, 1);
    assert.equal(starts[0].confirmed, true);
    await page.evaluate('window.batchPageBeforeReload = true');
    stage = 'ready';
    await page.send('Page.reload', { ignoreCache: true });
    await page.wait(`!window.batchPageBeforeReload && document.querySelector('${toggle}')?.getAttribute('aria-expanded') === 'false'`);
    await page.click(toggle);
    await page.wait(`document.querySelector('${progress}')?.textContent.includes('Очередь завершена')`);
    await page.evaluate(`Array.from(document.querySelectorAll('${panel} button')).find(item => item.textContent.trim() === 'Открыть черновик').click()`);
    await page.wait(`document.querySelector('[data-testid="editorial-entry-editor"] #ed-history')?.value === 'История из фонового черновика'`);
    assert.equal(await page.evaluate(`document.querySelector('#ed-status').value`), 'pending_review');
    assert.deepEqual(unexpected, []);
  } finally { await browser.close(); }
});
