import assert from 'node:assert/strict';
import { test } from 'node:test';
import { launchBrowser } from './helpers/browser.mjs';

test('published cheeses have a compact selectable list and searchable origin filter on desktop and mobile', {
  skip: !process.env.REPLIT_DEV_DOMAIN, timeout: 90000,
}, async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const requests = [], mutations = [], errors = [];
  const date = '2026-11-24T08:00:00Z';
  const entries = Array.from({ length: 24 }, (_, i) => ({
    id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`, kind: 'cheese', revision: 1,
    publication: { publishedAt: date, publishedRevision: 1 }, createdAt: date, updatedAt: date,
    data: { title: `Сыр ${String(i).padStart(2, '0')}`, nameOriginal: `Cheese ${i}`, description: 'Описание сыра',
      history: 'История', characteristics: 'Коровье молоко', culinaryUses: 'Использование',
      country: i === 23 ? 'Франция' : 'Италия', region: i === 23 ? 'Нормандия' : i === 22 ? 'Тоскана' : 'Пьемонт',
      productionCountry: 'Россия', latitude: 44, longitude: 7, status: 'ready', sortOrder: 0,
      photos: ['https://example.org/photo.jpg'], sources: ['https://example.org/source'],
      productIds: [], videoIds: [], externalVideoUrls: [], productionPoints: [] },
  }));
  const origins = [
    { country: 'Италия', region: 'Пьемонт', count: 22 },
    { country: 'Италия', region: 'Тоскана', count: 1 },
    { country: 'Франция', region: 'Нормандия', count: 1 },
  ];
  try {
    page.on('Runtime.exceptionThrown', event => errors.push(event.exceptionDetails.text));
    await page.send('Network.enable');
    await page.send('Network.setBypassServiceWorker', { bypass: true });
    await page.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `if ('serviceWorker' in navigator) navigator.serviceWorker.register=async()=>({}); window.confirm=()=>true;`,
    });
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*/web-api/*' }, { urlPattern: 'https://tile.openstreetmap.org/*' }] });
    page.on('Fetch.requestPaused', async event => {
      const url = new URL(event.request.url), path = url.pathname, method = event.request.method;
      let response = [], status = 200;
      if (path === '/web-api/auth/refresh') response = { accessToken: 'published-list-fixture', user: { id: 'fixture', firstName: 'Fixture' } };
      else if (path === '/web-api/admin/check') response = { ok: true, isMasterAdmin: true };
      else if (path === '/web-api/admin/editorial' && method === 'GET') {
        requests.push(Object.fromEntries(url.searchParams));
        const published = url.searchParams.get('stage') === 'published';
        const country = url.searchParams.get('originCountry'), region = url.searchParams.get('originRegion');
        const filtered = published ? entries.filter(item => (!country || item.data.country === country) &&
          (region === null || item.data.region === region)) : [];
        const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 20);
        response = { items: filtered.slice(offset, offset + limit), total: filtered.length, ...(published ? { origins } : {}) };
      } else if (path.startsWith('/web-api/admin/editorial/') && method === 'PATCH') {
        const payload = JSON.parse(event.request.postData), id = path.split('/').at(-1);
        mutations.push(payload);
        const found = entries.find(item => item.id === id);
        found.data = payload.data;
        found.revision++;
        response = found;
      } else if (path === '/web-api/admin/editorial-ai/batches') response = { eligibleCount: 0, active: false, latest: null, history: [] };
      else if (method !== 'GET' && path !== '/web-api/auth/refresh') {
        mutations.push({ unexpected: path }); status = 500; response = { error: 'Unexpected fixture write' };
      }
      await page.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: status,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify(response)).toString('base64') });
    });
    await page.send('Page.navigate', { url: `https://${process.env.REPLIT_DEV_DOMAIN}/web/admin/cheeses` });
    await page.click('[data-testid="cheese-stage-published"]');
    const list = '[data-testid="published-cheese-list"]', editor = '[data-testid="editorial-entry-editor"]';
    await page.wait(`document.querySelectorAll('${list} li').length === 20`);
    assert.equal(await page.evaluate(`!!document.querySelector('${editor}')`), false);
    assert.equal(await page.evaluate(`!!document.querySelector('${list} textarea, ${list} [data-testid="editorial-draft-batch"]')`), false);
    assert.ok(await page.evaluate(`document.querySelector('${list}').textContent.includes('Пьемонт')`));
    const clickText = (scope, text) => page.evaluate(`Array.from(document.querySelectorAll('${scope} button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
    await clickText('body', 'Далее');
    await page.wait(`document.querySelector('${list}')?.textContent.includes('Сыр 23')`);
    await page.click('[data-testid="published-origin-filter"]');
    await page.fill('[cmdk-input]', 'Тоскана');
    await page.wait(`document.querySelectorAll('[cmdk-item]:not([hidden])').length === 1`);
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await page.wait(`document.querySelectorAll('${list} li').length === 1 && document.querySelector('${list}').textContent.includes('Сыр 22')`);
    const filtered = requests.at(-1);
    assert.equal(filtered.offset, '0', 'origin selection resets the page');
    assert.equal(filtered.originCountry, 'Италия');
    assert.equal(filtered.originRegion, 'Тоскана');
    await page.wait(`(() => {
      const row=document.querySelector('[data-testid="published-cheese-${entries[22].id}"]');
      row.scrollIntoView({block:'center',behavior:'instant'});
      const r=row.getBoundingClientRect();
      return row.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
    })()`);
    await page.click(`[data-testid="published-cheese-${entries[22].id}"]`);
    await page.wait(`!!document.querySelector('${editor} #ed-title')`);
    assert.equal(await page.evaluate(`document.querySelector('${editor} #ed-title').value`), 'Сыр 22');
    assert.ok(await page.evaluate(`document.querySelector('${editor}').textContent.includes('Снять с публикации')`));
    await page.fill('#ed-title', 'Сыр 22 — проверен');
    await page.click('[data-testid="button-editorial-save-top"]');
    await page.wait(`!document.querySelector('${editor}')`);
    await page.wait(`document.querySelector('${list}')?.textContent.includes('Сыр 22 — проверен')`);
    assert.equal(mutations.length, 1);
    assert.equal(mutations[0].publish, undefined, 'normal editing does not republish');
    assert.equal(requests.at(-1).originRegion, 'Тоскана', 'save preserves the origin selection');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    assert.ok(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'));
    await page.click('[data-testid="published-origin-filter"]');
    await page.fill('[cmdk-input]', 'Нормандия');
    await page.wait(`document.querySelectorAll('[cmdk-item]:not([hidden])').length === 1`);
    await page.click('[cmdk-item]');
    await page.wait(`document.querySelector('${list}')?.textContent.includes('Сыр 23')`);
    assert.equal(requests.at(-1).originCountry, 'Франция');
    assert.ok(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'));
    await clickText('body', 'Сбросить фильтр');
    await page.wait(`document.querySelectorAll('${list} li').length === 20`);
    assert.equal(requests.at(-1).originCountry, undefined);
    await page.click('[data-testid="cheese-stage-drafts"]');
    await page.wait(`!document.querySelector('[data-testid="published-origin-filter"]')`);
    assert.equal(requests.at(-1).stage, 'drafts');
    assert.equal(requests.at(-1).originRegion, undefined);
    assert.deepEqual(errors, []);
  } catch (error) {
    console.log('Published list fixture diagnostic:', JSON.stringify({
      errors, body: await page.evaluate('document.body.innerText.slice(-5000)'),
      editor: await page.evaluate(`document.querySelector('[data-testid="editorial-entry-editor"]')?.innerHTML.slice(0,1500)`),
    }));
    throw error;
  } finally { await browser.close(); }
});
