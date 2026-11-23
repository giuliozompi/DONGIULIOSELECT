import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { launchBrowser } from './helpers/browser.mjs';

const build = process.env.EDITORIAL_ATLAS_BUILD_DIR;
const base = 'https://editorial-atlas.example.test';
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l4sAAAAASUVORK5CYII=';
const cheese = (id, title, latitude, longitude, country = 'Италия') => ({
  id, title, latitude, longitude, country, region: '', photo: image, description: 'Описание сыра', publishedAt: '2026-11-01',
});
const items = [
  cheese('castelmagno', 'Кастельманьо', 44.4, 7.21),
  cheese('nearby', 'Сыр из той же местности', 44.4, 7.21),
  cheese('gorgonzola', 'Горгонзола', 45.53, 9.4),
  { ...cheese('sicilia', 'Пекорино', 37.56, 14.27), milk: { status: 'known', types: ['sheep', 'cow'],
    composition: [{ type: 'sheep', percentage: 80.25 }, { type: 'cow' }] } },
  cheese('sardegna', 'Фьоре Сардо', 40.5, 8.3),
  cheese('camembert', 'Камамбер', 48.89, 0.18, 'Франция'),
  { ...cheese('vologda', 'Вологодский сыр', 59.22, 39.89, 'СССР'), atlasCountry: 'Россия' },
  { ...cheese('sulguni', 'Сулугуни', 41.71, 44.79, 'СССР'), atlasCountry: 'Грузия' },
  cheese('vermont', 'Вермонтский чеддер', 44.26, -72.57, 'США'),
  cheese('tokachi', 'Сыр Токати', 42.92, 143.20, 'Япония'),
];

test('atlas filters by country, shows world pins and opens articles at the top', {
  skip: !build, timeout: 90000,
}, async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const errors = [];
  const geometry = await readFile('client/public/editorial/world.geojson');
  await page.send('Network.enable');
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `if ('serviceWorker' in navigator) navigator.serviceWorker.register=async()=>({});`,
  });
  page.on('Runtime.exceptionThrown', event => errors.push(event.exceptionDetails.text));
  await page.send('Fetch.enable', { patterns: [{ urlPattern: `${base}/*` }] });
  page.on('Fetch.requestPaused', async event => {
    const { pathname: path, searchParams } = new URL(event.request.url);
    let body, type = 'application/json', status = 200;
    if (event.resourceType === 'Document') {
      body = await readFile(join(build, 'index.html'));
      type = 'text/html';
    } else if (path.startsWith('/assets/')) {
      body = await readFile(join(build, path));
      type = path.endsWith('.css') ? 'text/css' : 'application/javascript';
    } else if (path === '/editorial/world.geojson') {
      body = geometry;
    } else if (path === '/web-api/editorial/map' || path === '/web-api/editorial/cheeses') {
      const country = searchParams.get('country');
      const search = searchParams.get('search')?.toLowerCase();
      const filtered = items.filter(item => (!country || (item.atlasCountry || item.country) === country) && (!search || item.title.toLowerCase().includes(search)));
      const mapPage = searchParams.get('page');
      const worldBatch = path.endsWith('/map') && mapPage !== null && country === null && search === undefined;
      const batch = worldBatch ? (mapPage === '1' ? filtered.slice(0, -1) : filtered.slice(-1)) : filtered;
      body = JSON.stringify({ items: batch, total: filtered.length, truncated: worldBatch && mapPage === '1',
        page: 1, limit: 12, countries: ['Италия', 'Франция', 'Германия', 'Россия', 'Грузия', 'США', 'Япония'] });
    } else if (path.startsWith('/web-api/editorial/cheeses/')) {
      const [, id, section] = path.split('/web-api/editorial/cheeses/')[1].match(/^([^/]+)(?:\/(.+))?$/);
      const item = items.find(cheese => cheese.id === id);
      body = JSON.stringify(section === 'prices' ? { items: [], total: 0, page: 1, limit: 10 } : {
        ...item, history: 'История сыра. '.repeat(120), photos: [image],
        sources: [], products: [], relatedVideos: [], externalVideoUrls: [],
      });
    } else if (path.startsWith('/web-api/auth/')) {
      status = 401;
      body = '{}';
    } else {
      body = '[]';
    }
    await page.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: type }], body: Buffer.from(body).toString('base64') });
  });

  const focused = '.ed-map-country-focus';
  const pin = id => `.ed-map-pin[aria-label^="${id}"]`;
  const cards = '.ed-cheese-grid a[href^="/web/cheeses/"]';
  const visibleCards = () => page.evaluate(`Array.from(document.querySelectorAll('${cards}'), a => a.pathname.split('/').pop())`);
  const italianCards = ['castelmagno', 'nearby', 'gorgonzola', 'sicilia', 'sardegna'];
  const country = async value => page.evaluate(`(() => {
    const select=document.querySelector('.ed-filter-select select');
    select.value=${JSON.stringify(value)};
    select.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  const fit = async () => {
    const v = await page.evaluate(`(() => {
      const shape=document.querySelector('${focused}').getBoundingClientRect();
      const map=document.querySelector('.ed-map-canvas').getBoundingClientRect();
      return { left:shape.left-map.left, right:map.right-shape.right,
        top:shape.top-map.top,bottom:map.bottom-shape.bottom,width:map.width };
    })()`);
    assert.ok(Math.abs(v.left - v.right) < 1 && Math.abs(v.top - v.bottom) < 1, JSON.stringify(v));
    assert.ok([v.left, v.right, v.top, v.bottom].every(space => space >= 15), JSON.stringify(v));
    assert.ok(Math.abs(Math.min(v.left, v.top) - 16) < 1, JSON.stringify(v));
    return v;
  };

  try {
    await page.setViewport({ width: 1280, height: 1000 });
    await page.send('Page.navigate', { url: base + '/web/cheeses' });
    await page.wait(`document.querySelector('${focused}') && document.querySelectorAll('.ed-map-pin').length === 4`);
    assert.equal(await page.evaluate(`document.querySelector('.ed-map-canvas > svg').getAttribute('aria-label')`), 'Карта: Италия');
    await page.wait(`document.querySelectorAll('${cards}').length === 5`);
    assert.deepEqual(await visibleCards(), italianCards);
    const desktop = await fit();
    assert.equal(await page.evaluate(`document.querySelector('${pin('Горгонзола')}').getBoundingClientRect().width`), 28);
    await page.click(pin('Горгонзола'));
    await page.wait(`!!document.querySelector('.ed-map-aside a[href="/web/cheeses/gorgonzola"]')`);
    await page.click(pin('Группа: 2'));
    await page.wait(`document.querySelectorAll('.ed-pin-list-item').length === 2`);

    await page.setViewport({ width: 390, height: 850, mobile: true });
    await page.send('Page.reload', { ignoreCache: true });
    await page.wait(`Number(document.querySelector('.ed-map-canvas > svg')?.getAttribute('viewBox').split(' ')[2]) < 390`);
    await page.wait(`document.querySelector('${focused}') && document.querySelectorAll('${cards}').length === 5 && document.querySelectorAll('.ed-map-pin').length === 4`);
    assert.equal(await page.evaluate(`document.querySelector('.ed-filter-select select').value`), 'Италия');
    assert.deepEqual(await visibleCards(), italianCards);
    assert.ok((await fit()).width < desktop.width);
    assert.equal(await page.evaluate(`document.querySelectorAll('.ed-map-pin').length`), 4);
    assert.match(await page.evaluate(`document.querySelector('${cards}[href="/web/cheeses/sicilia"] [data-testid="cheese-milk-badge"]').textContent`), /Вид молока: смесь \(овечье 80,25%, коровье\)/);
    assert.match(await page.evaluate(`document.querySelector('${cards}[href="/web/cheeses/sardegna"] [data-testid="cheese-milk-badge"]').textContent`), /Вид молока: не уточнён/);
    await page.tap(pin('Пекорино'));
    assert.match(await page.evaluate(`document.querySelector('.ed-map-aside [data-testid="cheese-milk-badge"]').textContent`), /овечье 80,25%, коровье/);
    await page.wait(`!!document.querySelector('.ed-map-aside a[href="/web/cheeses/sicilia"]')`);

    await country('Франция');
    await page.wait(`!!document.querySelector('.ed-map-canvas > svg[aria-label="Карта: Франция"]') && document.querySelectorAll('.ed-map-pin').length === 1 && !!document.querySelector('${pin('Камамбер')}')`);
    await page.wait(`!!document.querySelector('${cards}[href="/web/cheeses/camembert"]')`);
    assert.deepEqual(await visibleCards(), ['camembert']);
    assert.equal(await page.evaluate(`document.querySelector('.ed-map-controls button').getAttribute('aria-pressed')`), 'true');
    const searchInput = 'input[aria-label="Поиск сырных статей"]';
    await page.fill(searchInput, 'Камамбер');
    await page.tap('.ed-map-controls button:last-child');
    await page.wait(`document.querySelector('.ed-map-canvas > svg[aria-label="Карта мира"]') && !document.querySelector('${focused}')`);
    await page.wait(`!!document.querySelector('${pin('Вермонтский чеддер')}') && !!document.querySelector('${pin('Сыр Токати')}')`);
    const globalPins = await page.evaluate(`Array.from(document.querySelectorAll('.ed-map-pin'), button => button.getAttribute('aria-label'))`);
    for (const item of items) assert.ok(globalPins.some(label => label.includes(item.title)), item.title);
    assert.equal(await page.evaluate(`document.querySelector('.ed-filter-select select').value`), 'Франция');
    assert.equal(await page.evaluate(`document.querySelector('${searchInput}').value`), 'Камамбер');
    assert.equal(await page.evaluate(`document.querySelectorAll('.ed-cheese-grid a[href^="/web/cheeses/"]').length`), 1);
    await page.tap('.ed-map-controls button:first-child');
    await page.wait(`document.querySelector('.ed-map-canvas > svg[aria-label="Карта: Франция"]') && document.querySelectorAll('.ed-map-pin').length === 1 && !!document.querySelector('${pin('Камамбер')}')`);
    await page.fill(searchInput, '');
    await country('Германия');
    await page.wait(`document.querySelector('.ed-map-canvas > svg[aria-label="Карта: Германия"]') && document.querySelector('.ed-map-box [role="status"]')?.textContent.includes('нет опубликованных')`);
    await country('Россия');
    await page.wait(`document.querySelector('.ed-map-canvas > svg[aria-label="Карта: Россия"]') && !!document.querySelector('${pin('Вологодский сыр')}')`);
    await page.wait(`!!document.querySelector('${cards}[href="/web/cheeses/vologda"]')`);
    assert.deepEqual(await visibleCards(), ['vologda']);
    await fit();
    assert.equal(await page.evaluate(`Boolean(document.querySelector('${pin('Сулугуни')}'))`), false);
    await page.tap(pin('Вологодский сыр'));
    assert.match(await page.evaluate(`document.querySelector('.ed-map-aside').innerText`), /СССР[\s\S]*На современной карте: Россия/);
    await country('Грузия');
    await page.wait(`document.querySelector('.ed-map-canvas > svg[aria-label="Карта: Грузия"]') && !!document.querySelector('${pin('Сулугуни')}')`);
    await fit();
    await country('');
    await page.wait(`document.querySelector('.ed-map-canvas > svg[aria-label="Карта мира"]') && document.querySelectorAll('${cards}').length === ${items.length}`);
    assert.deepEqual(await visibleCards(), items.map(item => item.id));
    await page.tap('.ed-map-controls button:first-child');
    await page.wait(`document.querySelector('.ed-map-canvas > svg[aria-label="Карта: Италия"]') && document.querySelectorAll('${cards}').length === 5`);
    assert.deepEqual(await visibleCards(), italianCards);

    const captureScroll = selector => page.evaluate(`document.querySelector(${JSON.stringify(selector)})
      .addEventListener('click', () => { window.atlasScrollBeforeOpen = window.scrollY; }, { once: true })`);
    const expectArticleStart = async title => {
      await page.wait(`document.querySelector('.ed-article-head h1')?.textContent.includes(${JSON.stringify(title)})`);
      assert.ok(await page.evaluate('window.atlasScrollBeforeOpen > 200'), 'the article was opened from a scrolled atlas');
      assert.equal(await page.evaluate('Math.round(window.scrollY)'), 0, 'navigation starts at the top of the detail page');
      assert.ok(await page.evaluate(`(() => {
        const title = document.querySelector('.ed-article-head h1').getBoundingClientRect();
        return title.top >= 0 && title.bottom <= window.innerHeight;
      })()`), 'the article title is visible as soon as it opens');
    };

    await page.tap(pin('Пекорино'));
    const previewLink = '.ed-map-aside a[href="/web/cheeses/sicilia"]';
    await page.wait(`!!document.querySelector('${previewLink}')`);
    await captureScroll(previewLink);
    await page.tap(previewLink);
    await expectArticleStart('Пекорино');
    assert.match(await page.evaluate(`document.querySelector('.ed-article-head [data-testid="cheese-milk-badge"]').textContent`), /овечье 80,25%, коровье/);

    await page.setViewport({ width: 1280, height: 800 });
    await page.click('.ed-back');
    const listCard = `${cards}[href="/web/cheeses/gorgonzola"]`;
    await page.wait(`!!document.querySelector('${listCard}') && !!document.querySelector('${focused}')`);
    await captureScroll(listCard);
    await page.click(listCard);
    await expectArticleStart('Горгонзола');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
