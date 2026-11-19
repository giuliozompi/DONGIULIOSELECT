import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchBrowser } from './helpers/browser.mjs';

const build = process.env.EDITORIAL_MENU_BUILD_DIR;
const base = build ? 'https://editorial-menu.example.test'
  : process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '';

test('cheese staging separates bulk approval from publication and preserves single-card workflows', {
  skip: !base, timeout: 90000,
}, async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const requests = [], unexpected = [], exceptions = [], writes = [];
  const batchRequests = [], approvalRequests = [];
  let failNextSave = false, conflictNextBatch = false, conflictNextApproval = false;
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
  entries[2].data.history = '';
  entries[3].data.status = 'pending_review';
  const stageOf = entry => entry.publication ? 'published' : entry.data.status === 'ready' ? 'approved' : 'drafts';
  async function clickText(text, scope = 'document') {
    await page.evaluate(`(() => { const el=[...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}); if(!el)throw Error('Missing button');el.setAttribute('data-test-click',''); })()`);
    await page.click('[data-test-click]');
    await page.evaluate(`document.querySelector('[data-test-click]')?.removeAttribute('data-test-click')`);
  }
  const selected = stage => `document.querySelector('[data-testid="cheese-stage-${stage}"]')?.getAttribute('aria-pressed')==='true'`;
  page.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails.text));
  await page.send('Network.enable');
  await page.send('Network.setBypassServiceWorker', { bypass: true });
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
    else if (path === '/web-api/admin/editorial' && event.request.method === 'POST') {
      const request = JSON.parse(event.request.postData);
      writes.push(request);
      const revision = request.publish ? 2 : 1;
      body = {
        ...entries[0],
        id: '11111111-1111-4111-8111-000000000999',
        revision, kind: request.kind, data: request.data,
        publication: request.publish ? { publishedRevision: revision, publishedAt: '2026-01-02T00:00:00Z' } : null,
      };
      entries.push(body);
      code = 201;
    } else if (path === '/web-api/admin/editorial') {
      const stage = url.searchParams.get('stage'), kind = url.searchParams.get('kind');
      const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 50);
      requests.push({ stage, kind, offset });
      const filtered = kind === 'cheese' ? entries.filter(e => !stage || stageOf(e) === stage) : [];
      body = { items: filtered.slice(offset, offset + limit), total: filtered.length };
    } else if (path === '/web-api/admin/editorial/cheese/approve-batch' && event.request.method === 'POST') {
      const request = JSON.parse(event.request.postData);
      approvalRequests.push(request);
      if (conflictNextApproval) {
        conflictNextApproval = false;
        entries.find(e => e.id === request.entries[1].id).revision++;
        code = 409;
        body = { error: 'Fixture approval conflict' };
      } else {
        for (const { id, revision } of request.entries) {
          const item = entries.find(e => e.id === id);
          if (item.revision !== revision || stageOf(item) !== 'drafts' || !item.data.history)
            unexpected.push(`Invalid approval selection: ${id}`);
          item.revision++;
          item.data.status = 'ready';
        }
        body = { approvedCount: request.entries.length };
      }
    } else if (path === '/web-api/admin/editorial/cheese/publish-batch' && event.request.method === 'POST') {
      const request = JSON.parse(event.request.postData);
      batchRequests.push(request);
      await new Promise(resolve => setTimeout(resolve, 150));
      if (conflictNextBatch) {
        conflictNextBatch = false;
        entries.find(e => e.id === request.entries[1].id).revision++;
        code = 409;
        body = { error: 'Fixture conflict: refreshed approval required' };
      } else {
        for (const { id, revision } of request.entries) {
          const item = entries.find(e => e.id === id);
          if (item.revision !== revision || stageOf(item) !== 'approved') unexpected.push(`Invalid batch selection: ${id}`);
          item.revision++;
          item.publication = { publishedRevision: item.revision, publishedAt: '2026-01-02T00:00:00Z' };
        }
        body = { publishedCount: request.entries.length };
      }
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
    const beforePublish = requests.length;
    await clickText('Опубликовать', `document.getElementById('entry-${entries[22].id}')`);
    await page.wait(`${selected('drafts')} && document.querySelectorAll('[id^="entry-"]').length===20`);
    assert.equal(requests.slice(beforePublish).some(r => r.stage === 'published'), false);
    assert.ok(entries[22].publication, 'moving to preparation does not change the publication');
    await page.click('[data-testid="cheese-stage-published"]');
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
    const beforeSaveAndPublish = requests.length;
    await page.click('[data-testid="button-editorial-save-bottom"]');
    await page.wait(`${selected('drafts')} && !document.querySelector('[role="dialog"]') && !document.getElementById('entry-${entries[0].id}')`);
    assert.equal(requests.slice(beforeSaveAndPublish).some(r => r.stage === 'published'), false);
    assert.equal(writes.at(-1).publish, true);
    assert.equal(writes.at(-1).data.status, 'ready', 'combined action is never stored as an unsupported article status');
    assert.equal(entries[0].data.history, 'Verified expanded history');
    await page.click('[data-testid="cheese-stage-published"]');
    await page.wait(`${selected('published')} && !!document.getElementById('entry-${entries[0].id}')`);
    await clickText('Изменить', `document.getElementById('entry-${entries[0].id}')`);
    await page.wait(`!!document.querySelector('#ed-status')`);
    assert.equal(await page.evaluate(`document.querySelector('#ed-status').value`), 'ready', 'publication intent resets on reopening');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="button-editorial-save-top"]').textContent`), 'Сохранить изменения');
    await clickText('Отмена', `document.querySelector('[role="dialog"]')`);
    await page.wait(`!document.querySelector('[role="dialog"]')`);

    await page.click('[data-testid="cheese-stage-drafts"]');
    await page.wait(`${selected('drafts')} && document.querySelectorAll('[id^="entry-"]').length===20`);
    assert.equal(entries.filter(entry => stageOf(entry) === 'drafts').length, 22);
    await page.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Далее').click()`);
    await page.wait(`!!document.getElementById('entry-${entries[22].id}') && document.querySelectorAll('[id^="entry-"]').length===2`);
    await clickText('Новая запись');
    await page.wait(`!!document.querySelector('#ed-status')`);
    for (const [selector, value] of [
      ['#ed-title', 'New cheese'], ['#ed-country', 'Италия'],
      ['#ed-history', 'History'], ['#ed-characteristics', 'Characteristics'],
      ['#ed-culinaryUses', 'Uses'], ['#ed-photos', 'https://example.org/new-cheese.jpg'],
      ['#ed-sources', 'https://example.org/source'],
      ['[aria-label="Происхождение: широта"]', '45'], ['[aria-label="Происхождение: долгота"]', '9'],
    ]) await page.fill(selector, value);
    const choosePublish = `(() => {const s=document.querySelector('#ed-status');s.value='publish';s.dispatchEvent(new Event('change',{bubbles:true}));})()`;
    await page.evaluate(choosePublish);
    await page.click('[data-testid="button-editorial-save-top"]');
    await page.wait(`${selected('drafts')} && !document.querySelector('[role="dialog"]') && document.querySelectorAll('[id^="entry-"]').length===2`);
    assert.equal(requests.filter(r => r.stage === 'drafts').at(-1).offset, 20);
    assert.equal(entries.at(-1).data.title, 'New cheese');
    assert.ok(entries.at(-1).publication);
    // When the last draft is published from the final page, return to a valid page.
    for (const [index, id] of [entries[21].id, entries[22].id].entries()) {
      await clickText('Изменить', `document.getElementById('entry-${id}')`);
      await page.wait(`!!document.querySelector('#ed-status')`);
      await page.evaluate(choosePublish);
      await page.click('[data-testid="button-editorial-save-top"]');
      await page.wait(`${selected('drafts')} && !document.querySelector('[role="dialog"]') && document.querySelectorAll('[id^="entry-"]').length===${index === 0 ? 1 : 20}`);
    }
    assert.equal(requests.filter(r => r.stage === 'drafts').at(-1).offset, 0);

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

    const approvedRows = Array.from({ length: 21 }, (_, i) => ({
      ...entries[23], id: `11111111-1111-4111-8111-${String(100 + i).padStart(12, '0')}`,
      data: { ...entries[23].data, title: `Batch cheese ${i}` },
    }));
    entries.push(...approvedRows);
    await page.send('Page.navigate', { url: `${base}/web/admin/cheeses` });
    const toolbar = '[data-testid="cheese-batch-toolbar"]', dialog = '[data-testid="cheese-batch-dialog"]';
    const review = '[data-testid="cheese-batch-review"]', confirm = '[data-testid="cheese-batch-confirm"]';
    const pick = row => `[data-testid="cheese-batch-select-${row.id}"]`;
    await page.wait(`${selected('drafts')} && document.querySelectorAll('[id^="entry-"]').length===20`);
    assert.equal(await page.evaluate(`document.querySelector('${toolbar}')?.dataset.action`), 'approve');
    await page.click('[data-testid="cheese-stage-approved"]');
    await page.wait(`${selected('approved')} && !!document.querySelector('${pick(approvedRows[0])}')`);
    assert.equal(await page.evaluate(`document.querySelector('${review}').disabled`), true);
    await clickText('Выбрать все на странице', `document.querySelector('${toolbar}')`);
    await page.wait(`document.querySelectorAll('[data-testid^="cheese-batch-select-"]:checked').length===20`);
    await clickText('Далее');
    await page.wait(`Boolean(document.querySelector('${pick(approvedRows.at(-1))}'))`);
    assert.equal(await page.evaluate(`document.querySelector('${review}').disabled`), true);
    await clickText('Назад');
    await page.wait(`Boolean(document.querySelector('${pick(approvedRows[0])}'))`);
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-testid^="cheese-batch-select-"]:checked').length`), 0);
    for (const item of approvedRows.slice(0, 2)) await page.click(pick(item));
    await page.click(review);
    await page.wait(`document.querySelector('${dialog}')?.querySelectorAll('li').length===2`);
    assert.equal(await page.evaluate(`(() => {const r=document.querySelector('${dialog}').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})()`), true);
    assert.equal(batchRequests.length, 0, 'selection and opening confirmation do not publish');
    await clickText('Отмена', `document.querySelector('${dialog}')`);
    await page.wait(`!document.querySelector('${dialog}')`);
    assert.equal(batchRequests.length, 0);
    conflictNextBatch = true;
    await page.evaluate(`document.querySelector('${review}').click()`);
    await page.wait(`Boolean(document.querySelector('${confirm}'))`);
    await page.evaluate(`document.querySelector('${confirm}').click(); document.querySelector('${confirm}').click()`);
    await page.wait(`document.querySelector('${dialog}')?.innerText.includes('Fixture conflict')`);
    assert.equal(batchRequests.length, 1, 'rapid confirmation issues one request');
    assert.ok(approvedRows.every(row => !row.publication));
    await clickText('Обновить список', `document.querySelector('${dialog}')`);
    await page.wait(`!document.querySelector('${dialog}') && Boolean(document.querySelector('${review}')?.disabled)`);
    for (const item of approvedRows.slice(0, 2)) await page.click(pick(item));
    await page.click(review);
    await page.wait(`Boolean(document.querySelector('${confirm}'))`);
    await page.click(confirm);
    await page.wait(`${selected('drafts')} && !document.querySelector('${dialog}') && document.body.innerText.includes('Опубликовано статей: 2')`);
    assert.equal(batchRequests.length, 2);
    assert.deepEqual(batchRequests[1].entries, approvedRows.slice(0, 2).map(({ id, revision }) => ({ id, revision: revision - 1 })));
    assert.ok(approvedRows.slice(0, 2).every(row => row.publication));
    assert.ok(approvedRows.slice(2).every(row => !row.publication));
    await page.click('[data-testid="cheese-stage-published"]');
    await page.wait(`${selected('published')} && !!document.getElementById('entry-${approvedRows[0].id}')`);
    assert.equal(await page.evaluate(`Boolean(document.querySelector('${toolbar}'))`), false);

    await page.click('[data-testid="cheese-stage-drafts"]');
    await page.wait(`${selected('drafts')} && !!document.querySelector('${pick(entries[1])}')`);
    assert.equal(await page.evaluate(`Boolean(document.querySelector('${pick(entries[2])}'))`), false, 'incomplete article is not selectable');
    assert.ok(await page.evaluate(`document.getElementById('entry-${entries[2].id}').innerText.includes('заполните обязательные поля')`));
    await clickText('Выбрать все готовые на странице', `document.querySelector('${toolbar}')`);
    await page.wait(`document.querySelectorAll('[data-testid^="cheese-batch-select-"]:checked').length===19`);
    await clickText('Снять выбор', `document.querySelector('${toolbar}')`);
    await page.wait(`document.querySelector('${review}').disabled`);
    const toApprove = [entries[1], entries[3]];
    for (const item of toApprove) await page.click(pick(item));
    await page.click(review);
    await page.wait(`document.querySelector('${dialog}')?.querySelectorAll('li').length===2`);
    assert.ok(await page.evaluate(`document.querySelector('${dialog}').innerText.includes('не будут опубликованы')`));
    assert.equal(approvalRequests.length, 0);
    await clickText('Отмена', `document.querySelector('${dialog}')`);
    await page.wait(`!document.querySelector('${dialog}')`);
    assert.equal(approvalRequests.length, 0);
    conflictNextApproval = true;
    await page.evaluate(`document.querySelector('${review}').click()`);
    await page.wait(`Boolean(document.querySelector('${confirm}'))`);
    await page.click(confirm);
    await page.wait(`document.querySelector('${dialog}')?.innerText.includes('Fixture approval conflict')`);
    assert.ok(toApprove.every(row => stageOf(row) === 'drafts'));
    await clickText('Обновить список', `document.querySelector('${dialog}')`);
    await page.wait(`!document.querySelector('${dialog}') && Boolean(document.querySelector('${review}')?.disabled)`);
    for (const item of toApprove) await page.click(pick(item));
    await page.click(review);
    await page.wait(`Boolean(document.querySelector('${confirm}'))`);
    await page.click(confirm);
    await page.wait(`${selected('drafts')} && !document.querySelector('${dialog}') && document.body.innerText.includes('Одобрено статей: 2')`);
    assert.equal(approvalRequests.length, 2);
    assert.deepEqual(approvalRequests[1].entries, toApprove.map(({ id, revision }) => ({ id, revision: revision - 1 })));
    assert.equal(batchRequests.length, 2, 'approval never calls publication');
    assert.ok(toApprove.every(row => stageOf(row) === 'approved'));
    assert.equal(stageOf(entries[2]), 'drafts');
    await page.click('[data-testid="cheese-stage-approved"]');
    await page.wait(`${selected('approved')} && !!document.querySelector('${pick(entries[1])}') && !!document.querySelector('${pick(entries[3])}')`);

    await page.send('Page.navigate', { url: `${base}/web/admin/videos` });
    await page.wait(`document.body.innerText.includes('Видео и материалы')`);
    assert.equal(await page.evaluate(`!!document.querySelector('[data-testid="cheese-editorial-menu"]')`), false);
    assert.equal(requests.filter(r => r.kind === 'video').at(-1).stage, null);
    assert.deepEqual(unexpected, []);
    assert.deepEqual(exceptions, []);
  } finally { await browser.close(); }
});
