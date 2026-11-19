import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser } from './helpers/browser.mjs';
import { join } from 'node:path';

const build = process.env.EDITORIAL_MAP_BUILD_DIR;
const base = build ? 'https://editorial-map.example.test' : process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '';
test('editorial map focuses by country and place, pans by mouse/touch/keyboard and preserves the draft during navigation', {
  skip: !base, timeout: 90000,
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
  const mutations = [], errors = [], placeRequests = [];
  const candidates = [
    { id: 'relation/123', label: 'Bergamo, Lombardia, Italia', latitude: 45.695, longitude: 9.670, type: 'city', url: 'https://www.openstreetmap.org/relation/123' },
    { id: 'node/456', label: 'Bergamo, altro luogo', latitude: 42.001, longitude: 10.23, type: 'village', url: 'https://www.openstreetmap.org/node/456' },
  ];
  await page.send('Network.enable');
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `if ('serviceWorker' in navigator) navigator.serviceWorker.register=async()=>({});window.confirm=()=>true;`,
  });
  page.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
  await page.send('Fetch.enable', { patterns: [
    { urlPattern: '*/web-api/*' }, { urlPattern: '*/api/*' }, { urlPattern: '*/editorial/world.geojson' },
    { urlPattern: '*tile.openstreetmap.org/*' }, { urlPattern: '*telegram.org/js/telegram-web-app.js*' },
    ...(build ? [{ urlPattern: '*', resourceType: 'Document' }, { urlPattern: '*/assets/*' }] : []),
  ] });
  page.on('Fetch.requestPaused', async event => {
    const url = new URL(event.request.url), path = url.pathname;
    if (build && (event.resourceType === 'Document' || path.startsWith('/assets/'))) {
      const asset = event.resourceType === 'Document' ? '/index.html' : path;
      await page.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: asset.endsWith('.html') ? 'text/html' : asset.endsWith('.css') ? 'text/css' : 'application/javascript' }],
        body: (await readFile(join(build, asset))).toString('base64') });
      return;
    }
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
    let status = 200;
    if (path === '/web-api/admin/editorial-ai/map-place') {
      const data = JSON.parse(event.request.postData);
      placeRequests.push(data);
      if (data.place === 'Errore') {
        status = 429;
        body = { error: 'Новый географический поиск доступен через 15 секунд.' };
      } else body = { query: data.place, candidates: data.place === 'Non trovato' ? [] : candidates,
        retrievedAt: new Date().toISOString(), cached: false, attribution: '© OpenStreetMap contributors' };
    } else if (path === '/web-api/auth/refresh')
      body = { accessToken: 'country-map-fixture', user: { id: 'country-map-operator', firstName: 'Fixture' } };
    else if (path === '/web-api/admin/check') body = { ok: true, isMasterAdmin: true };
    else if (path === '/web-api/admin/editorial')
      body = url.searchParams.get('kind') === 'cheese' ? { items: [entry], total: 1 } : { items: [], total: 0 };
    else if (path === '/web-api/admin/editorial-ai/history') body = { items: [], total: 0 };
    if (event.request.method !== 'GET' && !['/web-api/auth/refresh', '/web-api/admin/editorial-ai/map-place'].includes(path)) mutations.push(path);
    await page.send('Fetch.fulfillRequest', {
      requestId: event.requestId, responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify(body)).toString('base64'),
    });
  });
  const map = '[data-testid="cheese-geo-editor"] [role="application"]';
  const search = '[data-testid="cheese-map-search"]';
  const input = `${search} input`;
  const result = index => `${search} li:nth-child(${index}) button`;
  const returnToCountry = () => page.evaluate(`[...document.querySelectorAll('[data-testid="cheese-geo-editor"] button')].find(b=>b.textContent.includes('Вернуться к стране')).click()`);
  const readView = () => page.evaluate(`(() => {
    const e=document.querySelector('${map}');
    return {country:e.dataset.country,lat:Number(e.dataset.centerLatitude),lon:Number(e.dataset.centerLongitude),zoom:Number(e.dataset.zoom)};
  })()`);
  const storedPoints = () => page.evaluate(`({
    lat:document.querySelector('[aria-label="Происхождение: широта"]').value,
    lon:document.querySelector('[aria-label="Происхождение: долгота"]').value,
    factoryLat:document.querySelector('[aria-label="Производство: широта"]')?.value,
    factoryLon:document.querySelector('[aria-label="Производство: долгота"]')?.value
  })`);
  const focusCountry = async (name, code) => {
    await page.fill('#ed-country', name);
    await page.wait(`document.querySelector('${map}')?.dataset.country===${JSON.stringify(name)} && document.querySelector('${map}')?.dataset.countryFocusState==='available'`);
    return readView();
  };
  const mapRect = async () => {
    await page.evaluate(`document.querySelector('${map}').scrollIntoView({block:'center'})`);
    return page.evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const r=document.querySelector('${map}').getBoundingClientRect();resolve({x:r.left+r.width*.3,y:r.top+r.height*.4,width:r.width});})))`);
  };
  const mouseDrag = async (dx, dy) => {
    const { x, y } = await mapRect();
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 4; i++) await page.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: x + dx * i / 4, y: y + dy * i / 4, buttons: 1,
    });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + dx, y: y + dy, button: 'left', buttons: 0, clickCount: 1 });
  };
  try {
    await page.send('Page.navigate', { url: `${base}/web/admin/cheeses?entry=${id}` });
    await page.wait(`document.querySelector('${map}')?.dataset.country==='Италия' && document.querySelector('${map}')?.dataset.countryFocusState==='available'`);
    const original = await storedPoints(), italy = await readView();
    assert.ok(italy.lat > 35 && italy.lat < 48 && italy.lon > 5 && italy.lon < 20);
    assert.deepEqual(original, { lat: '51.5', lon: '-0.12', factoryLat: '43', factoryLon: '5' });
    await page.fill(input, '  Bergamo  ');
    assert.deepEqual(placeRequests, [], 'typing does not contact the geocoder');
    await page.evaluate(`document.querySelector('${input}').focus()`);
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await page.wait(`document.querySelectorAll('${search} li').length === 2`);
    assert.deepEqual(placeRequests, [{ place: 'Bergamo' }], 'only the place name is requested');
    assert.deepEqual(await readView(), italy, 'ambiguous results do not move the view until selected');
    await page.click(result(1));
    await page.wait(`Number(document.querySelector('${map}').dataset.zoom)===12`);
    assert.deepEqual(await readView(), { country: 'Италия', lat: 45.695, lon: 9.670, zoom: 12 });
    assert.deepEqual(await storedPoints(), original);
    assert.equal(await page.evaluate(`!!document.querySelector('[data-testid="cheese-map-located-place"]')`), true);
    await returnToCountry();
    await page.wait(`Number(document.querySelector('${map}').dataset.zoom)===${italy.zoom}`);
    assert.equal(await page.evaluate(`!!document.querySelector('[data-testid="cheese-map-located-place"]')`), false);
    await mouseDrag(100, 40);
    const panned = await readView();
    assert.ok(panned.lon < italy.lon && panned.lat > italy.lat);
    assert.equal(panned.zoom, italy.zoom);
    assert.deepEqual(await storedPoints(), original, 'dragging must not place the selected marker on release');
    // Pointer capture continues the pan beyond the original map bounds.
    await mouseDrag(500, 0);
    assert.notEqual((await readView()).lon, panned.lon);
    assert.deepEqual(await storedPoints(), original);
    await page.evaluate(`document.querySelector('${map}').focus()`);
    const beforeKeyboard = await readView();
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', modifiers: 1, windowsVirtualKeyCode: 39 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', modifiers: 1, windowsVirtualKeyCode: 39 });
    assert.notEqual((await readView()).lon, beforeKeyboard.lon);
    assert.deepEqual(await storedPoints(), original, 'Alt+arrows pan without editing coordinates');
    await page.evaluate(`[...document.querySelectorAll('[data-testid="cheese-geo-editor"] button')].find(b=>b.textContent.includes('Вернуться к стране')).click()`);
    await page.wait(`Math.abs(Number(document.querySelector('${map}').dataset.centerLongitude)-${italy.lon})<0.001`);
    assert.deepEqual(await storedPoints(), original);
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
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    const touchRect = await mapRect(), beforeTouch = await readView(), beforeTouchPoints = await storedPoints();
    const scroll = await page.evaluate(`document.querySelector('[data-testid="editorial-entry-editor"]').scrollTop`);
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchRect.x, y: touchRect.y, id: 1 }] });
    await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchRect.x + 60, y: touchRect.y + 30, id: 1 }] });
    await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.wait(`Math.abs(Number(document.querySelector('${map}').dataset.centerLongitude)-${beforeTouch.lon})>0.01`);
    assert.deepEqual(await storedPoints(), beforeTouchPoints, 'touch pan must not change origin or factory');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="editorial-entry-editor"]').scrollTop`), scroll, 'map touch does not scroll the editor');
    const cancelRect = await mapRect();
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cancelRect.x, y: cancelRect.y, id: 2 }] });
    await page.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.deepEqual(await storedPoints(), beforeTouchPoints, 'cancelled touch does not place a pin');
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    // A new ordinary click still places the selected pin after any pan/cancel.
    const click = await mapRect();
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: click.x, y: click.y, button: 'left', buttons: 1, clickCount: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: click.x, y: click.y, button: 'left', buttons: 0, clickCount: 1 });
    await page.wait(`document.querySelector('[aria-label="Происхождение: широта"]').value!==''`);
    const afterClick = await storedPoints();
    assert.equal(afterClick.factoryLat, beforeTouchPoints.factoryLat);
    assert.equal(afterClick.factoryLon, beforeTouchPoints.factoryLon);
    await page.evaluate(`document.querySelector('${map}').focus()`);
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
    assert.ok(Number((await storedPoints()).lat) > Number(afterClick.lat), 'existing marker keyboard adjustment remains available');
    const mobileView = await readView(), mobilePoints = await storedPoints();
    await page.fill(input, 'Non trovato');
    await page.click(`${search} button[type="submit"]`);
    await page.wait(`document.querySelector('${search} [role="status"]').textContent.includes('не найдено')`);
    assert.deepEqual(await readView(), mobileView);
    await page.fill(input, 'Errore');
    await page.click(`${search} button[type="submit"]`);
    await page.wait(`document.querySelector('${search} [role="alert"]')?.textContent.includes('15 секунд')`);
    assert.deepEqual(await storedPoints(), mobilePoints);
    await page.evaluate(`[...document.querySelectorAll('[data-testid="editorial-entry-editor"] button')].find(b=>b.textContent==='Отмена').click()`);
    await page.wait(`!document.querySelector('${search}')`);
    await page.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Новая запись').click()`);
    await page.wait(`!!document.querySelector('${input}')`);
    assert.equal(await page.evaluate(`document.querySelector('${input}').value`), '');
    await page.fill(input, 'Bergamo');
    await page.click(`${search} button[type="submit"]`);
    await page.wait(`document.querySelectorAll('${search} li').length === 2`);
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await page.tap(result(2));
    await page.wait(`Number(document.querySelector('${map}').dataset.zoom)===14`);
    assert.equal((await readView()).lon, 10.23);
    assert.deepEqual(await storedPoints(), { lat: '', lon: '' }, 'unsaved draft coordinates remain empty after search');
    assert.deepEqual(placeRequests, ['Bergamo', 'Non trovato', 'Errore', 'Bergamo'].map(place => ({ place })));
    assert.deepEqual(mutations, []);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
