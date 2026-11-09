// Browser-only isolated editor fixture. All external and persistence APIs are mocked.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { launchBrowser } from './helpers/browser.mjs';

test('research is explicit, partial failures remain visible, and origin points require an explicit candidate save', {
  skip: !process.env.REPLIT_DEV_DOMAIN, timeout: 90000,
}, async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const id = '11111111-1111-4111-8111-111111111111';
  const manual = ['https://example.org/editorial-one', 'https://example.net/editorial-two'];
  const data = {
    title: 'Пармиджано Реджано', nameOriginal: 'Parmigiano Reggiano', country: 'Италия',
    region: 'Эмилия-Романья', status: 'draft', description: '', sources: manual,
    photos: [], videoIds: [], productIds: [], externalVideoUrls: [], sortOrder: 0,
    latitude: null, longitude: null, history: '', characteristics: '', culinaryUses: '', productionCountry: '',
  };
  let entry = { id, kind: 'cheese', revision: 1, data, publication: { publishedAt: '2025-12-30T00:00:00Z', publishedRevision: 0 }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
  const found = 'https://example.com/discovered-cheese-source';
  const report = {
    provider: 'brave', queries: ['Parmigiano Reggiano history Emilia-Romagna'],
    queryPlan: [{ topic: 'history', label: 'История', query: 'Parmigiano Reggiano history' }],
    coverage: [
      { topic: 'history', label: 'История', status: 'evidence', evidence: [{ sourceIndex: 0, passageIds: [4, 5], excerpt: 'Производство упоминается в историческом реестре.' }] },
      { topic: 'origin', label: 'Происхождение', status: 'missing', evidence: [] },
    ],
     photos: [{ id: 'photo-failed', imageUrl: 'https://photo-fixture.example.test/failed.jpg', sourceUrl: found, label: 'Кандидат — сырная головка' }],
    failures: [{ url: manual[0], reason: 'Fixture reader failure' }],
    warnings: ['Недостаточно сведений о кулинарном использовании.'], searchedAt: '2026-01-01T12:00:00.000Z',
  };
  const researchRun = {
    id: '22222222-2222-4222-8222-222222222222', kind: 'draft', status: 'failed', revision: 73,
    model: 'fixture-model', createdAt: '2026-01-01T12:00:00.000Z', finishedAt: '2026-01-01T12:00:05.000Z',
    params: { requestId: '33333333-3333-4333-8333-333333333333', entryId: id, revision: 1, sources: manual },
    result: { fields: {}, citations: [], warnings: [], research: report, sources: [{
      url: found, finalUrl: found, title: 'Regional cheese record', retrievedAt: report.searchedAt,
      sha256: 'a'.repeat(64), characters: 812, truncated: false,
    }] }, error: 'Fixture model failure', appliedTo: null,
  };
  let researchCalls = 0, runGetCalls = 0, lookupCalls = 0, applyCoordinateCalls = 0, draftApplyCalls = 0, successfulDraftApplyCalls = 0, photoImportCalls = 0;
  let failNextApply = true;
  let imagePreviewCalls = 0;
  let researchRequests = [], lookupRequests = [], coordinateRequests = [], draftApplyRequests = [], photoImportRequests = [];
  const exceptions = [];
  page.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails.text));
  await page.send('Network.enable');
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `if ('serviceWorker' in navigator) navigator.serviceWorker.register = async () => ({}); window.confirm = () => true;` });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*/web-api/*' }, { urlPattern: '*/api/*' }, { urlPattern: '*telegram.org/js/telegram-web-app.js*' }, { urlPattern: 'https://photo-fixture.example.test/*' }] });
  page.on('Fetch.requestPaused', async event => {
    const url = new URL(event.request.url);
    if (url.hostname === 'photo-fixture.example.test') {
      imagePreviewCalls++;
      await page.send('Fetch.fulfillRequest', {
        requestId: event.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'image/png' }],
        body: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l4sAAAAASUVORK5CYII=',
      });
      return;
    }
    let body = [], status = 200;
    if (url.pathname === '/web-api/auth/refresh') body = {
      accessToken: 'isolated-test-token', user: { id: 'test-only-operator', firstName: 'Test', email: 'editorial@example.invalid' },
    };
    else if (url.pathname === '/web-api/admin/check') body = { ok: true, isMasterAdmin: true };
    else if (url.pathname === '/web-api/admin/editorial') body = { items: url.searchParams.get('kind') === 'cheese' ? [entry] : [], total: url.searchParams.get('kind') === 'cheese' ? 1 : 0 };
    else if (url.pathname === '/web-api/admin/editorial-ai/research') {
      researchCalls++;
      const request = JSON.parse(event.request.postData);
      researchRequests.push(request);
      await delay(250);
      body = {
        ...researchRun,
        id: researchCalls === 1 ? researchRun.id : '55555555-5555-4555-8555-555555555555',
        status: 'running', params: request, result: null, error: null, finishedAt: null,
      };
    } else if (event.request.method === 'GET' && /^\/web-api\/admin\/editorial-ai\/runs\/[^/]+$/.test(url.pathname)) {
      runGetCalls++;
      const runId = url.pathname.split('/').at(-1);
      if (runId === researchRun.id) {
        body = researchRun;
      } else {
        body = {
          ...researchRun, id: runId, status: 'ready', revision: 91,
          params: researchRequests[1], result: {
            fields: { title: 'Пармиджано Реджано — текст редактора', region: 'Ломбардия' }, citations: [], warnings: [],
            sources: researchRun.result.sources,
             research: { ...report, photos: [
               { id: 'photo-ready', imageUrl: 'https://photo-fixture.example.test/ready.jpg', sourceUrl: found, label: 'Проверить идентичность' },
               { id: 'photo-second', imageUrl: 'https://photo-fixture.example.test/second.jpg', sourceUrl: found, label: 'Дополнительный кадр' },
             ] },
          },
          error: null, appliedTo: null,
        };
      }
    } else if (url.pathname === '/web-api/admin/editorial-ai/origin-geocoding') {
      lookupCalls++;
      const request = JSON.parse(event.request.postData);
      lookupRequests.push(request);
      await delay(300);
      body = {
        lookupId: '44444444-4444-4444-8444-444444444444', entryId: id, revision: entry.revision,
        query: request.place, retrievedAt: '2026-01-01T12:00:00.000Z', cached: false,
        attribution: '© OpenStreetMap contributors',
        candidates: [
          { id: 'place-1', label: 'Emilia-Romagna, Italy', type: 'state', latitude: 44.5, longitude: 11.0, url: 'https://www.openstreetmap.org/relation/12345' },
          { id: 'place-2', label: 'Bologna, Italy', type: 'city', latitude: 44.49, longitude: 11.34, url: 'https://www.openstreetmap.org/node/12346' },
        ],
      };
    } else if (url.pathname === '/web-api/admin/editorial-ai/origin-geocoding/apply') {
      applyCoordinateCalls++;
      const coordinateRequest = JSON.parse(event.request.postData);
      coordinateRequests.push(coordinateRequest);
      assert.equal(coordinateRequest.entryId, id);
      assert.equal(coordinateRequest.revision, entry.revision);
      assert.equal(coordinateRequest.lookupId, '44444444-4444-4444-8444-444444444444');
      assert.equal(coordinateRequest.candidateId, applyCoordinateCalls === 1 ? 'place-2' : 'place-1');
      const savedPlace = coordinateRequest.candidateId === 'place-2'
        ? { latitude: 44.49, longitude: 11.34 }
        : { latitude: 44.5, longitude: 11 };
      entry = { ...entry, revision: entry.revision + 1, data: { ...entry.data, ...savedPlace } };
      body = entry;
    } else if (/^\/web-api\/admin\/editorial-ai\/runs\/[^/]+\/photos$/.test(url.pathname)) {
      assert.equal(url.pathname.split('/').at(-2), '55555555-5555-4555-8555-555555555555', 'photo import uses the ready run');
      photoImportCalls++;
      const request = JSON.parse(event.request.postData);
      photoImportRequests.push(request);
      assert.equal(request.entryId, id);
      assert.equal(request.revision, entry.revision, 'photo-only import uses the current entry revision');
      assert.equal(request.photoRightsConfirmed, true);
      assert.equal(request.photoIds.length >= 1 && request.photoIds.length <= 3, true);
      assert.equal(successfulDraftApplyCalls, 1, 'photo import is separate from text apply');
      entry = {
        ...entry,
        revision: entry.revision + 1,
        data: { ...entry.data, status: 'pending_review', aiResearch: entry.data.aiResearch || { runId: '55555555-5555-4555-8555-555555555555', searchedAt: '2026-01-01T12:00:00.000Z', transferredAt: '2026-01-01T12:10:00.000Z' }, photos: Array.from(new Set([...entry.data.photos, ...request.photoIds.map(photoId => `https://photo-fixture.example.test/${photoId === 'photo-second' ? 'second' : 'ready'}.jpg`)])) },
      };
      body = entry;
    } else if (url.pathname.includes('/editorial-ai/') && url.pathname.endsWith('/apply')) {
      draftApplyCalls++;
      draftApplyRequests.push(JSON.parse(event.request.postData));
      if (failNextApply) {
        failNextApply = false;
        status = 500;
        body = { message: 'Fixture transfer failure' };
      } else {
        successfulDraftApplyCalls++;
        entry = { ...entry, revision: 3, data: { ...entry.data, status: 'pending_review', aiResearch: { runId: '55555555-5555-4555-8555-555555555555', searchedAt: '2026-01-01T12:00:00.000Z', transferredAt: '2026-01-01T12:10:00.000Z' }, title: 'Пармиджано Реджано — текст редактора', region: 'Ломбардия', photos: draftApplyRequests.at(-1).photoIds?.includes('photo-ready') ? ['https://photo-fixture.example.test/ready.jpg'] : entry.data.photos } };
        body = entry;
      }
    } else if (event.request.method !== 'GET' && url.pathname !== '/web-api/auth/refresh') {
      throw new Error(`Unexpected fixture mutation: ${url.pathname}`);
    }
    await page.send('Fetch.fulfillRequest', {
      requestId: event.requestId, responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: url.pathname.includes('telegram-web-app') ? 'text/javascript' : 'application/json' }],
      body: Buffer.from(url.pathname.includes('telegram-web-app') ? '' : JSON.stringify(body)).toString('base64'),
    });
  });
  const clickButton = async testId => page.evaluate(`document.querySelector('[data-testid="${testId}"]').click()`);
  try {
    await page.send('Page.navigate', { url: `https://${process.env.REPLIT_DEV_DOMAIN}/web/admin/cheeses` });
    await page.wait(`!!document.querySelector('[data-testid="ai-draft-entry-${id}"]')`);
    await page.evaluate(`([...document.querySelectorAll('#entry-${id} button')].find(button=>button.textContent.includes('Изменить'))).click()`);
    await page.wait(`!!document.querySelector('[data-testid="cheese-photo-editor"]')`);
    assert.equal(await page.evaluate(`Array.from(document.querySelector('#ed-status').options).map(option=>option.textContent).join('|')`), 'В редакции|Ожидает подтверждения|Одобрена', 'cheese state selector distinguishes editorial workflow states');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="cheese-photo-editor"]').innerText.includes('Фотографий пока нет')`), true, 'the edit dialog makes missing photos explicit');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="cheese-photo-editor"]').innerText.includes('добавьте URL вручную')`), true, 'manual photo URLs are clearly offered');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="cheese-photo-editor"]').innerText.includes('0 из 12')`), true, 'the existing photo count is visible');
    assert.equal(await page.evaluate(`document.querySelector('[role="dialog"]').innerText.includes('Внешние видео-ссылки — необязательно')`), true, 'external videos are explicitly optional');
    await page.evaluate(`(() => {const status=document.querySelector('#ed-status');status.value='ready';status.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await page.wait(`!!document.querySelector('[data-testid="cheese-ready-requirements"]')`);
    const readyGuidance = await page.evaluate(`document.querySelector('[data-testid="cheese-ready-requirements"]').innerText`);
    const missingGuidance = readyGuidance.split('Регион, оригинальное название')[0];
    assert.equal(missingGuidance.includes('Одобрена'), true, 'cheese readiness guidance uses the approved label');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="cheese-photo-editor"]').innerText.includes('До сохранения как «Одобрена»')`), true, 'photo guidance uses the approved label');
    for (const requirement of ['История', 'Характеристики', 'Кулинарное использование', 'Фотография', 'Обе координаты происхождения']) {
      assert.equal(missingGuidance.includes(requirement), true, `ready guidance lists missing ${requirement}`);
    }
    assert.equal(missingGuidance.includes('Источники'), false, 'existing sources satisfy the schema requirement');
    assert.equal(missingGuidance.includes('Регион'), false, 'region is not a ready requirement in the shared schema');
    await page.evaluate(`(() => {const status=document.querySelector('#ed-status');status.value='draft';status.dispatchEvent(new Event('change',{bubbles:true}));[...document.querySelectorAll('[role="dialog"] button')].find(button=>button.textContent.trim()==='Отмена').click()})()`);
    assert.equal(await page.evaluate(`document.querySelector('#entry-${id}').innerText.includes('Опубликована · текущая версия: в редакции')`), true, 'a live older revision is distinct from the unpublished current draft');
    await page.evaluate(`([...document.querySelectorAll('#entry-${id} button')].find(button=>button.textContent.includes('Изменить'))).click()`);
    await page.wait(`!!document.querySelector('[data-testid="cheese-saved-status"]')`);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="cheese-saved-status"]').innerText.includes('Опубликована · текущая версия: в редакции')`), true, 'edit dialog shows saved publication and current editorial state separately');
    await page.evaluate(`([...document.querySelectorAll('[role="dialog"] button')].find(button=>button.textContent.trim()==='Отмена')).click()`);
    await page.evaluate(`document.querySelector('[data-testid="ai-draft-entry-${id}"] button').click()`);
    // Opening the panel must not trigger internet search or geocoding.
    assert.equal(researchCalls, 0);
    assert.equal(lookupCalls, 0);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-origin-place"]').value`), 'Эмилия-Романья', 'lookup starts from the saved article region');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-origin-coordinates"]').innerText.includes('Координаты происхождения пока не заполнены')`), true, 'missing coordinates have actionable guidance');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-origin-coordinates"]').innerText.includes('2 · Поиск по нажатию')`), true, 'lookup is explicitly presented as a separate step');
    await page.evaluate(`(() => {
      const field=document.querySelector('#ai-sources-${id}');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,${JSON.stringify(manual.join('\n'))});
      field.dispatchEvent(new Event('input',{bubbles:true}));
      field.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    await page.evaluate(`(() => {const button=document.querySelector('[data-testid="ai-draft-research"]');button.click();button.click()})()`);
    await page.wait(`!!document.querySelector('[data-testid="ai-research-report"]')`);
    assert.equal(researchCalls, 1, 'rapid repeated activation creates one research run');
    assert.equal(runGetCalls > 0, true, 'the running research response is followed by a terminal run poll');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-draft-apply"]') === null`), true, 'failed terminal run does not expose draft apply controls');
    assert.equal(await page.evaluate(`document.body.innerText.includes('Fixture model failure')`), true, 'the failed terminal run error remains visible after polling');
    assert.equal(researchRequests[0].entryId, id);
    assert.equal(researchRequests[0].revision, 1);
    assert.equal(researchRequests[0].sources.length, 2);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-research-report"]').innerText.includes('Fixture reader failure')`), true);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-research-report"]').innerText.includes('Regional cheese record')`), true);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-research-report"]').innerText.includes('История')`), true);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-research-coverage"]').innerText.includes('эвристические фрагменты')`), true, 'coverage is marked as evidence fragments, not verified facts');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-research-coverage"]').innerText.includes('Сведений не найдено')`), true, 'missing topics are shown explicitly');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-research-coverage"] a').getAttribute('href')`), found, 'coverage links to source metadata');
    assert.equal(imagePreviewCalls, 0, 'candidate images cause no remote request while the panel renders');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-photo-select-photo-failed"]').checked`), false, 'failed-run candidate is not selected');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-photo-select-photo-failed"]').disabled`), true, 'failed-run candidate is read-only');
    await clickButton('ai-photo-preview-photo-failed');
    await page.wait(`!!document.querySelector('[data-testid="ai-research-photos"] img')`);
    await delay(250);
    assert.equal(imagePreviewCalls, 1, 'remote image request only happens after explicit preview');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-research-photos"] img').getAttribute('referrerpolicy')`), 'no-referrer');
    await page.evaluate(`document.querySelector('[data-testid="ai-research-report"] input[type="checkbox"]').click()`);
    await page.evaluate(`document.querySelector('[data-testid="ai-research-report"] button').click()`);
    assert.deepEqual(await page.evaluate(`document.querySelector('#ai-sources-${id}').value.split('\\n').filter(Boolean)`), [...manual, found]);
    assert.equal(await page.evaluate(`document.querySelector('#ai-sources-${id}').value.split('\\n').filter(Boolean).length`), 3, 'manual list retains existing links and stays capped at three');
    assert.equal(draftApplyCalls, 0, 'research never applies text automatically');

    await clickButton('ai-origin-lookup');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-draft-research"]').disabled`), true, 'geocoding locks research through the shared AI action lock');
    assert.equal(researchCalls, 1, 'research cannot race a coordinate lookup');
    await page.wait(`!!document.querySelector('[data-testid="ai-origin-apply"]')`);
    assert.equal(lookupCalls, 1);
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-testid="ai-origin-coordinates"] input[type="radio"]:checked').length`), 0);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-origin-apply"]').disabled`), true);
    await page.evaluate(`document.querySelectorAll('[data-testid="ai-origin-coordinates"] input[type="radio"]')[1].click()`);
    await clickButton('ai-origin-apply');
    await page.wait(`document.querySelector('[data-testid="ai-origin-coordinates"]').innerText.includes('Сохранено: 44.49, 11.34')`);
    assert.equal(applyCoordinateCalls, 1);
    assert.equal(draftApplyCalls, 0);

    // Let the entry-list query settle on the saved revision before starting the next run.
    await delay(500);
    await page.evaluate(`(() => {const button=document.querySelector('[data-testid="ai-draft-research"]'); if(button.disabled) throw Error('research should unlock after coordinate lookup/save'); button.click()})()`);
    await page.wait(`!!document.querySelector('[data-testid="ai-draft-apply"]')`);
    assert.equal(researchCalls, 2);
    assert.equal(runGetCalls >= 2, true, 'the second running response is resolved by a later ready run poll');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-proposal-title"]').closest('article').querySelector('input[type="checkbox"]').disabled`), false, 'field selection unlocks when the polled run becomes ready');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-draft-select-all"]').disabled`), false, 'select-all unlocks when the polled run becomes ready without reopening history');
    assert.equal(researchRequests[1].revision, 2, 'origin save refreshed the entry revision before the next run');
    // The server run revision is intentionally unrelated; validity is bound to params.entryId/revision.
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-draft-apply"]').disabled`), true, 'draft requires explicit field selection');
    await page.wait(`!!document.querySelector('[data-testid="ai-origin-pending-guidance"]')`);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-origin-lookup"]').disabled`), true, 'a proposed region cannot be used before text is explicitly applied');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-origin-pending-guidance"]').innerText.includes('Сначала выберите нужные текстовые поля')`), true);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-origin-place"]').value`), 'Эмилия-Романья', 'pending proposal does not replace the saved region in the lookup field');
    assert.equal(lookupCalls, 1, 'a pending proposal does not trigger coordinate lookup');
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-testid^="ai-proposal-"]').length`), 2, 'only fields present in the AI proposal are available for selection');
    assert.equal(await page.evaluate(`!!document.querySelector('[data-testid="ai-proposal-country"]')`), false, 'an absent proposal field cannot be bulk-selected');
    await page.evaluate(`(() => {
      const field=document.querySelector('[data-testid="ai-proposal-title"]');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'Редакторская правка названия');
      field.dispatchEvent(new Event('input',{bubbles:true}));
      field.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    await clickButton('ai-draft-select-all');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-proposal-title"]').closest('article').querySelector('input[type="checkbox"]').checked`), true);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-proposal-region"]').closest('article').querySelector('input[type="checkbox"]').checked`), true);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-proposal-title"]').value`), 'Редакторская правка названия', 'bulk selection preserves operator text edits');
    assert.equal(draftApplyCalls, 0, 'bulk selection does not apply the draft');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-draft-apply"]').disabled`), false, 'apply unlocks after selecting fields from the polled ready run');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-draft-select-all"]').disabled`), false, 'select-all remains enabled when every available field is already selected');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-draft-select-all"]').innerText`), 'Всё выбрано');
    assert.equal(await page.evaluate(`document.getElementById(document.querySelector('[data-testid="ai-draft-select-all"]').getAttribute('aria-describedby')).getAttribute('aria-live')`), 'polite', 'accessible selection status is announced politely');
    assert.equal(await page.evaluate(`document.getElementById(document.querySelector('[data-testid="ai-draft-select-all"]').getAttribute('aria-describedby')).innerText`), 'Выбрано 2 из 2. Все доступные поля уже отмечены. Повторное нажатие безопасно. Выбор сам по себе ничего не сохраняет — для сохранения нажмите «Применить выбранные поля».');
    await clickButton('ai-draft-select-all');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-draft-select-all"]').disabled`), false, 'repeated select-all stays enabled and idempotent');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-proposal-title"]').value`), 'Редакторская правка названия', 'repeated select-all preserves operator text edits');
    assert.equal(draftApplyCalls, 0, 'repeated select-all does not apply the draft');
    assert.equal(researchCalls, 2, 'repeated select-all does not start generation or research');
    assert.equal(lookupCalls, 1, 'repeated select-all does not start geocoding');
    await page.evaluate(`document.querySelector('[data-testid="ai-proposal-region"]').closest('article').querySelector('input[type="checkbox"]').click()`);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-proposal-region"]').closest('article').querySelector('input[type="checkbox"]').checked`), false, 'individual fields remain deselectable after bulk selection');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-proposal-title"]').closest('article').querySelector('input[type="checkbox"]').checked`), true);
    await clickButton('ai-draft-select-all');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-proposal-region"]').closest('article').querySelector('input[type="checkbox"]').checked`), true, 'bulk selection can add remaining proposed fields without changing edits');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-proposal-title"]').value`), 'Редакторская правка названия');
    assert.equal(draftApplyCalls, 0, 'bulk selection never triggers apply or an AI request');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-draft-apply"]').disabled`), false);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-photo-select-photo-ready"]').checked`), false, 'select-all text does not select any photo');
    assert.equal(imagePreviewCalls, 1, 'ready-run photo also remains unloaded until explicit preview');
    await clickButton('ai-photo-preview-photo-ready');
    await page.wait(`document.querySelector('[data-testid="ai-research-photos"] img')?.getAttribute('src') === 'https://photo-fixture.example.test/ready.jpg'`);
    await delay(250);
    assert.equal(imagePreviewCalls, 2, 'preview button explicitly loads the ready-run candidate');
    await page.evaluate(`document.querySelector('[data-testid="ai-photo-select-photo-ready"]').click()`);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-draft-apply"]').disabled`), true, 'photo apply is blocked until rights are confirmed');
    await page.evaluate(`document.querySelector('[data-testid="ai-photo-rights-confirm"]').click()`);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-draft-apply"]').disabled`), false, 'rights confirmation unlocks the explicit apply action');
    await clickButton('ai-draft-apply');
    await page.wait(`!!document.querySelector('[data-testid="ai-transfer-confirm"]')`);
    assert.equal(draftApplyCalls, 0, 'selected text and photos are not sent before in-app confirmation');
    const transferSummary = await page.evaluate(`document.querySelector('[role="dialog"]').innerText`);
    assert.equal(transferSummary.includes('Пармиджано Реджано'), true, 'confirmation identifies the target article');
    assert.equal(transferSummary.includes('Редакторская правка названия'), true, 'confirmation previews the selected edited field');
    assert.equal(transferSummary.includes('Проверить идентичность'), true, 'confirmation previews the selected photo');
    assert.equal(transferSummary.includes('Ожидает подтверждения'), true, 'confirmation explains the pending review state');
    assert.equal(transferSummary.includes('Публикации не будет'), true, 'confirmation explicitly says the article will not publish');
    await page.evaluate(`([...document.querySelector('[data-testid="ai-transfer-confirm"]').closest('[role="dialog"]').querySelectorAll('button')].find(button=>button.textContent.trim()==='Отмена')).click()`);
    assert.equal(draftApplyCalls, 0, 'cancel closes confirmation without saving');
    assert.equal(await page.evaluate(`!!document.querySelector('[data-testid="editorial-entry-editor"]')`), false, 'cancel does not open the article editor');
    await clickButton('ai-draft-apply');
    await page.wait(`!!document.querySelector('[data-testid="ai-transfer-confirm"]')`);
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
    await page.wait(`!document.querySelector('[data-testid="ai-transfer-confirm"]')`);
    assert.equal(draftApplyCalls, 0, 'Escape cancels without a write');
    assert.equal(await page.evaluate(`!!document.querySelector('[data-testid="editorial-entry-editor"]')`), false, 'Escape does not open the editor');
    await clickButton('ai-draft-apply');
    await page.wait(`!!document.querySelector('[data-testid="ai-transfer-confirm"]')`);
    await clickButton('ai-transfer-confirm');
    await page.wait(`document.querySelector('[data-testid="ai-draft-apply"]')?.disabled === false`);
    await delay(250);
    assert.equal(draftApplyCalls, 1, 'the fixture returned a failed transfer response');
    assert.equal(await page.evaluate(`!!document.querySelector('[data-testid="ai-research-report"]')`), true, 'failed transfer leaves research expanded');
    assert.equal(await page.evaluate(`!!document.querySelector('[data-testid="ai-research-transferred"]')`), false, 'failed transfer does not claim server success');
    await clickButton('ai-draft-apply');
    await page.wait(`!!document.querySelector('[data-testid="ai-transfer-confirm"]')`);
    assert.equal(draftApplyCalls, 1, 'no second write occurs until the successful transfer is confirmed');
    await page.evaluate(`(() => {const button=document.querySelector('[data-testid="ai-transfer-confirm"]');button.click();button.click()})()`);
    await page.wait(`!!document.querySelector('[data-testid="ai-research-transferred"]')`);
    assert.equal(draftApplyCalls, 2, 'rapid confirmation clicks issue only one successful write');
    await page.wait(`!!document.querySelector('[data-testid="editorial-entry-editor"]')`);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="editorial-entry-editor"][data-state="open"]').getAttribute('data-entry-revision')`), '3', 'editor opens from the successful server response revision');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="editorial-entry-editor"][data-state="open"] #ed-title').value`), 'Пармиджано Реджано — текст редактора', 'editor is initialized from returned server fields');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="editorial-entry-editor"][data-state="open"] #ed-region').value`), 'Ломбардия', 'editor uses the returned region');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="editorial-entry-editor"][data-state="open"] #ed-status').value`), 'pending_review', 'successful transfer preserves pending_review');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="editorial-entry-editor"][data-state="open"] #ed-photos').value`), 'https://photo-fixture.example.test/ready.jpg', 'editor uses the photo returned by the server');
    await page.evaluate(`([...document.querySelectorAll('[data-testid="editorial-entry-editor"][data-state="open"] button')].find(button=>button.textContent.trim()==='Отмена')).click()`);
    await page.wait(`!document.querySelector('[data-testid="editorial-entry-editor"][data-state="open"]')`);
    await page.wait(`!document.querySelector('[data-testid="ai-research-report"]')`);
    assert.equal(await page.evaluate(`!!document.querySelector('[data-testid="ai-research-transferred"]')`), true, 'successful server transfer leaves a persistent check summary while research is collapsed');
    assert.equal(await page.evaluate(`document.querySelector('#entry-${id}').innerText.toLocaleLowerCase('ru').includes('ожидает подтверждения')`), true, 'successful AI transfer is awaiting confirmation, not approved or published');
    await page.evaluate(`document.querySelector('[data-testid="ai-research-toggle-${id}"]').click()`);
    await page.wait(`!!document.querySelector('[data-testid="ai-research-report"]')`);
    assert.equal(successfulDraftApplyCalls, 1, 'text is only saved after explicit field selection and successful apply');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-draft-select-all"]').disabled`), true, 'select-all remains locked after apply');
    assert.equal(await page.evaluate(`document.getElementById(document.querySelector('[data-testid="ai-draft-select-all"]').getAttribute('aria-describedby')).innerText.includes('Это предложение уже применено')`), true, 'applied state explains why selection is locked');
    assert.deepEqual(draftApplyRequests[0].fields, ['title', 'region']);
    assert.equal(draftApplyRequests[0].edits.title, 'Редакторская правка названия', 'the preserved operator edit is sent only with explicit apply');
    assert.deepEqual(draftApplyRequests[0].photoIds, ['photo-ready'], 'only explicitly selected photos are applied');
    assert.equal(draftApplyRequests[0].photoRightsConfirmed, true, 'photo rights confirmation is sent with the apply request');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-draft-apply"]').innerText`), 'Уже применено', 'reopened applied proposal remains one-shot');
    assert.equal(researchCalls, 2, 'reopening transferred research does not start another paid run');
    await page.wait(`document.querySelector('[data-testid="ai-origin-place"]').value === 'Ломбардия'`);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-origin-lookup"]').disabled`), false, 'lookup unlocks after the applied region is saved');
    assert.equal(lookupCalls, 1, 'applying region still does not start a paid lookup automatically');
    await clickButton('ai-origin-lookup');
    await page.wait(`document.querySelectorAll('[data-testid="ai-origin-coordinates"] input[type="radio"]').length === 2`);
    assert.equal(lookupCalls, 2, 'lookup occurs only after explicit activation');
    assert.equal(lookupRequests[1].place, 'Ломбардия', 'lookup uses the region after it has been applied to the entry');
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-testid="ai-origin-coordinates"] input[type="radio"]:checked').length`), 0, 'candidates are never selected automatically');
    await page.evaluate(`document.querySelectorAll('[data-testid="ai-origin-coordinates"] input[type="radio"]')[0].click()`);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-origin-apply"]').disabled`), false);
    await clickButton('ai-origin-apply');
    await page.wait(`document.querySelector('[data-testid="ai-origin-coordinates"]').innerText.includes('Сохранено: 44.5, 11')`);
    assert.equal(applyCoordinateCalls, 2, 'a later coordinate save advances the article after text apply');
    assert.equal(coordinateRequests[1].revision, 3, 'coordinate save after text application uses the current cache revision');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-draft-apply"]').innerText`), 'Уже применено', 'photo-only import does not undo the original text-run applied state');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-draft-select-all"]').disabled`), true, 'stale text fields remain protected after the coordinate save');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-photo-select-photo-second"]').disabled`), false, 'ready same-entry photos remain selectable despite applied and stale text');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-photo-import"]').disabled`), true, 'photo import requires selection and rights confirmation');
    await page.evaluate(`document.querySelector('[data-testid="ai-photo-select-photo-second"]').click()`);
    await page.evaluate(`document.querySelector('[data-testid="ai-photo-rights-confirm"]').click()`);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-photo-import"]').disabled`), false);
    await clickButton('ai-photo-import');
    await page.wait(`!!document.querySelector('[data-testid="ai-transfer-confirm"]')`);
    assert.equal(photoImportCalls, 0, 'photo-only import makes no request before confirmation');
    const photoTransferSummary = await page.evaluate(`document.querySelector('[data-testid="ai-transfer-confirm"]').closest('[role="dialog"]').innerText`);
    assert.equal(photoTransferSummary.includes('Дополнительный кадр'), true, `photo-only confirmation identifies selected photo: ${photoTransferSummary}`);
    await clickButton('ai-transfer-confirm');
    await page.wait(`!document.querySelector('[data-testid="ai-research-report"]')`);
    assert.equal(photoImportCalls, 1);
    await page.wait(`!!document.querySelector('[data-testid="editorial-entry-editor"]')`);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="editorial-entry-editor"][data-state="open"]').getAttribute('data-entry-revision')`), '5', 'photo-only transfer also opens the returned revision');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="editorial-entry-editor"][data-state="open"] #ed-photos').value.includes('https://photo-fixture.example.test/second.jpg')`), true, 'photo-only editor shows the server-saved photo');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="editorial-entry-editor"][data-state="open"] #ed-status').value`), 'pending_review', 'photo-only transfer preserves pending_review');
    await page.evaluate(`([...document.querySelectorAll('[data-testid="editorial-entry-editor"][data-state="open"] button')].find(button=>button.textContent.trim()==='Отмена')).click()`);
    await page.wait(`!document.querySelector('[data-testid="editorial-entry-editor"][data-state="open"]')`);
    await page.wait(`!document.querySelector('[data-testid="ai-research-report"]')`);
    assert.equal(await page.evaluate(`!!document.querySelector('[data-testid="ai-research-transferred"]')`), true, 'photo-only transfer also collapses with a persistent summary');
    await page.evaluate(`document.querySelector('[data-testid="ai-research-toggle-${id}"]').click()`);
    await page.wait(`!!document.querySelector('[data-testid="ai-research-report"]')`);
    assert.deepEqual(photoImportRequests[0].photoIds, ['photo-second']);
    assert.equal(photoImportRequests[0].revision, 4, 'photo import uses the revision from the later coordinate save');
    assert.equal(researchCalls, 2, 'photo import does not start another research run');
    assert.equal(successfulDraftApplyCalls, 1, 'photo import does not make another text apply request');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-draft-apply"]').innerText`), 'Уже применено', 'photo-only import leaves the original run applied marker unchanged');
    assert.equal(researchRequests.length, 2);
    await page.evaluate(`([...document.querySelectorAll('#entry-${id} button')].find(button=>button.textContent.includes('Изменить'))).click()`);
    await page.wait(`!!document.querySelector('[data-testid="cheese-photo-editor"]')`);
    assert.equal(await page.evaluate(`document.querySelector('#ed-photos').value`), 'https://photo-fixture.example.test/ready.jpg\nhttps://photo-fixture.example.test/second.jpg', 'the saved photo is appended without replacing the existing photo');
    assert.equal(await page.evaluate(`document.querySelector('#ed-latitude').value`), '44.5', 'saved latitude is visible in the updated article');
    assert.equal(await page.evaluate(`document.querySelector('#ed-longitude').value`), '11', 'saved longitude is visible in the updated article');
    await page.evaluate(`([...document.querySelectorAll('[role="dialog"] button')].find(button=>button.textContent.trim()==='Отмена')).click()`);
    await page.send('Page.navigate', { url: `https://${process.env.REPLIT_DEV_DOMAIN}/web/admin/cheeses` });
    await page.wait(`!!document.querySelector('[data-testid="ai-research-transferred"]')`);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-research-transferred"]').innerText.includes('2026')`), true, 'transfer confirmation date is restored from the persisted entry marker after reload');
    entry = { ...entry, revision: entry.revision + 1, publication: null, data: { ...entry.data, status: 'ready' } };
    await page.send('Page.navigate', { url: `https://${process.env.REPLIT_DEV_DOMAIN}/web/admin/cheeses` });
    await page.wait(`document.querySelector('#entry-${id}')?.innerText.includes('Одобрена')`);
    assert.equal(await page.evaluate(`document.querySelector('#entry-${id}').innerText.includes('Опубликована')`), false, 'approved is not represented as published');
    entry = { ...entry, publication: { publishedAt: '2026-01-02T00:00:00Z', publishedRevision: entry.revision } };
    await page.send('Page.navigate', { url: `https://${process.env.REPLIT_DEV_DOMAIN}/web/admin/cheeses` });
    await page.wait(`document.querySelector('#entry-${id}')?.innerText.includes('Опубликована')`);
    await page.evaluate(`([...document.querySelectorAll('#entry-${id} button')].find(button=>button.textContent.includes('Изменить'))).click()`);
    await page.wait(`!!document.querySelector('[data-testid="cheese-saved-status"]')`);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="cheese-saved-status"]').innerText.includes('Опубликована')`), true, 'edit dialog identifies the saved published revision');
    await page.evaluate(`([...document.querySelectorAll('[role="dialog"] button')].find(button=>button.textContent.trim()==='Отмена')).click()`);
    entry = { ...entry, publication: { publishedAt: '2026-01-02T00:00:00Z', publishedRevision: entry.revision - 1 }, data: { ...entry.data, status: 'pending_review' } };
    await page.send('Page.navigate', { url: `https://${process.env.REPLIT_DEV_DOMAIN}/web/admin/cheeses` });
    await page.wait(`document.querySelector('#entry-${id}')?.innerText.includes('текущая версия: ожидает подтверждения')`);
    assert.equal(await page.evaluate(`document.querySelector('#entry-${id}').innerText.includes('Опубликована · текущая версия: ожидает подтверждения')`), true, 'published live content and unpublished edits are both labeled');
    assert.deepEqual(exceptions, []);
  } finally { await browser.close(); }
});
