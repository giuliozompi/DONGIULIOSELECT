// Opt-in integration against a disposable admin + products in DEVELOPMENT only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { launchBrowser } from './helpers/browser.mjs';
import { videoDataSchema, cheeseDataSchema, priceDataSchema } from '../shared/editorial.ts';

test('published editorial routes, atlas, privacy, moderation and live-cart additions', {
  skip: !process.env.EDITORIAL_PUBLIC_UI_FIXTURE, timeout: 180000,
}, async () => {
  const f = JSON.parse(await readFile(process.env.EDITORIAL_PUBLIC_UI_FIXTURE, 'utf8'));
  const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
  const browser = await launchBrowser(), admin = await browser.newPage(), guest = await browser.newPage();
  const errors = [];
  for (const page of [admin, guest]) {
    page.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails.text));
    page.on('Page.javascriptDialogOpening', () => page.send('Page.handleJavaScriptDialog', { accept: true }));
  }
  const suffix = randomUUID().slice(0, 6), prefix = `E2E-EDITORIAL-${suffix}`;
  async function navigate(page, path, text) {
    await page.send('Page.navigate', { url: base + path });
    await page.wait(`document.body?.innerText.includes(${JSON.stringify(text)})`);
  }
  async function clickText(page, text, scope = 'document') {
    await page.wait(`!![...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`);
    await page.evaluate(`document.querySelectorAll('[data-e2e-click]').forEach(e=>e.removeAttribute('data-e2e-click'));
      [...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled).setAttribute('data-e2e-click','');`);
    await page.wait(`(()=>{const e=document.querySelector('[data-e2e-click]');e.scrollIntoView({block:'center',behavior:'instant'});
      const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()`);
    await page.click('[data-e2e-click]');
  }
  async function request(method, path, body) {
    const result = await admin.evaluate(`(async()=>{
      const response=await fetch('/web-api'+${JSON.stringify(path)},{
        method:${JSON.stringify(method)},
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+sessionStorage.getItem('dgs_web_access_token')},
        body:${body === undefined ? 'undefined' : `JSON.stringify(${JSON.stringify(body)})`}
      });
      return {status:response.status,data:response.status===204?null:await response.json()};
    })()`);
    assert.ok(result.status >= 200 && result.status < 300, `API ${method} ${path}: ${result.status} ${JSON.stringify(result.data)}`);
    return result.data;
  }
  const created = [];
  async function create(kind, data) {
    const result = await request('POST', '/admin/editorial', { kind, data });
    created.push(result.id);
    return result;
  }
  async function screenshot(page, name) {
    await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const image = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 75 });
    await writeFile(`/tmp/editorial-public-${name}.jpg`, Buffer.from(image.data, 'base64'));
  }
  const cart = () => guest.evaluate(`JSON.parse(localStorage.getItem('dgs-web-cart')).state`);
  async function addProduct(id) {
    const slug = id === f.kgProductId ? `${f.slug}-kg` : `${f.slug}-piece`;
    await guest.evaluate(`document.querySelector('a[href="/web/product/${slug}"]').closest('.ed-product').setAttribute('data-e2e-product','')`);
    await clickText(guest, 'В корзину', `document.querySelector('[data-e2e-product]')`);
    await guest.wait(`!document.querySelector('[data-e2e-product] button').disabled || document.querySelector('[data-e2e-product]').innerText.includes('Нет в наличии')`);
    await guest.evaluate(`document.querySelector('[data-e2e-product]').removeAttribute('data-e2e-product')`);
  }
  try {
    await navigate(admin, '/web/admin/videos', 'Войдите в панель');
    await admin.fill('#admin-email', f.email); await admin.fill('#admin-password', f.password);
    await admin.click('[data-testid="button-admin-login"]');
    await admin.wait(`document.body.innerText.includes('Видео и материалы')`);
    const v = await create('video', videoDataSchema.parse({
      title: `${prefix}-Video`, description: 'Activities, not a cheese-only videoteca',
      status: 'ready', category: 'places', url: 'https://www.youtube.com/playlist?list=PLr2lpSOEo-7IyZFeC_BR3xx5gox3EWDWZ', cover: f.photo,
    }));
    const secret = await create('video', videoDataSchema.parse({
      title: 'PRIVATE_UNPUBLISHED_VIDEO', category: 'interview', url: 'https://t.me/dongiulioselect/128',
    }));
    await navigate(admin, '/web/admin/videos', `${prefix}-Video`);
    await clickText(admin, 'Опубликовать');
    await admin.wait(`document.body.innerText.includes('Опубликовано')`);
    const c = await create('cheese', cheeseDataSchema.parse({
      title: `${prefix}-Cheese`, description: 'Fixture; not a real cheese article', country: 'Италия', region: 'Ломбардия',
      productionCountry: 'Россия', latitude: 45.46, longitude: 9.19, status: 'ready',
      photos: [f.photo], history: 'E2E documented history', characteristics: 'E2E characteristics',
      culinaryUses: 'E2E uses', sources: ['https://example.org/source'], videoIds: [v.id, secret.id],
      productIds: [f.kgProductId, f.pieceProductId],
    }));
    const nearby = await create('cheese', cheeseDataSchema.parse({
      ...c.data, title: `${prefix}-Nearby`, videoIds: [], productIds: [], latitude: 45.4601, longitude: 9.1901,
    }));
    const france = await create('cheese', cheeseDataSchema.parse({
      ...c.data, title: `${prefix}-France`, country: 'Франция', region: 'Нормандия',
      latitude: 48.9, longitude: 0.2, videoIds: [], productIds: [],
    }));
    for (const record of [nearby, france]) await request('POST', `/admin/editorial/${record.id}/publish`, { revision: record.revision });
    await navigate(admin, '/web/admin/cheeses', `${prefix}-Cheese`);
    await admin.evaluate(`(()=>{const h=[...document.querySelectorAll('h2,h3')].find(e=>e.textContent===${JSON.stringify(c.data.title)});
      const card=h.closest('[data-component-name="Card"]') || h.closest('.rounded-xl') || h.parentElement.parentElement.parentElement;
      [...card.querySelectorAll('button')].find(b=>b.textContent.trim()==='Опубликовать').setAttribute('data-e2e-publish','');})()`);
    await admin.click('[data-e2e-publish]');
    await admin.wait(`!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Снять с публикации')`);
    for (const [currency, price, store, approved] of [
      ['EUR', 12.5, 'Approved Italy store', true], ['RUB', 1200, 'Approved Russia store', true],
      ['USD', 1, 'PRIVATE_PENDING_PRICE', false],
    ]) {
      const p = await create('price', priceDataSchema.parse({
        cheeseId: c.id, sourceType: 'user', price, currency, country: currency === 'RUB' ? 'Россия' : 'Италия',
        store, sourceUrl: '', observedOn: new Date().toISOString().slice(0, 10),
        packageQuantity: currency === 'EUR' ? 250 : 1, packageUnit: currency === 'EUR' ? 'g' : 'kg',
        notes: 'PRIVATE_PRICE_NOTE',
      }));
      if (approved) await request('POST', `/admin/editorial/${p.id}/moderate`, { revision: p.revision, decision: 'approved', note: 'PRIVATE_MODERATION_NOTE' });
    }
    console.log('PASS: real admin login, explicit UI publication, fixtures and moderated prices');

    await navigate(guest, '/web/videos', `${prefix}-Video`);
    assert.equal(await guest.evaluate(`document.body.innerText.includes('PRIVATE_UNPUBLISHED_VIDEO')`), false);
    await guest.fill('input[aria-label="Найти видео"]', 'no-match-for-test');
    await guest.wait(`document.body.innerText.includes('По заданным фильтрам видео не найдены')`);
    await navigate(guest, `/web/videos/${v.id}`, `${prefix}-Video`);
    assert.equal(await guest.evaluate(`document.querySelectorAll('.ed-page iframe').length`), 0);
    await guest.click('.ed-player-start');
    await guest.wait(`!!document.querySelector('.ed-page iframe')`);
    assert.match(await guest.evaluate(`document.querySelector('.ed-page iframe').src`), /^https:\/\/www.youtube-nocookie.com\/embed\/videoseries\?list=/);
    assert.equal(await guest.evaluate(`!!document.querySelector('.ed-source[target="_blank"]')`), true);
    await navigate(guest, `/web/videos/${secret.id}`, 'Материал не опубликован');
    console.log('PASS: guest search, draft denied, click-to-load provider player and source fallback (playback not certified)');

    await navigate(guest, '/web/cheeses', `${prefix}-Cheese`);
    await guest.wait(`document.querySelectorAll('.ed-map-canvas svg path').length>100`);
    await guest.wait(`!![...document.querySelectorAll('.ed-map-pin')].find(b=>b.getAttribute('aria-label')==='Группа из 2 сыров')`);
    await guest.click('.ed-map-pin[aria-label="Группа из 2 сыров"]');
    await guest.wait(`document.querySelectorAll('.ed-pin-list a').length===2`);
    await guest.fill('input[aria-label="Поиск сырных статей"]', `${prefix}-France`);
    await guest.wait(`document.querySelectorAll('.ed-cheese-card').length===1`);
    assert.equal(await guest.evaluate(`document.querySelector('.ed-cheese-card').getAttribute('href')`), `/web/cheeses/${france.id}`);
    await screenshot(guest, 'atlas-desktop');
    await navigate(guest, `/web/cheeses/${c.id}`, `${prefix}-Cheese`);
    await guest.wait(`document.body.innerText.includes('50 EUR/кг') && document.body.innerText.includes('1200 RUB')`);
    assert.equal(await guest.evaluate(`document.body.innerText.includes('PRIVATE_')`), false);
    assert.equal(await guest.evaluate(`document.body.innerText.includes('Фактическая страна производства, указанная редакцией: Россия')`), true);
    assert.equal(await guest.evaluate(`document.querySelectorAll('.ed-related-grid .ed-video-card').length`), 1);
    await screenshot(guest, 'story-desktop');
    console.log('PASS: real geography, overlapping pins accessible, search, article, public-only media and prices');

    await request('PATCH', `/admin/products/${f.kgProductId}`, { price: '250.00' });
    await addProduct(f.kgProductId);
    let state = await cart();
    assert.equal(state.items[0].price, '250.00'); assert.equal(state.items[0].quantity, 0.2);
    await request('PATCH', `/admin/products/${f.kgProductId}`, { price: '300.00' });
    await addProduct(f.kgProductId);
    state = await cart();
    assert.equal(state.items[0].price, '300.00'); assert.equal(state.items[0].quantity, 0.3); assert.equal(state.subtotal, 90);
    await request('PATCH', `/admin/products/${f.pieceProductId}`, { inStock: false });
    await addProduct(f.pieceProductId);
    assert.equal((await cart()).items.length, 1);
    await guest.wait(`document.body.innerText.includes('Товар сейчас отсутствует')`);
    console.log('PASS: catalogue revalidation, existing cart repricing, normal weight increments and late out-of-stock rejection');

    await guest.setViewport({ width: 390, height: 844, mobile: true });
    await navigate(guest, '/web/cheeses', `${prefix}-Cheese`);
    assert.equal(await guest.evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), true);
    assert.equal(await guest.evaluate(`document.querySelector('.ed-search').getBoundingClientRect().height`), 44);
    await screenshot(guest, 'atlas-mobile');
    await navigate(guest, `/web/cheeses/${c.id}`, `${prefix}-Cheese`);
    assert.equal(await guest.evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), true);
    await screenshot(guest, 'story-mobile');
    await navigate(guest, '/web/videos', `${prefix}-Video`);
    assert.equal(await guest.evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), true);
    console.log('PASS: mobile atlas, story and video library without horizontal overflow');

    await navigate(admin, '/web/admin/videos', `${prefix}-Video`);
    await clickText(admin, 'Снять с публикации');
    await admin.wait(`!document.body.innerText.includes('Снять с публикации')`);
    await navigate(guest, `/web/videos/${v.id}`, 'Материал не опубликован');
    assert.deepEqual(errors, []);
    console.log('PASS: explicit UI withdrawal removes public access; no browser exceptions');
    await writeFile('/tmp/editorial-public-browser-result.json', JSON.stringify({ created, cheeseId: c.id, videoId: v.id }));
  } catch (error) {
    await screenshot(guest, 'failure');
    console.log('Visible state:', await guest.evaluate(`document.body?.innerText.slice(-2000)`));
    throw error;
  } finally { await admin.close(); await guest.close(); await browser.close(); }
});
