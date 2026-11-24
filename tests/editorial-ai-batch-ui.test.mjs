import assert from 'node:assert/strict';
import { test } from 'node:test';
import { launchBrowser } from './helpers/browser.mjs';

test('admin queue keeps unsaved proposals and removes them after successful save, including on the final page', {
  skip: !process.env.REPLIT_DEV_DOMAIN, timeout: 75000,
}, async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const id = '98989898-9898-4989-8989-989898989898';
  const date = '2026-11-19T12:00:00Z';
  let entry = {
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
  const starts = [], applies = [], unexpected = [];
  let stage = 'idle', firstBatchId;
  const path = '/web-api/admin/editorial-ai/batches';
  const failed = { entryId: '77777777-7777-4777-8777-777777777777', title: 'Другая статья', status: 'failed', detail: 'Нет источников' };
  try {
    await page.send('Network.enable');
    await page.send('Network.setBypassServiceWorker', { bypass: true });
    await page.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `if ('serviceWorker' in navigator) navigator.serviceWorker.register=async()=>({}); window.confirm=()=>true;`,
    });
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*/web-api/*' }, { urlPattern: 'https://tile.openstreetmap.org/*' }] });
    page.on('Fetch.requestPaused', async event => {
      const url = new URL(event.request.url), requestPath = url.pathname;
      const method = event.request.method;
      let response = [], responseCode = 200;
      if (requestPath === '/web-api/auth/refresh') response = { accessToken: 'batch-fixture', user: { id: 'fixture', firstName: 'Fixture' } };
      else if (requestPath === '/web-api/admin/check') response = { ok: true, isMasterAdmin: true };
      else if (requestPath === '/web-api/admin/editorial') {
        const kind = new URL(event.request.url).searchParams.get('kind');
        response = kind === 'cheese' && stage !== 'ready' ? { items: [entry], total: 1 } : { items: [], total: 0 };
      } else if (requestPath === path && method === 'GET') {
        const active = stage === 'running';
        const saved = stage === 'saved';
        const batchPage = Number(url.searchParams.get('page') || 1);
        const rows = [failed, ...(saved ? [] : [{ entryId: id, title: entry.data.title, status: active ? 'running' : 'ready', detail: null }])];
        response = { eligibleCount: stage === 'idle' ? 2 : 0, active, history: [], latest: stage === 'idle' ? null : {
          id: firstBatchId, finishedAt: active ? null : date, stoppedAt: null, page: batchPage, limit: 1,
          total: 2, visibleTotal: rows.length,
          counts: { running: active ? 1 : 0, ready: stage === 'ready' ? 1 : 0, queued: 0, skipped: 0, failed: 1, cancelled: 0 },
          items: rows.slice(batchPage - 1, batchPage),
        } };
      } else if (requestPath === path && method === 'POST') {
        const payload = JSON.parse(event.request.postData);
        starts.push(payload);
        stage = 'running'; firstBatchId = payload.requestId;
        responseCode = 202; response = { id: firstBatchId };
      } else if (requestPath === `${path}/${firstBatchId}/review/${id}` && stage === 'ready') response = { entry, run };
      else if (requestPath === `/web-api/admin/editorial-ai/runs/${run.id}/apply` && method === 'POST') {
        const payload = JSON.parse(event.request.postData);
        applies.push(payload);
        if (applies.length === 1) { responseCode = 503; response = { error: 'Ошибка тестового сохранения' }; }
        else {
          stage = 'saved';
          entry = { ...entry, revision: 2, data: { ...payload.editorialData, aiResearch: {
            runId: run.id, searchedAt: date, transferredAt: date,
          } } };
          response = entry;
        }
      }
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
    await page.wait(`document.querySelector('#draft-batch-confirmation')?.textContent.includes('Статей: 2')`);
    assert.equal(starts.length, 0);
    await page.click('[data-testid="draft-batch-start"]');
    await page.wait(`document.querySelector('${progress}')?.textContent.includes('Очередь работает')`);
    assert.equal(starts.length, 1);
    assert.equal(starts[0].eligibleCount, 2);
    assert.equal(starts[0].confirmed, true);
    await page.evaluate('window.batchPageBeforeReload = true');
    stage = 'ready';
    await page.send('Page.reload', { ignoreCache: true });
    await page.wait(`!window.batchPageBeforeReload && document.querySelector('${toggle}')?.getAttribute('aria-expanded') === 'false'`);
    await page.click(toggle);
    await page.wait(`document.querySelector('${progress}')?.textContent.includes('Очередь завершена · 2 / 2')`);
    await page.wait(`!document.getElementById('entry-${id}')`);
    const editor = '[data-testid="editorial-entry-editor"]';
    const clickText = (scope, text) => page.evaluate(`Array.from(document.querySelectorAll('${scope} button')).find(item => item.textContent.trim() === ${JSON.stringify(text)}).click()`);
    const openDraft = async () => {
      await clickText(panel, 'Открыть черновик');
      await page.wait(`document.querySelector('${editor} #ed-history')?.value === 'История из фонового черновика'`);
    };
    await clickText(panel, 'Далее');
    await page.wait(`document.querySelector('${panel}')?.textContent.includes('Страница 2')`);
    await openDraft();
    assert.equal(await page.evaluate(`document.querySelector('#ed-status').value`), 'pending_review');
    await clickText(editor, 'Отмена');
    await page.wait(`!document.querySelector('${editor}')`);
    assert.equal(applies.length, 0);
    assert.equal(await page.evaluate(`!!document.getElementById('entry-${id}')`), false);
    await openDraft();
    await page.evaluate(`document.querySelector('[data-testid="ai-proposal-editorial-confirm"]').click()`);
    const save = () => page.evaluate(`document.querySelector('[data-testid="button-editorial-save-top"]').click()`);
    await save();
    await page.wait(`document.querySelector('${editor}')?.textContent.includes('Ошибка тестового сохранения')`);
    assert.equal(stage, 'ready');
    assert.equal(await page.evaluate(`!!document.getElementById('entry-${id}')`), false);
    await save();
    await page.wait(`!document.querySelector('${editor}')`);
    await page.wait(`document.querySelector('${panel}')?.textContent.includes('Другая статья')`);
    assert.equal(applies.length, 2);
    assert.equal(await page.evaluate(`document.querySelector('${panel}')?.textContent.includes('Открыть черновик')`), false);
    assert.equal(await page.evaluate(`document.querySelector('${panel}')?.textContent.includes('Страница 2')`), false);
    assert.equal(await page.evaluate(`document.querySelector('${progress}')?.textContent.includes('2 / 2')`), true);
    assert.equal(await page.evaluate(`document.getElementById('entry-${id}')?.textContent.includes('Ожидает подтверждения')`), true);
    assert.deepEqual(unexpected, []);
  } finally { await browser.close(); }
});
