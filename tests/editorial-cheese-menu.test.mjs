import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchBrowser } from './helpers/browser.mjs';

const build = process.env.EDITORIAL_MENU_BUILD_DIR;
const base = build ? 'https://editorial-menu.example.test'
  : process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '';

test('cheese sections paginate independently, follow saved states and publication, and fit mobile', {
  skip: !base, timeout: 90000,
}, async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const requests = [], unexpected = [], exceptions = [], writes = [];
  let failNextSave = false;
  const entries = Array.from({ length: 26 }, (_, i) => ({
    id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
    kind: 'cheese', revision: 2, createdBy: 'fixture', updatedBy: 'fixture',
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', moderation: null,
    data: {
      title: `Fixture cheese ${i}`, nameOriginal: `Formaggio ${i}`, status: i < 21 ? 'draft' : i === 21 ? 'pending_review' : 'ready',
      country: 'Италия', region: '', description: '', sortOrder: 0,
      history: 'History', characteristics: 'Characteristics', culinaryUses: 'Uses',
      photos: ['https://example.org/cheese.jpg'], sources: ['https://example.org/source'],
      latitude: 45, longitude: 9, productionCountry: '', productionPoints: [],
      productIds: [], videoIds: [], externalVideoUrls: [],
    },
    publication: i >= 24 ? { publishedRevision: 2, publishedAt: '2026-01-01T00:00:00Z' } : null,
  }));
  entries[25].data.status = 'draft';
  entries[25].revision = 3;
  const stageOf = entry => entry.publication ? 'published' : entry.data.status === 'ready' ? 'approved' : 'drafts';
  async function clickText(text, scope = 'document') {
    await page.evaluate(`(() => { const el=[...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}); if(!el)throw Error('Missing button');el.setAttribute('data-test-click',''); })()`);
    await page.click('[data-test-click]');
    await page.evaluate(`document.querySelector('[data-test-click]')?.removeAttribute('data-test-click')`);
  }
  const selected = stage => `document.querySelector('[data-testid="cheese-stage-${stage}"]')?.getAttribute('aria-pressed')==='true'`;
  page.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails.text));
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `if('serviceWorker' in navigator)navigator.serviceWorker.register=async()=>({});window.confirm=()=>true;`,
  });
  await page.send('Fetch.enable', { patterns: [
    { urlPattern: '*/web-api/*' }, { urlPattern: '*/api/*' },
    ...(build ? [{ urlPattern: '*', resourceType: 'Document' }, { urlPattern: '*/assets/*' }] : []),
  ] });
  page.on('Fetch.requestPaused', async event => {
    const url = new URL(event.request.url), path = url.pathname;
    let body = [], code = 200, type = 'application/json';
    if (build && (event.resourceType === 'Document' || path.startsWith('/assets/'))) {
      const asset = event.resourceType === 'Document' ? '/index.html' : path;
      body = await readFile(join(build, asset));
      type = asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html';
    } else if (path === '/web-api/auth/refresh') {
      body = { accessToken: 'isolated-menu-fixture', user: { id: 'fixture', firstName: 'Fixture' } };
    } else if (path === '/web-api/admin/check') body = { ok: true, isMasterAdmin: true };
    else if (path === '/web-api/admin/editorial') {
      const stage = url.searchParams.get('stage'), kind = url.searchParams.get('kind');
      const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 50);
      requests.push({ stage, kind, offset });
      const filtered = kind === 'cheese' ? entries.filter(e => !stage || stageOf(e) === stage) : [];
      body = { items: filtered.slice(offset, offset + limit), total: filtered.length };
    } else if (path.match(/\/editorial\/[^/]+\/(?:publish|unpublish)$/)) {
      const id = path.split('/').at(-2), entry = entries.find(e => e.id === id);
      entry.revision++;
      entry.publication = path.endsWith('/unpublish') ? null
        : { publishedRevision: entry.revision, publishedAt: '2026-01-02T00:00:00Z' };
      body = entry;
    } else if (path.match(/\/editorial\/[^/]+$/) && event.request.method === 'PATCH') {
      const entry = entries.find(e => e.id === path.split('/').at(-1));
      const request = JSON.parse(event.request.postData);
      writes.push(request);
      if (failNextSave) { failNextSave = false; code = 503; body = { error: 'Fixture save unavailable' }; }
      else {
        entry.data = request.data;
        entry.revision += request.publish ? 2 : 1;
        if (request.publish) entry.publication = { publishedRevision: entry.revision, publishedAt: '2026-01-02T00:00:00Z' };
        body = entry;
      }
    } else if (path === '/web-api/admin/editorial-ai/history') body = { items: [], total: 0 };
    else if (event.request.method !== 'GET') { unexpected.push(`${event.request.method} ${path}`); code = 400; }
    await page.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: code,
      responseHeaders: [{ name: 'Content-Type', value: type }],
      body: (Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))).toString('base64') });
  });
  try {
    await page.send('Page.navigate', { url: `${base}/web/admin/cheeses` });
    await page.wait(`${selected('drafts')} && document.querySelectorAll('[id^="entry-"]').length===20`, 45000);
    await clickText('Далее');
    await page.wait(`document.querySelectorAll('[id^="entry-"]').length===2`);
    assert.ok(requests.some(r => r.stage === 'drafts' && r.offset === 20));
    assert.ok(await page.evaluate(`document.body.innerText.includes('Ожидает подтверждения')`));
    await page.click('[data-testid="cheese-stage-approved"]');
    await page.wait(`${selected('approved')} && !!document.getElementById('entry-${entries[22].id}')`);
    assert.equal(requests.filter(r => r.stage === 'approved').at(-1).offset, 0);
    assert.equal(await page.evaluate(`document.querySelectorAll('[id^="entry-"]').length`), 2);
    // CDP needs Enter's character as well as its key code to trigger a native
    // button click (without text it sends keydown but not native activation).
    await page.evaluate(`document.querySelector('[data-testid="cheese-stage-published"]').focus()`);
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await page.wait(`${selected('published')} && document.querySelectorAll('[id^="entry-"]').length===2`);
    await page.click('[data-testid="cheese-stage-approved"]');
    await page.wait(`${selected('approved')} && !!document.getElementById('entry-${entries[22].id}')`);
    await clickText('Опубликовать', `document.getElementById('entry-${entries[22].id}')`);
    await page.wait(`${selected('published')} && document.querySelectorAll('[id^="entry-"]').length===3`);
    assert.ok(await page.evaluate(`document.body.innerText.includes('текущая версия: в редакции')`));
    await clickText('Снять с публикации', `document.getElementById('entry-${entries[22].id}')`);
    await page.wait(`${selected('approved')} && !!document.getElementById('entry-${entries[22].id}')`);
    await clickText('Изменить', `document.getElementById('entry-${entries[22].id}')`);
    await page.wait(`!!document.querySelector('#ed-status')`);
    await page.evaluate(`(() => {const select=document.querySelector('#ed-status');select.value='draft';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await page.click('[data-testid="button-editorial-save-bottom"]');
    await page.wait(`${selected('drafts')} && !document.querySelector('[role="dialog"]')`);
    assert.equal(requests.filter(r => r.stage === 'drafts').at(-1).offset, 0);

    await clickText('Изменить', `document.getElementById('entry-${entries[0].id}')`);
    await page.wait(`!!document.querySelector('[data-testid="button-editorial-save-top"]')`);
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-testid^="button-editorial-save-"]').length`), 2);
    await page.fill('#ed-title', 'Edited from upper save button');
    await page.click('[data-testid="button-editorial-save-top"]');
    await page.wait(`!document.querySelector('[role="dialog"]')`);
    assert.equal(entries[0].data.title, 'Edited from upper save button');
    assert.equal(writes.at(-1).publish, undefined, 'ordinary top save never publishes');
    await clickText('Изменить', `document.getElementById('entry-${entries[0].id}')`);
    await page.wait(`!!document.querySelector('#ed-status')`);
    await page.evaluate(`(() => { const s=document.querySelector('#ed-status');s.value='publish';s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await page.wait(`document.querySelector('[data-testid="button-editorial-save-top"]')?.textContent==='Сохранить и опубликовать'`);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="button-editorial-save-bottom"]').textContent`), 'Сохранить и опубликовать');
    const beforeInvalid = writes.length;
    await page.fill('#ed-history', '');
    await page.click('[data-testid="button-editorial-save-top"]');
    await page.wait(`!!document.querySelector('[role="dialog"] [role="alert"]')`);
    assert.equal(writes.length, beforeInvalid, 'incomplete article cannot be published from either button');
    await page.fill('#ed-history', 'Verified expanded history');
    // Both controls are reachable on phones; the upper one starts in view.
    await page.evaluate(`document.activeElement?.blur()`);
    await page.setViewport({ width: 390, height: 844, mobile: true });
    await page.evaluate(`new Promise(resolve=>requestAnimationFrame(()=>{document.querySelector('[role="dialog"]').scrollTop=0;requestAnimationFrame(resolve);}))`);
    await page.wait(`(() => {const r=document.querySelector('[data-testid="button-editorial-save-top"]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth;})()`);
    await mkdir('generated-artifacts', { recursive: true });
    const editorImage = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 75 });
    await writeFile('generated-artifacts/editorial-save-top-390.jpg', Buffer.from(editorImage.data, 'base64'));
    await page.setViewport({ width: 1280, height: 844, mobile: false });
    failNextSave = true;
    await page.evaluate(`(() => {document.querySelector('[data-testid="button-editorial-save-top"]').click();document.querySelector('[data-testid="button-editorial-save-bottom"]').click();})()`);
    await page.wait(`document.querySelector('[role="dialog"]')?.innerText.includes('Fixture save unavailable') && !document.querySelector('[data-testid="button-editorial-save-top"]').disabled`);
    assert.equal(writes.length, beforeInvalid + 1, 'rapid use of both buttons submits only once');
    assert.equal(entries[0].publication, null, 'failed combined save stays private');
    await page.click('[data-testid="button-editorial-save-bottom"]');
    await page.wait(`${selected('published')} && !document.querySelector('[role="dialog"]')`);
    assert.equal(writes.at(-1).publish, true);
    assert.equal(writes.at(-1).data.status, 'ready', 'combined action is never stored as an unsupported article status');
    assert.equal(entries[0].data.history, 'Verified expanded history');
    await clickText('Изменить', `document.getElementById('entry-${entries[0].id}')`);
    await page.wait(`!!document.querySelector('#ed-status')`);
    assert.equal(await page.evaluate(`document.querySelector('#ed-status').value`), 'ready', 'publication intent resets on reopening');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="button-editorial-save-top"]').textContent`), 'Сохранить изменения');
    await clickText('Отмена', `document.querySelector('[role="dialog"]')`);
    await page.wait(`!document.querySelector('[role="dialog"]')`);
    await page.click('[data-testid="cheese-stage-approved"]');
    await page.wait(selected('approved'));
    await mkdir('generated-artifacts', { recursive: true });
    for (const width of [1280, 390]) {
      await page.setViewport({ width, height: 844, mobile: width < 500 });
      await page.evaluate(`window.scrollTo(0,0)`);
      assert.ok(await page.evaluate(`(() => {const r=document.querySelector('[data-testid="cheese-editorial-menu"]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})()`));
      const image = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 75 });
      await writeFile(`generated-artifacts/editorial-cheese-menu-${width}.jpg`, Buffer.from(image.data, 'base64'));
    }
    await page.send('Page.navigate', { url: `${base}/web/admin/videos` });
    await page.wait(`document.body.innerText.includes('Видео и материалы')`);
    assert.equal(await page.evaluate(`!!document.querySelector('[data-testid="cheese-editorial-menu"]')`), false);
    assert.equal(requests.filter(r => r.kind === 'video').at(-1).stage, null);
    assert.deepEqual(unexpected, []);
    assert.deepEqual(exceptions, []);
  } finally { await browser.close(); }
});
