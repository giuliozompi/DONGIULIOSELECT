import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser } from './helpers/browser.mjs';

test('editorial map focuses the origin country without changing saved coordinates', {
  skip: !process.env.REPLIT_DEV_DOMAIN, timeout: 90000,
}, async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const id = '72727272-7272-4272-8272-727272727272';
  const entry = {
    id, kind: 'cheese', revision: 1, publication: null,
    data: {
      title: 'Кастельманьо', nameOriginal: 'Castelmagno', country: 'Италия', region: 'Пьемонт',
      status: 'draft', sortOrder: 0, description: '', history: '', characteristics: '',
      culinaryUses: '', photos: [], sources: [], productIds: [], videoIds: [], externalVideoUrls: [],
      latitude: 51.5, longitude: -0.12, productionCountry: 'Франция',
      productionPoints: [{ id: 'fixture-factory', label: 'Factory', latitude: 43, longitude: 5 }],
    },
  };
  const geometry = (await readFile('client/public/editorial/world.geojson')).toString('base64');
  const mutations = [], errors = [];
  await page.send('Network.enable');
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `if ('serviceWorker' in navigator) navigator.serviceWorker.register=async()=>({});window.confirm=()=>true;`,
  });
  page.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
  await page.send('Fetch.enable', { patterns: [
    { urlPattern: '*/web-api/*' }, { urlPattern: '*/editorial/world.geojson' },
    { urlPattern: '*tile.openstreetmap.org/*' }, { urlPattern: '*telegram.org/js/telegram-web-app.js*' },
  ] });
  page.on('Fetch.requestPaused', async event => {
    const url = new URL(event.request.url), path = url.pathname;
    if (path === '/editorial/world.geojson') {
      await page.send('Fetch.fulfillRequest', {
        requestId: event.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/geo+json' }], body: geometry,
      });
      return;
    }
    if (url.hostname === 'tile.openstreetmap.org') {
      await page.send('Fetch.fulfillRequest', {
        requestId: event.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'image/png' }],
        body: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l4sAAAAASUVORK5CYII=',
      });
      return;
    }
    let body = [];
    if (path === '/web-api/auth/refresh')
      body = { accessToken: 'country-map-fixture', user: { id: 'country-map-operator', firstName: 'Fixture' } };
    else if (path === '/web-api/admin/check') body = { ok: true, isMasterAdmin: true };
    else if (path === '/web-api/admin/editorial')
      body = url.searchParams.get('kind') === 'cheese' ? { items: [entry], total: 1 } : { items: [], total: 0 };
    else if (path === '/web-api/admin/editorial-ai/history') body = { items: [], total: 0 };
    if (event.request.method !== 'GET' && path !== '/web-api/auth/refresh') mutations.push(path);
    await page.send('Fetch.fulfillRequest', {
      requestId: event.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify(body)).toString('base64'),
    });
  });
  const map = '[data-testid="cheese-geo-editor"] [role="application"]';
  const readView = () => page.evaluate(`(() => {
    const e=document.querySelector('${map}');
    return {country:e.dataset.country,lat:Number(e.dataset.centerLatitude),lon:Number(e.dataset.centerLongitude),zoom:Number(e.dataset.zoom)};
  })()`);
  const storedPoints = () => page.evaluate(`({
    lat:document.querySelector('[aria-label="Происхождение: широта"]').value,
    lon:document.querySelector('[aria-label="Происхождение: долгота"]').value,
    factoryLat:document.querySelector('[aria-label="Производство: широта"]').value,
    factoryLon:document.querySelector('[aria-label="Производство: долгота"]').value
  })`);
  const focusCountry = async (name, code) => {
    await page.fill('#ed-country', name);
    await page.wait(`document.querySelector('${map}')?.dataset.country===${JSON.stringify(name)} && document.querySelector('${map}')?.dataset.countryFocusState==='available'`);
    return readView();
  };
  try {
    await page.send('Page.navigate', { url: `https://${process.env.REPLIT_DEV_DOMAIN}/web/admin/cheeses?entry=${id}` });
    await page.wait(`document.querySelector('${map}')?.dataset.country==='Италия' && document.querySelector('${map}')?.dataset.countryFocusState==='available'`);
    const original = await storedPoints(), italy = await readView();
    assert.ok(italy.lat > 35 && italy.lat < 48 && italy.lon > 5 && italy.lon < 20);
    assert.deepEqual(original, { lat: '51.5', lon: '-0.12', factoryLat: '43', factoryLon: '5' });
    const france = await focusCountry('France', 'FR');
    assert.ok(france.lat > 40 && france.lat < 52 && france.lon > -6 && france.lon < 10);
    const russia = await focusCountry('Россия', 'RU');
    assert.ok(russia.lat > 40 && russia.lon > 30 && russia.zoom <= italy.zoom);
    const fiji = await focusCountry('FJ', 'FJ');
    assert.ok(fiji.lat < -10 && fiji.lat > -25 && Math.abs(fiji.lon) > 170);
    assert.deepEqual(await storedPoints(), original, 'focus never moves either saved origin or production point');
    await focusCountry('Италия', 'IT');
    const zoom = (await readView()).zoom;
    await page.evaluate(`document.querySelector('[aria-label="Увеличить масштаб карты"]').click()`);
    await page.wait(`Number(document.querySelector('${map}').dataset.zoom)===${zoom + 1}`);
    await page.evaluate(`[...document.querySelectorAll('[data-testid="cheese-geo-editor"] button')].find(b=>b.textContent.includes('Вернуться к стране')).click()`);
    await page.wait(`Number(document.querySelector('${map}').dataset.zoom)===${zoom}`);
    await page.fill('[aria-label="Происхождение: широта"]', '');
    await page.fill('[aria-label="Происхождение: долгота"]', '');
    await focusCountry('Italia', 'IT');
    assert.equal((await storedPoints()).lat, '');
    assert.equal((await storedPoints()).lon, '', 'country overview must not invent origin coordinates');
    await page.fill('#ed-country', 'Страна которой нет');
    await page.wait(`document.querySelector('[data-testid="cheese-geo-editor"]').innerText.includes('не найдена')`);
    assert.equal((await storedPoints()).lat, '');
    await focusCountry('Франция', 'FR');
    const desktop = await readView();
    for (const width of [1280, 390]) {
      await page.send('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: width < 500 });
      await page.evaluate(`document.querySelector('${map}').scrollIntoView({block:'center'})`);
      await page.wait(`document.querySelector('${map}').clientWidth>0`);
      assert.equal(await page.evaluate(`(() => {const e=document.querySelector('[data-testid="editorial-entry-editor"]');return e.scrollWidth<=e.clientWidth+2})()`), true);
      const screenshot = await page.send('Page.captureScreenshot', { format: 'png' });
      await mkdir('generated-artifacts/verification/editorial-country-map', { recursive: true });
      await writeFile(`generated-artifacts/verification/editorial-country-map/country-${width}.png`, Buffer.from(screenshot.data, 'base64'));
    }
    assert.ok((await readView()).zoom <= desktop.zoom);
    assert.deepEqual(mutations, []);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
