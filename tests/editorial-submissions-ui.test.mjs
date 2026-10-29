// Requires disposable DEVELOPMENT accounts: {admin,customer,other,photo}.
// Never use live customer/admin credentials.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { launchBrowser } from './helpers/browser.mjs';
import { cheeseDataSchema } from '../shared/editorial.ts';

test('customer price form, moderation, privacy, failures and in-flight account switch', {
  skip: !process.env.EDITORIAL_SUBMISSIONS_FIXTURE, timeout: 180000,
}, async () => {
  const f = JSON.parse(await readFile(process.env.EDITORIAL_SUBMISSIONS_FIXTURE, 'utf8'));
  const browser = await launchBrowser(), admin = await browser.newPage(), customer = await browser.newPage();
  const base = `https://${process.env.REPLIT_DEV_DOMAIN}`, title = `E2E-EDITORIAL-${randomUUID().slice(0, 8)}`;
  const store = title + '-Store', errors = [];
  let held = null, holdNext = false, failNext = false, submissions = 0;
  for (const page of [admin, customer])
    page.on('Runtime.exceptionThrown', event => errors.push(event.exceptionDetails.text));
  const field = name => `[data-testid="${name}"]`;
  async function navigate(page, path, text) {
    await page.send('Page.navigate', { url: base + path });
    await page.wait(`document.body?.innerText.includes(${JSON.stringify(text)})`);
  }
  async function select(page, testId, value) {
    await page.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(field(testId))});e.value=${JSON.stringify(value)};
      e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  }
  async function request(method, path, body) {
    const result = await admin.evaluate(`(async()=>{
      const response=await fetch('/web-api'+${JSON.stringify(path)},{method:${JSON.stringify(method)},
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+sessionStorage.getItem('dgs_web_access_token')},
        body:${body === undefined ? 'undefined' : `JSON.stringify(${JSON.stringify(body)})`}});
      return {status:response.status,data:response.status===204?null:await response.json()};
    })()`);
    assert.ok(result.status >= 200 && result.status < 300, `API ${method}: ${result.status}`);
    return result.data;
  }
  async function switchAccount(account) {
    // Actual application auth methods + real login/logout endpoints, not an auth bypass.
    await customer.evaluate(`(async()=>{const {useWebAuth}=await import('/src/web/hooks/useWebAuth.ts');
      await useWebAuth.getState().logout();await useWebAuth.getState().login(${JSON.stringify(account.email)},${JSON.stringify(account.password)});})()`);
    await customer.wait(`!!document.querySelector('[data-testid="cheese-price-form"]')`);
    await customer.wait(`!!document.querySelector('[data-testid="price-account-limits"]')`);
  }
  async function fillObservation() {
    await customer.fill(field('price-amount'), '12,50');
    await select(customer, 'price-currency', 'EUR');
    await customer.fill(field('price-country'), 'Италия');
    await customer.fill(field('price-store'), store);
    await customer.fill(field('price-package-quantity'), '250');
    await select(customer, 'price-package-unit', 'g');
  }
  async function refresh() {
    await customer.click(field('price-history-refresh'));
    await customer.wait(`!document.querySelector('[data-testid="price-history-refresh"]').disabled`);
  }
  async function picture(page, name, selector) {
    if (selector) await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start',behavior:'instant'})`);
    await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const image = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 75 });
    await writeFile(`/tmp/editorial-submissions-${name}.jpg`, Buffer.from(image.data, 'base64'));
  }
  async function moderation(note, decision = 'approved') {
    await navigate(admin, '/web/admin/market-prices', store);
    await admin.evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Проверить');button.setAttribute('data-e2e-review','')})()`);
    await admin.click('[data-e2e-review]');
    await admin.wait(`!!document.querySelector('#ed-moderation-note')`);
    await admin.fill('#ed-moderation-note', note);
    await admin.evaluate(`const e=document.querySelector('#ed-moderation-decision');e.value=${JSON.stringify(decision)};e.dispatchEvent(new Event('change',{bubbles:true}));`);
    await admin.evaluate(`[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent.trim()==='Сохранить решение').setAttribute('data-e2e-decision','')`);
    await admin.click('[data-e2e-decision]');
    await admin.wait(`!document.querySelector('#ed-moderation-note')`);
  }
  try {
    await navigate(admin, '/web/admin/cheeses', 'Войдите в панель');
    await admin.fill('#admin-email', f.admin.email); await admin.fill('#admin-password', f.admin.password);
    await admin.click('[data-testid="button-admin-login"]');
    await admin.wait(`document.body.innerText.includes('Сырная энциклопедия')`);
    let c = await request('POST', '/admin/editorial', { kind: 'cheese', data: cheeseDataSchema.parse({
      title, country: 'Италия', region: 'Ломбардия', latitude: 45.46, longitude: 9.19,
      status: 'ready', photos: [f.photo], history: 'Temporary verification fixture',
      characteristics: 'Verification', culinaryUses: 'Verification', sources: ['https://example.org/source'],
    }) });
    c = await request('POST', `/admin/editorial/${c.id}/publish`, { revision: c.revision });
    await writeFile('/tmp/editorial-submissions-result.json', JSON.stringify({ cheeseId: c.id }));
    await navigate(customer, `/web/cheeses/${c.id}`, title);
    await customer.wait(`!!document.querySelector('[data-testid="cheese-price-login"]')`);
    assert.equal(await customer.evaluate(`!!document.querySelector('[data-testid="cheese-price-form"]')`), false);
    await customer.click(field('cheese-price-login'));
    await customer.fill(field('input-login-email'), f.customer.email);
    await customer.fill(field('input-login-password'), f.customer.password);
    await customer.click(field('button-login-submit'));
    await customer.wait(`!!document.querySelector('[data-testid="price-account-limits"]')`);
    assert.equal(await customer.evaluate('location.pathname'), `/web/cheeses/${c.id}`);
    await select(customer, 'price-channel', 'online');
    await fillObservation();
    await customer.click(field('price-submit'));
    await customer.wait(`document.querySelector('[data-testid="price-submit-error"]')?.textContent.includes('Проверьте')`);
    assert.equal(await customer.evaluate(`document.querySelector('[data-testid="price-amount"]').value`), '12,50');
    await select(customer, 'price-channel', 'shop');
    console.log('PASS: guest login on same article, online source validation, comma decimals and retained invalid input');

    customer.on('Fetch.requestPaused', event => {
      submissions++;
      if (holdNext) { holdNext = false; held = event.requestId; return; }
      if (failNext) {
        failNext = false;
        void customer.send('Fetch.fulfillRequest', {
          requestId: event.requestId, responseCode: 503,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify({ error: 'TEST_SERVICE_UNAVAILABLE' })).toString('base64'),
        });
      } else void customer.send('Fetch.continueResponse', { requestId: event.requestId });
    });
    await customer.send('Fetch.enable', { patterns: [{ urlPattern: '*/web-api/editorial/cheeses/*/price-submissions', requestStage: 'Response' }] });
    holdNext = true;
    await customer.click(field('price-submit'));
    await customer.evaluate(`document.querySelector('[data-testid="cheese-price-form"]').requestSubmit()`);
    for (let i = 0; !held && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(held, 'held actual submission response');
    assert.equal(submissions, 1, 'immediate repeat submit is locked');
    await switchAccount(f.other);
    assert.equal(await customer.evaluate(`document.querySelectorAll('[data-testid="price-submission-row"]').length`), 0);
    await customer.fill(field('price-store'), 'OTHER_ACCOUNT_DRAFT');
    await switchAccount(f.customer);
    await customer.wait(`document.querySelectorAll('[data-testid="price-submission-row"]').length===1`);
    await customer.fill(field('price-store'), 'SURVIVING_NEW_DRAFT');
    await customer.send('Fetch.continueResponse', { requestId: held });
    held = null;
    await customer.evaluate('new Promise(resolve=>setTimeout(resolve,200))');
    assert.equal(await customer.evaluate(`document.querySelector('[data-testid="price-store"]').value`), 'SURVIVING_NEW_DRAFT');
    assert.equal(await customer.evaluate(`!!document.querySelector('[data-testid="price-submit-error"]')`), false);
    assert.equal(await customer.evaluate(`!!document.querySelector('[data-testid="price-status-pending"]')`), true);
    assert.equal(await customer.evaluate(`!!document.querySelector('.ed-prices')`), false);
    await customer.wait(`document.querySelector('[data-testid="price-account-limits"]').innerText.includes('9')`);
    console.log('PASS: one actual submission, pending hidden publicly, isolated A→B→A in-flight completion and fresh draft');

    await fillObservation();
    await customer.click(field('price-submit'));
    await customer.wait(`document.querySelector('[data-testid="price-submit-error"]')?.textContent.includes('уже отправили')`);
    assert.equal(await customer.evaluate(`document.querySelector('[data-testid="price-amount"]').value`), '12,50');
    await customer.fill(field('price-store'), store + '-Different');
    await customer.click(field('price-submit'));
    await customer.wait(`document.querySelector('[data-testid="price-submit-error"]')?.textContent.includes('Лимит отправок')`);
    assert.equal(await customer.evaluate(`document.querySelector('[data-testid="price-store"]').value`), store + '-Different');
    failNext = true;
    await customer.click(field('price-submit'));
    await customer.wait(`document.querySelector('[data-testid="price-submit-error"]')?.textContent.includes('TEST_SERVICE_UNAVAILABLE')`);
    assert.equal(await customer.evaluate(`document.querySelector('[data-testid="price-store"]').value`), store + '-Different');
    assert.equal(await customer.evaluate(`document.querySelectorAll('[data-testid="price-submission-row"]').length`), 1);
    await picture(customer, 'form-desktop', field('cheese-price-submissions'));
    console.log('PASS: duplicate, cooldown and service failure retain form and do not create extra observations');

    await moderation('PRIVATE_MODERATION_NOTE');
    await refresh();
    await customer.wait(`!!document.querySelector('[data-testid="price-status-approved"]') && document.querySelector('.ed-prices')?.innerText.includes('12.5 EUR')`);
    assert.equal(await customer.evaluate(`document.body.innerText.includes('PRIVATE_MODERATION_NOTE')`), false);
    const prices = await request('GET', '/admin/editorial?kind=price');
    let p = prices.items.find(item => item.data.store === store);
    assert.ok(p);
    await request('PATCH', `/admin/editorial/${p.id}`, { kind: 'price', revision: p.revision, data: { ...p.data, price: 14 } });
    await moderation('PRIVATE_REJECTION_NOTE', 'rejected');
    await refresh();
    await customer.wait(`!!document.querySelector('[data-testid="price-status-rejected"]') && !document.querySelector('.ed-prices')`);
    assert.equal(await customer.evaluate(`document.querySelector('[data-testid="price-submission-row"]').innerText.includes('12.5 EUR')`), true);
    assert.equal(await customer.evaluate(`document.body.innerText.includes('PRIVATE_REJECTION_NOTE')`), false);
    console.log('PASS: real admin moderation, approved publication, correction/rejection withdrawal, private notes and original owner history');

    await customer.setViewport({ width: 390, height: 844, mobile: true });
    await customer.evaluate(`document.querySelector('[data-testid="cheese-price-submissions"]').scrollIntoView({block:'start'})`);
    assert.equal(await customer.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
    await picture(customer, 'form-mobile', field('cheese-price-submissions'));
    await picture(customer, 'history-mobile', field('price-submission-history'));
    assert.deepEqual(errors, []);
    console.log('PASS: mobile form/history without overflow; no browser exceptions');
  } catch (error) {
    await picture(customer, 'failure');
    await picture(admin, 'admin-failure');
    console.log('Visible customer state:', await customer.evaluate('document.body?.innerText.slice(-1500)'));
    throw error;
  } finally {
    if (held) await customer.send('Fetch.continueResponse', { requestId: held }).catch(() => {});
    await admin.close(); await customer.close(); await browser.close();
  }
});
