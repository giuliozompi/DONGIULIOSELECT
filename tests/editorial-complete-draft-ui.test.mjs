import assert from 'node:assert/strict';
import { test } from 'node:test';
import { launchBrowser } from './helpers/browser.mjs';
import { mkdir, writeFile } from 'node:fs/promises';

test('complete cheese draft previews sources, photo and map, then deepens only history without publishing', {
  skip: !process.env.REPLIT_DEV_DOMAIN, timeout: 90000,
}, async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const id = '12121212-1212-4212-8212-121212121212';
  const first = '34343434-3434-4434-8434-343434343434';
  const second = '56565656-5656-4565-8565-565656565656';
  const url = 'https://example.org/pecorino-romano';
  const photo = 'https://photo-fixture.example.test/pecorino.jpg';
  const region = 'Лацио';
  let entry = { id, kind: 'cheese', revision: 1, createdAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z', publication: null, data: {
      title: 'Пекорино Романо', nameOriginal: 'Pecorino Romano', country: 'Италия',
      region, status: 'draft', description: '', history: '', characteristics: '', culinaryUses: '',
      sources: [], photos: [], latitude: null, longitude: null, productIds: [], videoIds: [],
      externalVideoUrls: [], productionCountry: '', sortOrder: 0,
    } };
  const source = { url, finalUrl: url, title: 'Consorzio Pecorino Romano',
    retrievedAt: '2026-01-01T12:00:00.000Z', sha256: 'a'.repeat(64), characters: 1000, truncated: false };
  const report = { provider: 'brave', queries: ['Pecorino Romano history'],
    failures: [], warnings: [], searchedAt: '2026-01-01T12:00:00.000Z', photos: [{
      id: 'pecorino-photo', imageUrl: photo, sourceUrl: url, label: 'Pecorino Romano',
      licenseUrl: 'https://example.org/license',
    }] };
  const lookup = { lookupId: '78787878-7878-4787-8787-787878787878', entryId: id, revision: 1,
    query: 'Roma, Italia', cached: false, attribution: '© OpenStreetMap contributors',
    retrievedAt: '2026-01-01T12:00:00.000Z', candidates: [{
      id: 'relation/41485', label: 'Roma, Lazio, Italia', type: 'administrative',
      latitude: 41.8933203, longitude: 12.4829321, url: 'https://www.openstreetmap.org/relation/41485',
    }] };
  const fields = { description: 'Итальянский овечий сыр.',
    history: 'История сыра восходит к римской эпохе.', country: 'Италия',
    region, characteristics: 'Сыр из овечьего молока.', culinaryUses: 'Используют в римской кухне.' };
  const full = { id: first, kind: 'draft', status: 'ready', revision: 2, model: 'fixture-model',
    createdAt: '2026-01-01T12:00:00.000Z', finishedAt: '2026-01-01T12:00:05.000Z',
    params: { entryId: id, revision: 1, sources: [], research: true, fullDraft: true },
    result: { fields, sources: [source], citations: [], warnings: [], research: report, origin: lookup },
    error: null, appliedTo: null };
  const revised = { ...full, id: second, revision: 1,
    params: { ...full.params, revision: 2, fullDraft: false,
      intent: { mode: 'deepen', field: 'history', previousRunId: first } },
    result: { fields: { history: 'История углублена по проверяемой странице.' }, sources: [source],
      citations: [], warnings: [], research: { ...report, photos: [] } } };
  const requests = [], transfers = [], exceptions = [];
  page.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails.text));
  await page.send('Network.enable');
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `if ('serviceWorker' in navigator) navigator.serviceWorker.register = async () => ({}); window.confirm = () => true;`,
  });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*/web-api/*' }, { urlPattern: '*/api/*' },
    { urlPattern: '*telegram.org/js/telegram-web-app.js*' }, { urlPattern: 'https://photo-fixture.example.test/*' },
    { urlPattern: 'https://www.openstreetmap.org/export/embed.html*' }] });
  page.on('Fetch.requestPaused', async event => {
    const path = new URL(event.request.url).pathname;
    if (path.endsWith('/export/embed.html')) {
      await page.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/html' }], body: Buffer.from('<p>Map fixture</p>').toString('base64') }); return;
    }
    if (new URL(event.request.url).hostname === 'photo-fixture.example.test') {
      await page.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'image/png' }],
        body: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l4sAAAAASUVORK5CYII=' }); return;
    }
    let body = [], status = 200;
    if (path === '/web-api/auth/refresh')
      body = { accessToken: 'isolated-token', user: { id: 'fixture-operator', firstName: 'Fixture', email: 'fixture@example.invalid' } };
    else if (path === '/web-api/admin/check') body = { ok: true, isMasterAdmin: true };
    else if (path === '/web-api/admin/editorial') body = { items: [entry], total: 1 };
    else if (path === '/web-api/admin/editorial-ai/history') body = { items: [full], total: 1, page: 1, limit: 10 };
    else if (path === '/web-api/admin/editorial-ai/research') {
      requests.push(JSON.parse(event.request.postData));
      body = requests.length === 1 ? full : revised;
    } else if (path === `/web-api/admin/editorial-ai/runs/${first}`) body = full;
    else if (path === `/web-api/admin/editorial-ai/runs/${second}`) body = revised;
    else if (path.endsWith('/apply')) {
      const request = JSON.parse(event.request.postData);
      transfers.push(request);
      if (transfers.length === 1) {
        assert.equal(request.origin?.lookupId, lookup.lookupId);
        assert.equal(request.origin?.candidateId, lookup.candidates[0].id);
        assert.deepEqual(request.photoIds, ['pecorino-photo']);
        assert.equal(request.photoRightsConfirmed, true);
        assert.equal(request.fields.includes('history'), true);
        full.appliedTo = { entryId: id, revision: 2 };
        entry = { ...entry, revision: 2, data: { ...entry.data, ...fields,
          photos: [photo], sources: [url, lookup.candidates[0].url],
          latitude: lookup.candidates[0].latitude, longitude: lookup.candidates[0].longitude,
          status: 'pending_review', aiResearch: { runId: first, searchedAt: report.searchedAt,
            transferredAt: '2026-01-01T12:10:00.000Z' },
        } };
      } else {
        assert.deepEqual(request.fields, ['history']);
        assert.equal(request.origin, undefined);
        assert.equal(request.photoIds, undefined);
        entry = { ...entry, revision: 3, data: { ...entry.data,
          history: revised.result.fields.history, status: 'pending_review' } };
      }
      body = entry;
    } else if (event.request.method !== 'GET') throw new Error(`Unexpected mutation ${path}`);
    await page.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify(body)).toString('base64') });
  });
  const click = async id => page.evaluate(`document.querySelector('[data-testid="${id}"]').click()`);
  try {
    await page.send('Page.navigate', { url: `https://${process.env.REPLIT_DEV_DOMAIN}/web/admin/cheeses` });
    await page.wait(`!!document.querySelector('[data-testid="ai-draft-entry-${id}"]')`);
    await click(`ai-research-toggle-${id}`);
    assert.equal(requests.length, 0);
    await click('ai-full-draft-research');
    await page.wait(`!!document.querySelector('[data-testid="ai-draft-apply"]')`);
    assert.equal(requests.length, 1); assert.equal(requests[0].fullDraft, true);
    assert.equal(transfers.length, 0);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-integrated-preview"]').innerText.includes('История сыра восходит')`), false, 'unselected proposal does not overwrite article preview');
    await click('ai-draft-select-all');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-integrated-preview"]').innerText.includes('История сыра восходит')`), true);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-integrated-preview"]').innerText.includes('Координаты происхождения')`), false);
    await page.evaluate(`document.querySelector('[data-testid="ai-photo-select-pecorino-photo"]').click()`);
    await page.evaluate(`document.querySelector('[data-testid="ai-photo-rights-confirm"]').click()`);
    await page.evaluate(`document.querySelector('[data-testid="ai-draft-origin-candidates"] input[type="radio"]').click()`);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-integrated-preview"] iframe')?.getAttribute('src').includes('marker=41.8933203')`), true);
    assert.equal(transfers.length, 0);
    if (process.env.EDITORIAL_REVIEW_SCREENSHOT_DIR) {
      const directory = process.env.EDITORIAL_REVIEW_SCREENSHOT_DIR;
      await mkdir(directory, { recursive: true });
      for (const [name, width, height] of [['desktop', 1280, 950], ['mobile', 390, 844]]) {
        await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: name === 'mobile' });
        await page.evaluate(`document.querySelector('[data-testid="ai-integrated-preview"]').scrollIntoView({block:'start'})`);
        const screenshot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(`${directory}/${name}.png`, Buffer.from(screenshot.data, 'base64'));
        assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, `${name} draft preview fits without horizontal overflow`);
      }
      await page.send('Emulation.clearDeviceMetricsOverride');
    }
    await click('ai-draft-apply');
    await page.wait(`!!document.querySelector('[data-testid="ai-transfer-confirm"]')`);
    assert.equal(transfers.length, 0);
    await click('ai-transfer-confirm');
    await page.wait(`!!document.querySelector('[data-testid="editorial-entry-editor"][data-state="open"]')`);
    assert.equal(transfers.length, 1);
    assert.equal(await page.evaluate(`document.querySelector('#ed-status').value`), 'pending_review');
    assert.equal(await page.evaluate(`document.querySelector('#ed-latitude').value`), '41.8933203');
    assert.equal(await page.evaluate(`document.querySelector('#ed-photos').value`), photo);
    await page.evaluate(`([...document.querySelectorAll('[data-testid="editorial-entry-editor"][data-state="open"] button')].find(button=>button.textContent.trim()==='Отмена')).click()`);
    await page.wait(`!document.querySelector('[data-testid="editorial-entry-editor"][data-state="open"]')`);
    await click(`ai-research-toggle-${id}`);
    await page.wait(`!!document.querySelector('[data-testid="ai-deepen-history"]')`);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-deepen-history"]').disabled`), false);
    await click('ai-deepen-history');
    await page.wait(`!!document.querySelector('[data-testid="ai-proposal-history"]')`);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].intent?.mode, 'deepen');
    assert.equal(requests[1].intent?.field, 'history');
    assert.equal(requests[1].intent?.previousRunId, first);
    assert.equal(requests[1].revision, 2);
    await page.wait(`!!document.querySelector('[data-testid="ai-proposal-history"]')`);
    await page.evaluate(`document.querySelector('[data-testid="ai-proposal-history"]').closest('article').querySelector('input[type="checkbox"]').click()`);
    await click('ai-draft-apply');
    await click('ai-transfer-confirm');
    await page.wait(`document.querySelector('[data-testid="editorial-entry-editor"][data-state="open"] #ed-history')?.value.includes('История углублена')`);
    assert.equal(transfers.length, 2);
    assert.equal(entry.data.characteristics, fields.characteristics);
    assert.equal(entry.data.culinaryUses, fields.culinaryUses);
    assert.equal(entry.data.photos[0], photo);
    assert.equal(entry.publication, null);
    await page.evaluate(`([...document.querySelectorAll('[data-testid="editorial-entry-editor"][data-state="open"] button')].find(button=>button.textContent.trim()==='Отмена')).click()`);
    await page.wait(`!document.querySelector('[data-testid="editorial-entry-editor"][data-state="open"]')`);
    await click(`ai-research-toggle-${id}`);
    await page.wait(`!!document.querySelector('[data-testid="ai-alternative-full-draft"]')`);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-alternative-full-draft"]').disabled`), false);
    await click('ai-alternative-full-draft');
    await page.wait(`!document.querySelector('[data-testid="ai-full-draft-research"]').disabled`);
    assert.equal(requests.length, 3);
    assert.equal(requests[2].fullDraft, true);
    assert.equal(requests[2].revision, 3);
    assert.equal(requests[2].intent?.mode, 'alternative');
    assert.equal(requests[2].intent?.previousRunId, second);
    assert.equal(transfers.length, 2, 'alternative research never overwrites the saved article on its own');
    assert.equal(entry.data.history, revised.result.fields.history);
    assert.deepEqual(exceptions, []);
  } finally { await browser.close(); }
});
