import assert from 'node:assert/strict';
import { test } from 'node:test';
import { launchBrowser } from './helpers/browser.mjs';
import { mkdir, writeFile } from 'node:fs/promises';

test('full draft opens the editorial sheet, previews unsaved work, and saves one reviewed revision', {
  skip: !process.env.REPLIT_DEV_DOMAIN, timeout: 90000,
}, async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const id = '12121212-1212-4212-8212-121212121212';
  const runId = '34343434-3434-4434-8434-343434343434';
  const deepRunId = '56565656-5656-4565-8565-565656565656';
  const sourceUrl = 'https://example.org/pecorino-romano';
  const additionSource = 'https://example.org/pecorino-addition';
  const photoUrl = 'https://photo-fixture.example.test/pecorino.jpg';
  const originalOrigin = { latitude: 41.8933203, longitude: 12.4829321 };
  const lookup = {
    lookupId: '78787878-7878-4787-8787-787878787878', entryId: id, revision: 2,
    query: 'Roma, Italia', cached: false, attribution: '© OpenStreetMap contributors',
    retrievedAt: '2026-01-01T12:00:00.000Z', candidates: [{
      id: 'relation/41485', label: 'Roma, Lazio, Italia', type: 'administrative',
      ...originalOrigin, url: 'https://www.openstreetmap.org/relation/41485',
    }],
  };
  let entry = {
    id, kind: 'cheese', revision: 1, createdAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z', publication: null, data: {
      title: 'Пекорино Романо', nameOriginal: 'Pecorino Romano', country: 'Италия',
      region: 'Лацио', status: 'draft', description: '', history: '',
      characteristics: '', culinaryUses: '', sources: [], photos: [],
      latitude: null, longitude: null, productionCountry: '', productionPoints: [],
      productIds: ['catalog-parmesan'], videoIds: [], externalVideoUrls: [], sortOrder: 0,
    },
  };
  const source = { url: sourceUrl, finalUrl: sourceUrl, title: 'Consorzio Pecorino Romano',
    retrievedAt: '2026-01-01T12:00:00.000Z', sha256: 'a'.repeat(64), characters: 1000, truncated: false };
  const report = { provider: 'brave', queries: ['Pecorino Romano history'],
    failures: [], warnings: [], searchedAt: '2026-01-01T12:00:00.000Z', photos: [{
      id: 'pecorino-photo', imageUrl: photoUrl, sourceUrl,
      label: 'Pecorino Romano', licenseUrl: 'https://example.org/license',
    }] };
  const fields = {
    description: 'Итальянский овечий сыр.',
    history: 'История сыра восходит к римской эпохе.',
    country: 'Италия', region: 'Лацио',
    characteristics: 'Сыр из овечьего молока.',
    culinaryUses: 'Используют в римской кухне.',
  };
  const full = {
    id: runId, kind: 'draft', status: 'ready', revision: 2, model: 'fixture-model',
    createdAt: '2026-01-01T12:00:00.000Z', finishedAt: '2026-01-01T12:00:05.000Z',
    params: { entryId: id, revision: 2, sources: [], research: true, fullDraft: true },
    result: { fields, sources: [source], citations: [], warnings: [], research: report, origin: lookup },
    error: null, appliedTo: null,
  };
  const deepRunning = {
    ...full, id: deepRunId, status: 'running', revision: 1,
    params: { entryId: id, revision: 3, sources: [], research: true, intent: { mode: 'deepen', field: 'history' } },
    result: null, error: null, appliedTo: null,
  };
  const deepReady = {
    ...deepRunning, status: 'ready', finishedAt: '2026-01-01T12:15:00.000Z',
    result: { fields: { history: 'Дополнительная история, ещё не сохранённая.' },
      sources: [{ ...source, url: additionSource, finalUrl: additionSource }],
      citations: [{ field: 'history', sourceIndex: 0, quote: 'Фрагмент проверяемого источника.' }], warnings: [] },
  };
  const requests = [], applies = [], identityUpdates = [], editorSaves = [], otherMutations = [], exceptions = [], requestOrder = [];
  let deepRunReleased = false;
  page.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails.text));
  await page.send('Network.enable');
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `if ('serviceWorker' in navigator) navigator.serviceWorker.register = async () => ({}); window.confirm = () => true;`,
  });
  await page.send('Fetch.enable', { patterns: [
    { urlPattern: '*/web-api/*' }, { urlPattern: '*/api/*' },
    { urlPattern: '*telegram.org/js/telegram-web-app.js*' },
    { urlPattern: 'https://photo-fixture.example.test/*' },
    { urlPattern: 'https://tile.openstreetmap.org/*' },
  ] });
  page.on('Fetch.requestPaused', async event => {
    const requestUrl = new URL(event.request.url);
    const path = requestUrl.pathname;
    if (requestUrl.hostname === 'photo-fixture.example.test' || requestUrl.hostname === 'tile.openstreetmap.org') {
      await page.send('Fetch.fulfillRequest', {
        requestId: event.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'image/png' }],
        body: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l4sAAAAASUVORK5CYII=',
      });
      return;
    }
    let body = [];
    let status = 200;
    if (path === '/web-api/auth/refresh')
      body = { accessToken: 'isolated-token', user: { id: 'fixture-operator', firstName: 'Fixture', email: 'fixture@example.invalid' } };
    else if (path === '/web-api/admin/check') body = { ok: true, isMasterAdmin: true };
    else if (path === '/web-api/admin/products') body = [
      { id: 'catalog-parmesan', name: 'Пармезан', slug: 'parmigiano' },
      { id: 'catalog-pecorino', name: 'Пекорино Романо', slug: 'pecorino-romano' },
      { id: 'catalog-truffle', name: 'Пекорино с трюфелем', slug: 'pecorino-tartufo' },
    ];
    else if (path === '/web-api/admin/editorial') body = { items: [entry], total: 1 };
    else if (path === '/web-api/admin/editorial-ai/history') body = { items: [full], total: 1, page: 1, limit: 10 };
    else if (path === `/web-api/admin/editorial/${id}` && event.request.method === 'PATCH') {
      const update = JSON.parse(event.request.postData);
      if (update.revision === 1) {
        requestOrder.push('identity-save');
        identityUpdates.push(update);
        assert.equal(update.data.title, 'Пекорино Романо редакция');
      } else {
        assert.equal(update.revision, 3);
        editorSaves.push(update);
      }
      entry = { ...entry, revision: update.revision + 1, data: update.data, updatedAt: '2026-01-01T12:20:00.000Z' };
      body = entry;
    }
    else if (path === '/web-api/admin/editorial-ai/research') {
      requestOrder.push('research');
      requests.push(JSON.parse(event.request.postData));
      body = requests.length === 1 ? full : deepRunning;
    } else if (path === `/web-api/admin/editorial-ai/runs/${runId}`) body = full;
    else if (path === `/web-api/admin/editorial-ai/runs/${deepRunId}`) body = deepRunReleased ? deepReady : deepRunning;
    else if (path.endsWith('/apply')) {
      const request = JSON.parse(event.request.postData);
      applies.push(request);
      assert.equal(request.entryId, id);
      if (applies.length === 1) {
        assert.equal(request.revision, 2, 'the transfer uses the explicitly saved identity revision researched');
        assert.equal(request.origin?.lookupId, lookup.lookupId);
        assert.equal(request.origin?.candidateId, lookup.candidates[0].id);
        assert.deepEqual(request.photoIds, ['pecorino-photo']);
        assert.equal(request.photoRightsConfirmed, true);
        assert.equal(request.editorialData.status, 'pending_review');
        assert.equal(request.editorialData.history, 'История, сверенная редактором.');
        assert.equal(request.editorialData.productionCountry, 'Россия', 'the operator can override the origin default before transferring a draft');
        assert.equal(request.editorialData.latitude, originalOrigin.latitude);
        assert.equal(request.editorialData.longitude, originalOrigin.longitude);
        assert.equal(request.editorialData.productionPoints.length, 1);
        assert.equal(request.editorialData.productionPoints[0].label, 'Caseificio Roma');
        assert.equal(request.editorialData.productionPoints[0].latitude, 43.1);
        assert.equal(request.editorialData.productionPoints[0].longitude, 13.2);
        assert.equal(request.editorialData.photos[0], photoUrl);
        full.appliedTo = { entryId: id, revision: 3 };
        entry = {
          ...entry, revision: 3, updatedAt: '2026-01-01T12:10:00.000Z',
          data: { ...request.editorialData, aiResearch: {
            runId, searchedAt: report.searchedAt, transferredAt: '2026-01-01T12:10:00.000Z',
          } },
        };
      } else assert.fail('An addition must not apply a replacement via the AI endpoint');
      body = entry;
    } else if (event.request.method !== 'GET') {
      otherMutations.push({ method: event.request.method, path, body: event.request.postData });
      throw new Error(`Unexpected mutation ${event.request.method} ${path}`);
    }
    await page.send('Fetch.fulfillRequest', {
      requestId: event.requestId, responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify(body)).toString('base64'),
    });
  });
  const click = testId => page.evaluate(`document.querySelector('[data-testid="${testId}"]').click()`);
  const screenshotDirectory = process.env.EDITORIAL_REVIEW_SCREENSHOT_DIR || '/tmp/don-giulio-editorial-review';
  async function captureResponsiveScreenshot(name, width, height, modal = false) {
    await page.setViewport({ width, height, mobile: width < 768 });
    await page.evaluate(`(async () => {
      window.scrollTo(0, 0);
      const target = document.querySelector(${JSON.stringify(modal ? '[data-testid="editorial-entry-editor"]' : `#entry-${id}`)});
      target?.scrollIntoView({ block: 'start', inline: 'nearest' });
      await new Promise(resolve => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), 250));
    })()`);
    const screenshot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await mkdir(screenshotDirectory, { recursive: true });
    await writeFile(`${screenshotDirectory}/${name}.png`, Buffer.from(screenshot.data, 'base64'));
    assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `${name} has no horizontal overflow`);
    if (modal) {
      assert.equal(await page.evaluate(`(() => {const dialog=document.querySelector('[data-testid="editorial-entry-editor"]');return dialog.scrollWidth<=dialog.clientWidth+2})()`), true, `${name} editor has no horizontal scroll`);
    }
  }
  const setInput = (selector, value) => page.evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
    setter.call(input, ${JSON.stringify(String(value))});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  try {
    await page.send('Page.navigate', { url: `https://${process.env.REPLIT_DEV_DOMAIN}/web/admin/cheeses` });
    await page.wait(`!!document.querySelector('[data-testid="ai-draft-entry-${id}"]')`).catch(async error => {
      console.error({ page: await page.evaluate('document.body?.innerText.slice(0, 1400)'), exceptions });
      throw error;
    });
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-testid="ai-draft-entry-${id}"] input').length`), 4);
    await captureResponsiveScreenshot('cheese-research-start-desktop', 1280, 950);
    await captureResponsiveScreenshot('cheese-research-start-mobile', 390, 844);
    await page.setViewport({ width: 1280, height: 1000 });
    await setInput(`#ai-cheese-title-${id}`, 'Пекорино Романо редакция');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-full-draft-research"]').disabled`), false,
      'the full-draft action saves edited identity before starting research');
    await click('ai-full-draft-research');
    await page.wait(`!!document.querySelector('[data-testid="editorial-entry-editor"][data-state="open"]')`);
    assert.equal(identityUpdates.length, 1);
    await page.wait(`document.querySelector('[data-testid="editorial-milk-summary"]')?.textContent.includes('Вид молока: овечье')`);
    assert.equal(entry.revision, 2);
    assert.deepEqual(requestOrder.slice(0, 2), ['identity-save', 'research'], 'the identity CRUD save completes before the AI request');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].fullDraft, true);
    assert.equal(requests[0].revision, 2);
    await page.wait(`!!document.querySelector('[data-testid="editorial-entry-editor"][data-state="open"]')`);
    await page.wait(`!!document.querySelector('[data-testid="ai-proposal-review"]')`);
    await captureResponsiveScreenshot('cheese-editor-review-desktop', 1280, 950, true);
    await captureResponsiveScreenshot('cheese-editor-review-mobile', 390, 844, true);
    await page.setViewport({ width: 1280, height: 1000 });
    assert.equal(applies.length, 0, 'ready research opens an unsaved review sheet without inserting data');
    assert.equal(await page.evaluate(`document.querySelector('#ed-history').value`), fields.history);
    assert.equal(await page.evaluate(`document.querySelector('#ed-status').value`), 'pending_review');
    assert.equal(await page.evaluate(`document.querySelector('#ed-productionCountry').value`), fields.country);
    await setInput('#ed-productionCountry', 'Россия');

    const mapCheck = await page.evaluate(`(() => {
      const map = document.querySelector('[data-testid="cheese-geo-editor"] [role="application"]');
      const tile = map.querySelector('[data-map-tile]');
      const tileStyle = getComputedStyle(tile);
      const mapRect = map.getBoundingClientRect();
      return { tileWidth: parseFloat(tileStyle.width), tileHeight: parseFloat(tileStyle.height), mapWidth: mapRect.width, mapHeight: mapRect.height };
    })()`);
    assert.equal(mapCheck.tileWidth, 256);
    assert.equal(mapCheck.tileHeight, 256, 'square OSM tiles remain square inside the clipped nonsquare viewport');
    assert.notEqual(mapCheck.mapWidth, mapCheck.mapHeight);
    await page.evaluate(`document.querySelector('[name="ai-proposal-origin"]').click()`);
    assert.equal(await page.evaluate(`document.querySelector('[aria-label="Происхождение: широта"]').value`), String(originalOrigin.latitude));
    // Photo candidates live in the proposal sheet; operator selection is explicit.
    await page.evaluate(`document.querySelector('[data-testid="ai-proposal-review"] input[type="checkbox"]').click()`);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-photo-rights-confirm"]').checked`), false);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-proposal-editorial-confirm"]').checked`), false);
    assert.equal(await page.evaluate(`Array.from(document.querySelectorAll('[data-testid="editorial-entry-editor"] button')).find(b => b.textContent.includes('Сохранить изменения')).disabled`), true);

    await page.evaluate(`document.querySelector('[data-testid="ai-photo-rights-confirm"]').click()`);
    await page.evaluate(`document.querySelector('[data-testid="ai-proposal-editorial-confirm"]').click()`);
    await page.evaluate(`(() => {
      const area = document.querySelector('#ed-history');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(area, 'История, сверенная редактором.');
      area.dispatchEvent(new Event('input', { bubbles: true }));
      area.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);

    await page.evaluate(`Array.from(document.querySelectorAll('[data-testid="cheese-geo-editor"] button')).find(button => button.textContent.includes('Точка производства')).click()`);
    await page.wait(`document.querySelectorAll('[aria-label="Название точки производства"]').length === 1`);
    await setInput('[aria-label="Название точки производства"]', 'Caseificio Roma');
    await page.evaluate(`document.querySelector('[aria-label^="Выбрать точку производства"]').click()`);
    await page.evaluate(`(() => {
      const map = document.querySelector('[data-testid="cheese-geo-editor"] [role="application"]');
      const rect = map.getBoundingClientRect();
      map.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left + rect.width * .8, clientY: rect.top + rect.height * .5 }));
    })()`);
    const movedFactoryLongitude = await page.evaluate(`document.querySelectorAll('[aria-label="Производство: долгота"]')[0].value`);
    assert.notEqual(movedFactoryLongitude, String(originalOrigin.longitude), 'map clicks move the selected factory independently from origin');
    await setInput('[aria-label="Производство: широта"]', 43.1);
    await setInput('[aria-label="Производство: долгота"]', 13.2);
    await setInput('[aria-label="Происхождение: широта"]', originalOrigin.latitude);
    await setInput('[aria-label="Происхождение: долгота"]', originalOrigin.longitude);

    const zoomBefore = await page.evaluate(`Number(document.querySelector('[data-testid="cheese-map-country-focus"]').dataset.zoom)`);
    await page.setViewport({ width: 390, height: 844, mobile: true });
    await page.wait(`innerWidth === 390`);
    const mapZoomControls = await page.evaluate(`(() => {
      const map = document.querySelector('[data-testid="cheese-map-country-focus"]');
      const buttons = Array.from(map.querySelectorAll('[data-testid="cheese-map-zoom"] button'));
      const bounds = map.getBoundingClientRect();
      return { count: buttons.length, fit: buttons.every(button => {
        const rect = button.getBoundingClientRect();
        return rect.width >= 44 && rect.height >= 44 && rect.left >= bounds.left && rect.top >= bounds.top &&
          rect.right <= bounds.right && rect.bottom <= bounds.bottom;
      }) };
    })()`);
    assert.deepEqual(mapZoomControls, { count: 2, fit: true }, 'both touch controls are inside the map');
    const mapCoordinates = () => page.evaluate(`(() => {
      const map = document.querySelector('[data-testid="cheese-map-country-focus"]');
      return { center: [map.dataset.centerLatitude, map.dataset.centerLongitude],
        pins: Array.from(document.querySelectorAll('[aria-label$=": широта"], [aria-label$=": долгота"]'), input => input.value) };
    })()`);
    const coordinatesBeforeZoom = await mapCoordinates();
    await page.tap('[aria-label="Увеличить масштаб карты"]');
    await page.wait(`Number(document.querySelector('[data-testid="cheese-map-country-focus"]').dataset.zoom) === ${zoomBefore + 1}`);
    await page.tap('[aria-label="Уменьшить масштаб карты"]');
    await page.wait(`Number(document.querySelector('[data-testid="cheese-map-country-focus"]').dataset.zoom) === ${zoomBefore}`);
    assert.deepEqual(await mapCoordinates(), coordinatesBeforeZoom, 'zoom buttons preserve the map center and all pin coordinates');
    await page.setViewport({ width: 1280, height: 1000 });
    await page.evaluate(`document.querySelector('[aria-label="Увеличить масштаб карты"]').click()`);
    assert.equal(await page.evaluate(`Number(document.querySelector('[data-testid="cheese-map-country-focus"]').dataset.zoom)`), zoomBefore + 1, 'zoom controls select a new tile zoom');
    await page.evaluate(`Array.from(document.querySelectorAll('[data-testid="cheese-geo-editor"] button')).find(button => button.textContent.trim() === 'Происхождение').click()`);
    await setInput('[aria-label="Происхождение: широта"]', 90);
    await setInput('[aria-label="Происхождение: долгота"]', 180);
    await page.wait(`document.querySelector('[aria-label="Происхождение: широта"]').value === '90'`);
    await page.evaluate(`Array.from(document.querySelectorAll('[data-testid="cheese-geo-editor"] button')).find(button => button.textContent.trim() === 'Происхождение').click()`);
    const polarTiles = await page.evaluate(`Array.from(document.querySelectorAll('[data-testid="cheese-geo-editor"] [data-map-tile]')).map(tile => {
      const parts = new URL(tile.src).pathname.split('/');
      return { zoom: Number(parts.at(-3)), x: Number(parts.at(-2)), y: Number(parts.at(-1).replace('.png', '')) };
    })`);
    assert.equal(polarTiles.length, 6, 'tiles beyond the valid Mercator y range are omitted');
    const tileCount = 2 ** (zoomBefore + 1);
    assert.equal(polarTiles.every(tile => tile.zoom === zoomBefore + 1 && tile.x >= 0 && tile.x < tileCount && tile.y >= 0 && tile.y < tileCount), true);
    assert.equal(polarTiles.some(tile => tile.x === 0) && polarTiles.some(tile => tile.x === tileCount - 1), true, 'tile x wraps across the antimeridian');
    await setInput('[aria-label="Происхождение: широта"]', originalOrigin.latitude);
    await setInput('[aria-label="Происхождение: долгота"]', originalOrigin.longitude);
    assert.equal(applies.length, 0);
    await page.evaluate(`Array.from(document.querySelectorAll('[data-testid="editorial-entry-editor"] button')).find(b => b.textContent.includes('Сохранить изменения')).click()`);
    await page.wait(`document.querySelector('[data-testid="editorial-entry-editor"][data-state="open"]') === null`);
    assert.equal(applies.length, 1, 'one Save action performs a single atomic apply');
    assert.equal(otherMutations.length, 0);
    assert.equal(entry.data.status, 'pending_review');
    assert.equal(entry.data.title, 'Пекорино Романо редакция');
    assert.equal(entry.publication, null);

    await page.wait(`!!document.querySelector('#entry-${id}')`);
    await page.evaluate(`Array.from(document.querySelectorAll('#entry-${id} button')).find(b => b.textContent.includes('Изменить')).click()`);
    await page.wait(`!!document.querySelector('[data-testid="editorial-entry-editor"][data-state="open"]')`);
    await page.wait(`!!document.querySelector('[data-testid="ai-research-toggle-${id}"]')`);
    const productSearch = '[data-testid="editorial-product-search"]';
    const productRows = '[data-testid="editorial-product-results"] input';
    const readProductRows = () => page.evaluate(`Array.from(document.querySelectorAll('${productRows}'), item => [item.value, item.checked])`);
    await page.wait(`!document.querySelector('${productSearch}').disabled && document.querySelectorAll('${productRows}').length === 3`);
    await page.evaluate(`document.querySelector('${productSearch}').focus()`);
    await page.send('Input.insertText', { text: 'РОМАНО пек' });
    await page.wait(`document.querySelectorAll('${productRows}').length === 1`);
    assert.deepEqual(await readProductRows(), [['catalog-pecorino', false]], 'typing filters by parts of the product name without linking it');
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    assert.equal(await page.evaluate('document.activeElement.value'), 'catalog-pecorino', 'Enter focuses the matching checkbox instead of saving the sheet');
    assert.equal(editorSaves.length, 0);
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    assert.deepEqual(await readProductRows(), [['catalog-pecorino', true]]);
    await setInput(productSearch, 'pecorino-tartufo');
    assert.deepEqual(await readProductRows(), [['catalog-truffle', false]], 'the original name can match the catalogue slug');
    await setInput(productSearch, 'неизвестный товар');
    await page.wait(`document.querySelector('[data-testid="editorial-product-links"]').textContent.includes('товары не найдены')`);
    await page.evaluate(`document.querySelector('[aria-label="Очистить поиск товаров"]').click()`);
    assert.deepEqual(await readProductRows(), [['catalog-parmesan', true], ['catalog-pecorino', true], ['catalog-truffle', false]],
      'clearing the filter restores the list and retains links not shown in search results');
    const localHistory = 'История, сверенная редактором. Несохранённая правка.';
    await setInput('#ed-history', localHistory);
    await setInput('#ed-characteristics', 'Отдельная правка характеристик.');
    await page.wait(`document.querySelector('[data-testid="editorial-milk-summary"]')?.textContent.includes('Вид молока: не уточнён')`);
    await click('ed-milk-cow');
    await click('ed-milk-goat');
    const cowShare = '[data-testid="ed-milk-percentage-cow"]';
    const goatShare = '[data-testid="ed-milk-percentage-goat"]';
    await setInput(cowShare, '80,25');
    await setInput(goatShare, '25');
    await page.wait(`document.querySelector('[data-testid="editorial-milk-summary"]').textContent.includes('не может превышать 100%')`);
    await setInput(goatShare, '');
    await page.wait(`document.querySelector('[data-testid="editorial-milk-summary"]').textContent.includes('смесь (коровье 80,25%, козье)')`);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-research-toggle-${id}"]').disabled`), true,
      'the older whole-article research still uses the saved revision');
    for (const field of ['description', 'history', 'characteristics', 'culinaryUses', 'region'])
      assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-deepen-${field}"]').disabled`), false);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-deepen-history"]').parentElement.nextElementSibling.id`), 'ed-history');
    await click('ai-deepen-history');
    await page.wait(`!!document.querySelector('[data-testid="editorial-section-research"]')`);
    assert.equal(requests.length, 1, 'opening the modal alone does not call the providers');
    await setInput('#section-research-notes-history', 'Уточнить даты');
    await click('section-research-start');
    await page.wait(`document.querySelector('[data-testid="editorial-section-research"]')?.textContent.includes('Ищем источники')`);
    await page.wait(`document.querySelector('[data-testid="section-research-start"]').disabled`);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].revision, 3);
    assert.equal(requests[1].intent.mode, 'deepen');
    assert.equal(requests[1].intent.field, 'history');
    assert.equal(requests[1].intent.instructions, 'Уточнить даты');
    assert.equal(requests[1].intent.addition.existingText, localHistory);
    assert.equal(applies.length, 1);
    deepRunReleased = true;
    await page.wait(`document.querySelector('[data-testid="section-research-addition"]')?.value === ${JSON.stringify(deepReady.result.fields.history)}`, 8000);
    await page.setViewport({ width: 390, height: 844, mobile: true });
    await page.wait(`innerWidth === 390`);
    const dimensions = await page.evaluate(`(() => {
      const dialog = document.querySelector('[data-testid="editorial-section-research"]');
      const bounds = dialog.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, viewport: innerWidth, scroll: dialog.scrollWidth, client: dialog.clientWidth };
    })()`);
    assert.ok(dimensions.left >= 0 && dimensions.right <= dimensions.viewport && dimensions.scroll <= dimensions.client + 2,
      `the addition dialog fits on mobile: ${JSON.stringify(dimensions)}`);
    await page.setViewport({ width: 1280, height: 1000 });
    assert.equal(await page.evaluate(`document.querySelector('#ed-history').value`), localHistory);
    assert.equal(entry.data.history, 'История, сверенная редактором.', 'generation does not save anything');
    await page.evaluate(`Array.from(document.querySelectorAll('[data-testid="editorial-section-research"] button')).find(b => b.textContent.trim() === 'Закрыть').click()`);
    await page.wait(`!document.querySelector('[data-testid="editorial-section-research"]')`);
    await click('ai-deepen-history');
    await page.wait(`!!document.querySelector('[data-testid="section-research-addition"]')`);
    assert.equal(requests.length, 2, 'reopening a finished proposal does not generate it again');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="editorial-section-research"] a')?.href`), additionSource);
    const addition = 'Дополнение, проверенное редактором.';
    const merged = `${localHistory}\n\n${addition}`;
    await setInput('#section-research-addition-history', addition);
    await click('section-research-integrate');
    await page.wait(`!document.querySelector('[data-testid="editorial-section-research"]')`);
    assert.equal(await page.evaluate(`document.querySelector('#ed-history').value`), merged);
    assert.equal(editorSaves.length, 0, 'integrating only modifies the open editor');
    assert.equal(applies.length, 1);
    await click('button-editorial-save-top');
    await page.wait(`!document.querySelector('[data-testid="editorial-entry-editor"]')`);
    assert.equal(editorSaves.length, 1);
    assert.equal(entry.revision, 4);
    assert.equal(entry.data.history, merged);
    assert.equal(entry.data.characteristics, 'Отдельная правка характеристик.');
    assert.deepEqual(entry.data.milkComposition, [{ type: 'cow', percentage: 80.25 }, { type: 'goat' }]);
    assert.deepEqual(entry.data.productIds, ['catalog-parmesan', 'catalog-pecorino'], 'old and new product links persist on the regular editorial save');
    assert.ok(entry.data.sources.includes(additionSource));
    assert.equal(entry.data.photos[0], photoUrl, 'deep apply preserves photos from the full editorial draft');
    assert.equal(entry.data.productionPoints[0].label, 'Caseificio Roma', 'deep apply preserves production-point edits');
    assert.equal(entry.data.productionPoints[0].latitude, 43.1);
    assert.equal(entry.data.productionPoints[0].longitude, 13.2);
    assert.equal(entry.data.latitude, originalOrigin.latitude, 'deep apply preserves the historical origin');
    assert.equal(entry.data.longitude, originalOrigin.longitude);
    assert.equal(entry.publication, null, 'deep apply remains unpublished');
    assert.deepEqual(exceptions, []);
  } finally { await browser.close(); }
});
