import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser } from './helpers/browser.mjs';

test('editorial images support paste, drop, file choice, validation and explicit draft saving', {
  skip: !process.env.REPLIT_DEV_DOMAIN, timeout: 90000,
}, async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const id = '98989898-9898-4989-8989-989898989898';
  let entry = {
    id, kind: 'cheese', revision: 1, publication: null,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    data: {
      title: 'Кастельманьо', nameOriginal: 'Castelmagno', description: '', history: '',
      characteristics: '', culinaryUses: '', country: 'Италия', region: 'Пьемонт',
      status: 'draft', sortOrder: 0, photos: ['/objects/existing.png'], sources: [],
      latitude: null, longitude: null, productionCountry: '', productionPoints: [],
      productIds: [], videoIds: [], externalVideoUrls: [],
    },
  };
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l4sAAAAASUVORK5CYII=';
  let uploadCount = 0, holdUpload = false, heldUpload, failNext = false;
  const saves = [], unexpected = [], errors = [], requests = [];
  await page.send('Network.enable');
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `if ('serviceWorker' in navigator) navigator.serviceWorker.register=async()=>({}); window.confirm=()=>true;`,
  });
  page.on('Runtime.exceptionThrown', event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
  await page.send('Fetch.enable', { patterns: [
    { urlPattern: '*/web-api/*' }, { urlPattern: '*/objects/*' },
    { urlPattern: '*telegram.org/js/telegram-web-app.js*' },
    { urlPattern: 'https://tile.openstreetmap.org/*' },
  ] });
  page.on('Fetch.requestPaused', async event => {
    const url = new URL(event.request.url), path = url.pathname;
    requests.push({ path, method: event.request.method });
    if (path.startsWith('/objects/') || url.hostname === 'tile.openstreetmap.org') {
      await page.send('Fetch.fulfillRequest', {
        requestId: event.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'image/png' }], body: png,
      });
      return;
    }
    let body = [], status = 200;
    if (path === '/web-api/auth/refresh')
      body = { accessToken: 'photo-fixture', user: { id: 'photo-operator', firstName: 'Fixture' } };
    else if (path === '/web-api/admin/check') body = { ok: true, isMasterAdmin: true };
    else if (path === '/web-api/admin/editorial')
      body = url.searchParams.get('kind') === 'cheese' ? { items: [entry], total: 1 } : { items: [], total: 0 };
    else if (path === '/web-api/admin/editorial-ai/history') body = { items: [], total: 0 };
    else if (path === '/web-api/admin/uploads/image') {
      uploadCount++;
      if (holdUpload) await new Promise(resolve => { heldUpload = resolve; });
      if (failNext) { status = 503; body = { error: 'Fixture storage unavailable' }; failNext = false; }
      else body = { path: `/objects/upload-${uploadCount}.png` };
    } else if (path === `/web-api/admin/editorial/${id}` && event.request.method === 'PATCH') {
      const request = JSON.parse(event.request.postData);
      saves.push(request);
      entry = { ...entry, revision: entry.revision + 1, data: request.data };
      body = entry;
    } else if (event.request.method !== 'GET') unexpected.push(path);
    await page.send('Fetch.fulfillRequest', {
      requestId: event.requestId, responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify(body)).toString('base64'),
    });
  });
  const zone = '[data-testid="editorial-photo-dropzone"]';
  const dialog = '[data-testid="editorial-entry-editor"]';
  const photos = () => page.evaluate(`document.querySelector('#ed-photos').value.split('\\n').filter(Boolean)`);
  const button = async text => {
    await page.evaluate(`(() => {
      const b=[...document.querySelectorAll('${dialog} button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});
      if(!b) throw Error('Missing button'); b.setAttribute('data-photo-test-action','');
    })()`);
    await page.evaluate(`document.querySelector('[data-photo-test-action]').click()`);
    await page.evaluate(`document.querySelectorAll('[data-photo-test-action]').forEach(e=>e.removeAttribute('data-photo-test-action'))`);
  };
  const sendFiles = (mode, specs) => page.evaluate(`(() => {
    const transfer = new DataTransfer();
    for(const spec of ${JSON.stringify(specs)}) transfer.items.add(new File(
      [spec.size ? new Uint8Array(spec.size) : Uint8Array.from(atob('${png}'),c=>c.charCodeAt(0))],
      spec.name, {type:spec.type ?? 'image/png'}));
    if(${JSON.stringify(mode)}==='choose'){
      const input=document.querySelector('[data-testid="editorial-photo-file"]');
      input.files=transfer.files; input.dispatchEvent(new Event('change',{bubbles:true}));
    } else if(${JSON.stringify(mode)}==='paste'){
      document.querySelector('${zone}').dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}));
    } else document.querySelector('${zone}').dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));
  })()`);
  try {
    await page.send('Page.navigate', { url: `https://${process.env.REPLIT_DEV_DOMAIN}/web/admin/cheeses?entry=${id}` });
    await page.wait(`!!document.querySelector('${zone}')`);
    await sendFiles('paste', [{ name: 'clipboard.png' }]);
    await page.wait(`document.querySelector('#ed-photos').value.includes('/objects/upload-1.png')`);
    assert.deepEqual(await photos(), ['/objects/existing.png', '/objects/upload-1.png']);
    assert.equal(saves.length, 0, 'upload never saves or publishes the article automatically');
    await sendFiles('drop', [{ name: 'drop-one.jpg', type: 'image/jpeg' }, { name: 'drop-two.png' }]);
    await page.wait(`document.querySelector('#ed-photos').value.includes('/objects/upload-3.png')`);
    await sendFiles('choose', [{ name: 'empty-mime.webp', type: '' }]);
    await page.wait(`document.querySelector('#ed-photos').value.includes('/objects/upload-4.png')`);
    assert.equal((await photos()).length, 5);
    await sendFiles('drop', [{ name: 'bad.svg', type: 'image/svg+xml' }, { name: 'big.png', size: 5 * 1024 * 1024 + 1 }]);
    await page.wait(`document.querySelector('[data-testid="cheese-photo-editor"]').innerText.includes('Файл больше')`);
    assert.equal(uploadCount, 4);
    // An upload in progress blocks save, close and concurrent image imports.
    holdUpload = true;
    await sendFiles('paste', [{ name: 'held.png' }]);
    await page.wait(`!!document.querySelector('[data-testid="editorial-photo-progress"]')`);
    await sendFiles('drop', [{ name: 'duplicate.png' }]);
    assert.equal(uploadCount, 5);
    assert.equal(await page.evaluate(`document.querySelector('#ed-photos').disabled || !!document.querySelector('#ed-photos').closest('fieldset[disabled]')`), true);
    await page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    assert.equal(await page.evaluate(`!!document.querySelector('${dialog}')`), true);
    assert.equal(await page.evaluate(`!![...document.querySelectorAll('${dialog} button')].find(b=>b.textContent.includes('Сохранение')&&b.disabled)`), true);
    holdUpload = false; heldUpload();
    await page.wait(`document.querySelector('#ed-photos').value.includes('/objects/upload-5.png')`);
    failNext = true;
    await sendFiles('drop', [{ name: 'fails.png' }, { name: 'succeeds.png' }]);
    await page.wait(`document.querySelector('#ed-photos').value.includes('/objects/upload-7.png')`);
    assert.equal((await photos()).length, 7, 'successful files survive partial failure');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="cheese-photo-editor"]').innerText.includes('Fixture storage unavailable')`), true);
    await page.click('[data-testid="editorial-photo-remove-1"]');
    assert.equal((await photos()).includes('/objects/upload-1.png'), false);
    assert.equal(requests.some(r => r.method === 'DELETE'), false, 'removal does not delete storage objects');
    // Text-only clipboard contents keep the normal paste behavior.
    assert.equal(await page.evaluate(`(() => {
      const dt=new DataTransfer();dt.setData('text/plain','https://example.org/photo.jpg');
      const e=new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true});
      document.querySelector('#ed-photos').dispatchEvent(e);return e.defaultPrevented;
    })()`), false);
    const twelve = Array.from({ length: 12 }, (_, i) => `/objects/limit-${i}.png`);
    const beforeCapacityTest = await photos();
    await page.fill('#ed-photos', twelve.join('\n'));
    await sendFiles('drop', [{ name: 'thirteenth.png' }]);
    await page.wait(`document.querySelector('[data-testid="cheese-photo-editor"]').innerText.includes('не более 12')`);
    assert.equal(uploadCount, 7);
    await page.fill('#ed-photos', beforeCapacityTest.join('\n'));
    for (const width of [1280, 390]) {
      await page.send('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: width < 500 });
      await page.evaluate(`document.querySelector('${zone}').scrollIntoView({block:'center'})`);
      assert.equal(await page.evaluate(`(() => {const e=document.querySelector('${dialog}');return e.scrollWidth<=e.clientWidth+2})()`), true);
      const image = await page.send('Page.captureScreenshot', { format: 'png' });
      await mkdir('generated-artifacts/verification/editorial-photos', { recursive: true });
      await writeFile(`generated-artifacts/verification/editorial-photos/upload-${width}.png`, Buffer.from(image.data, 'base64'));
    }
    await button('Сохранить изменения');
    await page.wait(`!document.querySelector('${dialog}')`, 5000).catch(async error => {
      console.log('Save diagnostic', { saves, unexpected, errors, text: await page.evaluate(`document.querySelector('${dialog}')?.innerText`) });
      throw error;
    });
    assert.equal(saves.length, 1);
    assert.deepEqual(saves[0].data.photos, beforeCapacityTest);
    assert.equal(saves[0].data.status, 'draft');
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
  } finally { heldUpload?.(); await browser.close(); }
});
