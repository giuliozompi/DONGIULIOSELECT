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
  let entry = { id, kind: 'cheese', revision: 1, data, publication: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
  const found = 'https://example.com/discovered-cheese-source';
  const report = {
    provider: 'brave', queries: ['Parmigiano Reggiano history Emilia-Romagna'],
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
  let researchCalls = 0, lookupCalls = 0, applyCoordinateCalls = 0, draftApplyCalls = 0;
  let researchRequests = [], lookupRequests = [], draftApplyRequests = [];
  const exceptions = [];
  page.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails.text));
  await page.send('Network.enable');
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `if ('serviceWorker' in navigator) navigator.serviceWorker.register = async () => ({}); window.confirm = () => true;` });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*/web-api/*' }, { urlPattern: '*/api/*' }, { urlPattern: '*telegram.org/js/telegram-web-app.js*' }] });
  page.on('Fetch.requestPaused', async event => {
    const url = new URL(event.request.url);
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
      body = researchCalls === 1 ? researchRun : {
        ...researchRun, id: '55555555-5555-4555-8555-555555555555', status: 'ready', revision: 91,
        params: request, result: { fields: { title: 'Пармиджано Реджано — текст редактора', region: 'Ломбардия' }, citations: [], warnings: [], sources: [] },
        error: null, appliedTo: null,
      };
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
      assert.deepEqual(JSON.parse(event.request.postData), {
        entryId: id, revision: entry.revision, lookupId: '44444444-4444-4444-8444-444444444444', candidateId: 'place-2',
      });
      entry = { ...entry, revision: 2, data: { ...entry.data, latitude: 44.49, longitude: 11.34 } };
      body = entry;
    } else if (url.pathname.includes('/editorial-ai/') && url.pathname.endsWith('/apply')) {
      draftApplyCalls++;
      draftApplyRequests.push(JSON.parse(event.request.postData));
      entry = { ...entry, revision: 3, data: { ...entry.data, title: 'Пармиджано Реджано — текст редактора', region: 'Ломбардия' } };
      body = entry;
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
    assert.equal(researchRequests[0].entryId, id);
    assert.equal(researchRequests[0].revision, 1);
    assert.equal(researchRequests[0].sources.length, 2);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-research-report"]').innerText.includes('Fixture reader failure')`), true);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-research-report"]').innerText.includes('Regional cheese record')`), true);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-research-report"]').innerText.includes('История')`), true);
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
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-draft-apply"]').disabled`), false);
    await page.evaluate(`document.querySelector('[data-testid="ai-proposal-region"]').closest('article').querySelector('input[type="checkbox"]').click()`);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-proposal-region"]').closest('article').querySelector('input[type="checkbox"]').checked`), false, 'individual fields remain deselectable after bulk selection');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-proposal-title"]').closest('article').querySelector('input[type="checkbox"]').checked`), true);
    await clickButton('ai-draft-select-all');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-proposal-region"]').closest('article').querySelector('input[type="checkbox"]').checked`), true, 'bulk selection can add remaining proposed fields without changing edits');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-proposal-title"]').value`), 'Редакторская правка названия');
    assert.equal(draftApplyCalls, 0, 'bulk selection never triggers apply or an AI request');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-draft-apply"]').disabled`), false);
    await clickButton('ai-draft-apply');
    await page.wait(`document.body.innerText.includes('Уже применено')`);
    assert.equal(draftApplyCalls, 1, 'text is only saved after explicit field selection and apply');
    assert.deepEqual(draftApplyRequests[0].fields, ['title', 'region']);
    assert.equal(draftApplyRequests[0].edits.title, 'Редакторская правка названия', 'the preserved operator edit is sent only with explicit apply');
    await page.wait(`document.querySelector('[data-testid="ai-origin-place"]').value === 'Ломбардия'`);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-origin-lookup"]').disabled`), false, 'lookup unlocks after the applied region is saved');
    assert.equal(lookupCalls, 1, 'applying region still does not start a paid lookup automatically');
    await clickButton('ai-origin-lookup');
    await page.wait(`document.querySelectorAll('[data-testid="ai-origin-coordinates"] input[type="radio"]').length === 2`);
    assert.equal(lookupCalls, 2, 'lookup occurs only after explicit activation');
    assert.equal(lookupRequests[1].place, 'Ломбардия', 'lookup uses the region after it has been applied to the entry');
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-testid="ai-origin-coordinates"] input[type="radio"]:checked').length`), 0, 'candidates are never selected automatically');
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="ai-origin-apply"]').disabled`), true, 'saving still requires an explicit candidate selection');
    assert.equal(researchRequests.length, 2);
    assert.deepEqual(exceptions, []);
  } finally { await browser.close(); }
});
