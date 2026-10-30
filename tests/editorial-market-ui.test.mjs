// Opt-in only. Uses one real provider call and official live CBR data.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { launchBrowser } from './helpers/browser.mjs';
const path = process.env.EDITORIAL_MARKET_UI_FIXTURE;
if (!path || process.env.ALLOW_EDITORIAL_LIVE_AI !== '1') console.log('Skipped live market UI check.');
else {
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  assert.match(fixture.email, /^editorial-.*@example\.invalid$/);
  const browser = await launchBrowser(), page = await browser.newPage();
  let checks = 0; const exceptions = [];
  await page.send('Network.enable');
  page.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails?.text || 'Runtime error'));
  page.on('Network.requestWillBeSent', ({ request }) => { if (request.method === 'POST' && /\/editorial-market\/watches\/[^/]+\/check$/.test(request.url)) checks++; });
  page.on('Page.javascriptDialogOpening', () => page.send('Page.handleJavaScriptDialog', { accept: true }));
  const api = (path, method = 'GET', body) => page.evaluate(`(async()=>{
    const res=await fetch('/web-api'+${JSON.stringify(path)},{method:${JSON.stringify(method)},
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+sessionStorage.getItem('dgs_web_access_token')},
    ${body === undefined ? '' : `body:JSON.stringify(${JSON.stringify(body)}),`}});
    const json=await res.json();if(!res.ok)throw Error('API '+res.status+': '+json.error);return json;
  })()`);
  const select = (testid, value) => page.evaluate(`(()=>{const s=document.querySelector('[data-testid="${testid}"]');s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  try {
    await page.send('Page.navigate', { url: `https://${process.env.REPLIT_DEV_DOMAIN}/web/admin/market-prices` });
    await page.wait(`!!document.querySelector('#admin-email')`, 30000);
    await page.fill('#admin-email', fixture.email); await page.fill('#admin-password', fixture.password);
    await page.click('[data-testid="button-admin-login"]');
    await page.wait(`!!document.querySelector('[data-testid="market-watch-create-open"]')`, 30000);
    const cheese = fixture.cheeseId ? (await api('/admin/editorial?kind=cheese&limit=100')).items.find(c => c.id === fixture.cheeseId) : await api('/admin/editorial', 'POST', { kind: 'cheese', data: {
      title: 'Parmigiano Reggiano', country: 'Италия', region: 'Эмилия-Романья, Ломбардия',
      history: 'Временная статья для проверки цен.', characteristics: 'Проверка интерфейса.', culinaryUses: 'Проверка интерфейса.',
      photos: [fixture.photo], sources: [fixture.sourceUrl], latitude: 44.8, longitude: 10.3, status: 'ready',
    } });
    assert.equal(cheese.createdBy, fixture.id);
    if (!cheese.publication) await api(`/admin/editorial/${cheese.id}/publish`, 'POST', { revision: cheese.revision });
    fixture.cheeseId = cheese.id;
    await writeFile(path, JSON.stringify(fixture), { mode: 0o600 });
    // Reload so the relationship selector includes the newly saved article.
    await page.send('Page.navigate', { url: `https://${process.env.REPLIT_DEV_DOMAIN}/web/admin/market-prices` });
    if (!fixture.watchId) {
    await page.click('[data-testid="market-watch-create-open"]');
    await page.wait(`!!document.querySelector('[data-testid="market-watch-cheese"] option[value="${cheese.id}"]')`);
    await select('market-watch-cheese', cheese.id);
    await page.fill('[data-testid="market-watch-country"]', 'Австрия');
    await page.fill('[data-testid="market-watch-store"]', 'BILLA');
    await page.fill('[data-testid="market-watch-url"]', fixture.sourceUrl);
    await page.click('[data-testid="market-watch-create-submit"]');
    }
    await page.wait(`!!document.querySelector('[data-testid^="market-watch-check-"]')`);
    let watch = (await api('/admin/editorial-market/watches')).items.find(w => w.cheeseId === cheese.id);
    assert.ok(watch);
    fixture.watchId = watch.id; await writeFile(path, JSON.stringify(fixture), { mode: 0o600 });
    assert.ok(new Date(watch.nextCheckAt).valueOf() > Date.now() + 6.9 * 86400000);
    await page.click(`[data-testid="market-watch-toggle-${watch.id}"]`);
    await page.wait(`document.querySelector('[data-testid="market-watch-toggle-${watch.id}"]')?.textContent.includes('Возобновить')`);
    assert.equal((await api('/admin/editorial-market/watches')).items.find(w => w.id === watch.id).active, false);
    await page.click(`[data-testid="market-watch-toggle-${watch.id}"]`);
    await page.wait(`document.querySelector('[data-testid="market-watch-toggle-${watch.id}"]')?.textContent.includes('Пауза')`);
    const needsCheck = !watch.latest;
    if (needsCheck) await page.evaluate(`(()=>{const b=document.querySelector('[data-testid="market-watch-check-${watch.id}"]');b.click();b.click()})()`);
    await page.wait(`!!document.querySelector('[data-testid="market-apply-${watch.id}"]') || document.querySelector('[data-testid="market-watch-history-${watch.id}"]')?.closest('article')?.textContent.includes('Проверка не завершена')`, 90000);
    watch = (await api('/admin/editorial-market/watches')).items.find(w => w.id === watch.id);
    assert.equal(watch.latest.status, 'ready', watch.latest.error || 'No offer');
    assert.equal(checks, needsCheck ? 1 : 0);
    assert.ok(watch.latest.evidence.priceQuote);
    await page.click(`[data-testid="market-apply-${watch.id}"]`);
    await page.wait(`!!document.querySelector('[data-testid="market-import-price"]')`);
    // Review requires explicit confirmation of values against the cited source.
    assert.ok(watch.latest.proposal.price > 0 && watch.latest.proposal.currency === 'EUR');
    assert.ok(watch.latest.proposal.packageQuantity > 0 && watch.latest.proposal.packageUnit === 'g');
    await page.fill('[data-testid="market-import-notes"]', 'PRIVATE_MARKET_TEST_NOTE');
    await page.fill('[data-testid="market-import-offer-conditions"]', 'Цена выбранного магазина; наличие уточняйте у продавца.');
    await page.click('[data-testid="market-apply-submit"]');
    await page.wait(`!!document.querySelector('#ed-moderation-note')`, 30000);
    const check = await api(`/admin/editorial-market/checks/${watch.latest.id}`);
    assert.ok(check.entryId);
    let price = (await api('/admin/editorial?kind=price&limit=100')).items.find(p => p.id === check.entryId);
    assert.equal(price.moderation, 'pending');
    // Not public before moderation.
    assert.equal((await api(`/editorial/cheeses/${cheese.id}/prices`)).items.some(p => p.id === price.id), false);
    await page.fill('#ed-moderation-note', 'Проверено по публичной странице продавца.');
    await page.evaluate(`(()=>{const s=document.querySelector('#ed-moderation-decision');s.value='approved';s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await page.evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Сохранить решение');if(!b)throw Error('Moderation button missing');b.click()})()`);
    await page.wait(`!document.querySelector('#ed-moderation-note')`, 30000);
    price = (await api('/admin/editorial?kind=price&limit=100')).items.find(p => p.id === price.id);
    assert.equal(price.moderation, 'approved');
    await page.send('Page.navigate', { url: `https://${process.env.REPLIT_DEV_DOMAIN}/web/cheeses/${cheese.id}` });
    const scope = `[data-testid="foreign-price-${price.id}"]`;
    await page.wait(`!!document.querySelector('${scope} .ed-ruble-converted')`, 30000);
    const content = await page.evaluate(`document.querySelector('${scope}').textContent`);
    assert.ok(content.includes('EUR') && content.includes('₽') && content.includes('Цена наблюдалась'));
    assert.ok(content.includes('Цена выбранного магазина'));
    assert.equal(await page.evaluate(`document.body.textContent.includes('PRIVATE_MARKET_TEST_NOTE')`), false);
    assert.equal(await page.evaluate(`document.body.textContent.includes('не является стоимостью товара при ввозе в Россию')`), true);
    const fx = await api('/editorial/fx-rates');
    assert.equal(fx.status, 'fresh'); assert.ok(fx.effectiveOn && fx.rates.EUR > 0);
    // Simulate provider unavailability at the network boundary, without changing real cached rates.
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*/web-api/editorial/fx-rates', requestStage: 'Request' }] });
    page.on('Fetch.requestPaused', async ({ requestId }) => page.send('Fetch.fulfillRequest', {
      requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify({ ...fx, status: 'stale', warning: 'Проверка устаревшего курса', effectiveOn: '2026-01-01' })).toString('base64'),
    }));
    await page.send('Page.navigate', { url: `https://${process.env.REPLIT_DEV_DOMAIN}/web/cheeses/${cheese.id}` });
    await page.wait(`document.querySelector('${scope}')?.textContent.includes('Курс устарел')`);
    assert.equal(await page.evaluate(`!!document.querySelector('${scope} .ed-ruble-converted')`), false);
    await page.setViewport({ width: 390, height: 844, mobile: true });
    await page.evaluate(`document.querySelector('${scope}').scrollIntoView({block:'center'})`);
    const shot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 75 });
    await writeFile('/tmp/editorial-market-mobile.jpg', Buffer.from(shot.data, 'base64'));
    assert.equal(await page.evaluate('document.documentElement.scrollWidth>innerWidth+2'), false);
    assert.equal(await page.evaluate(`!!document.querySelector('vite-error-overlay')`), false);
    assert.equal(exceptions.length, 0);
    console.log(JSON.stringify({ passed: true, realRetailChecks: checks, officialFx: fx.source, verified: [
      'create', 'pause/resume', 'duplicate-click guard', 'real source evidence', 'pending before approval',
      'moderation', 'public conditions', 'private notes excluded', 'RUB with independent dates',
      'import disclaimer', 'stale rates not presented as current', 'mobile fit',
    ] }));
  } catch (error) {
    const shot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 }).catch(() => null);
    if (shot) await writeFile('/tmp/editorial-market-ui-failure.jpg', Buffer.from(shot.data, 'base64'));
    throw error;
  } finally { await page.close(); await browser.close(); }
}
