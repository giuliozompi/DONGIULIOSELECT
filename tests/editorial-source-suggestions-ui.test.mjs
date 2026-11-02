// Isolated browser fixtures: no real admin session, AI calls or database writes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { launchBrowser } from './helpers/browser.mjs';

test('operators see original names and explicitly select suggested sources without losing manual URLs', {
  skip: !process.env.REPLIT_DEV_DOMAIN, timeout: 90000,
}, async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const id = '11111111-1111-4111-8111-111111111111';
  const manual = 'https://example.org/operator-source';
  const data = {
    title: 'Пармиджано Реджано', nameOriginal: 'Parmigiano Reggiano', country: 'Италия',
    region: 'Эмилия-Романья', status: 'draft', description: '', sources: [manual],
    photos: [], videoIds: [], productIds: [], externalVideoUrls: [], sortOrder: 0,
    latitude: null, longitude: null, history: '', characteristics: '', culinaryUses: '', productionCountry: '',
  };
  const entry = { id, kind: 'cheese', revision: 1, data, publication: null,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
  const sources = [
    { url: 'https://www.parmigianoreggiano.com/', label: 'Консорциум', kind: 'consortium' },
    { url: 'https://www.latteriasoresina.it/', label: 'Кооператив', kind: 'cooperative' },
    { url: 'https://www.parmareggio.it/', label: 'Производитель', kind: 'producer' },
  ];
  let aiRequests = 0, draftRequests = 0;
  const exceptions = [];
  page.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails.text));
  await page.send('Network.enable');
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    if ('serviceWorker' in navigator) navigator.serviceWorker.register = async () => ({});
  ` });
  await page.send('Fetch.enable', { patterns: [
    { urlPattern: '*/web-api/*' }, { urlPattern: '*/api/*' },
    { urlPattern: '*telegram.org/js/telegram-web-app.js*' },
  ] });
  page.on('Fetch.requestPaused', async event => {
    const url = new URL(event.request.url);
    let body = [], status = 200;
    if (url.pathname === '/web-api/auth/refresh') body = {
      accessToken: 'isolated-test-token',
      user: { id: 'test-only-operator', firstName: 'Test', email: 'editorial@example.invalid' },
    };
    else if (url.pathname === '/web-api/admin/check') body = { ok: true, isMasterAdmin: true };
    else if (url.pathname === '/web-api/admin/editorial') body = {
      items: url.searchParams.get('kind') === 'cheese' ? [entry] : [],
      total: url.searchParams.get('kind') === 'cheese' ? 1 : 0,
    };
    else if (url.pathname === '/web-api/admin/editorial-ai/sources') {
      aiRequests++;
      assert.deepEqual(JSON.parse(event.request.postData), { entryId: id, revision: 1 });
      await delay(350);
      body = { sources, warnings: ['Предложения требуют проверки оператором.'] };
    } else if (url.pathname === '/web-api/admin/editorial-ai/draft') {
      draftRequests++; status = 503; body = { error: 'Test prevents real draft generation' };
    } else if (event.request.method !== 'GET' && url.pathname !== '/web-api/auth/refresh') {
      throw new Error(`Unexpected fixture mutation: ${url.pathname}`);
    }
    await page.send('Fetch.fulfillRequest', {
      requestId: event.requestId, responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: url.pathname.includes('telegram-web-app') ? 'text/javascript' : 'application/json' }],
      body: Buffer.from(url.pathname.includes('telegram-web-app') ? '' : JSON.stringify(body)).toString('base64'),
    });
  });
  const clickText = async text => {
    await page.evaluate(`(() => {
      const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});
      if(!button) throw Error('Missing button: '+${JSON.stringify(text)});
      button.click();
    })()`);
  };
  try {
    await page.send('Page.navigate', { url: `https://${process.env.REPLIT_DEV_DOMAIN}/web/admin/cheeses` });
    await page.wait(`!!document.querySelector('[data-testid="ai-draft-entry-${id}"]')`);
    assert.equal(await page.evaluate(`document.body.innerText.includes('Parmigiano Reggiano')`), true);
    await clickText('Подготовить с ИИ');
    assert.equal(aiRequests, 0);
    await page.evaluate(`(() => {const b=document.querySelector('[data-testid="ai-suggest-sources"]');b.click();b.click()})()`);
    await page.wait(`!!document.querySelector('section[aria-label="Предложенные источники"] input[type="checkbox"]')`);
    assert.equal(aiRequests, 1);
    assert.equal(draftRequests, 0);
    const scope = 'section[aria-label="Предложенные источники"]';
    assert.equal(await page.evaluate(`document.querySelectorAll('${scope} input:checked').length`), 0);
    assert.equal(await page.evaluate(`document.querySelector('#ai-sources-${id}').value`), manual);
    await page.evaluate(`document.querySelectorAll('${scope} input[type="checkbox"]').forEach(e=>e.click())`);
    // Only two more links fit. The third suggestion is disabled before it can be selected.
    assert.equal(await page.evaluate(`document.querySelectorAll('${scope} input[type="checkbox"]')[2].disabled`), true);
    assert.equal(await page.evaluate(`document.querySelectorAll('${scope} input:checked').length`), 2);
    await clickText('Добавить выбранные в источники');
    const selected = await page.evaluate(`document.querySelector('#ai-sources-${id}').value.split('\\n').filter(Boolean)`);
    assert.deepEqual(selected, [manual, sources[0].url, sources[1].url]);
    assert.equal(draftRequests, 0);
    assert.deepEqual(exceptions, []);
  } finally { await browser.close(); }
});
