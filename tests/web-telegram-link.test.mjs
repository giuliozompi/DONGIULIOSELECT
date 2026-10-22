import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { launchBrowser } from './helpers/browser.mjs';

const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const connect = '[data-testid="button-get-link-code"]';
const unlink = '[data-testid="button-unlink-telegram"]';
const text = '(document.body?.textContent || "")';
let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

async function fixture(context, { linked = '123456789', loginLinked = null, failRead = false, holdRead = false, lateA = false } = {}) {
  const page = await browser.newPage();
  context.after(() => page.close());
  const live = { linked, failRead, codes: 0, deletes: 0, reads: 0, linkedOnCode: false, lateReturned: false };
  const gate = new Promise(resolve => { live.releaseProfile = resolve; });
  const profile = (id, telegramUserId) => ({ id, firstName: id === A ? 'Fixture A' : 'Fixture B',
    email: 'fixture@example.invalid', telegramUserId, isEmailVerified: true, marketingConsent: false,
    createdAt: '2026-10-01T00:00:00.000Z' });
  await page.send('Fetch.enable', { patterns: [
    { urlPattern: '*/web-api/*' }, { urlPattern: '*/api/*' }, { urlPattern: '*telegram-web-app.js*' },
    { urlPattern: '*t.me/*' }, { urlPattern: '*api.telegram.org/*' },
  ] });
  page.on('Fetch.requestPaused', async event => {
    const url = new URL(event.request.url);
    const path = url.pathname;
    let status = 200; let result = [];
    if (['t.me', 'api.telegram.org'].includes(url.hostname)) {
      await page.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' });
      throw new Error('Real Telegram navigation is forbidden in this test');
    }
    if (path === '/web-api/auth/refresh') result = { accessToken: 'fixture-a', user: profile(A, loginLinked) };
    else if (path === '/web-api/auth/me') {
      live.reads++;
      const authorization = Object.entries(event.request.headers).find(([key]) => key.toLowerCase() === 'authorization')?.[1] || '';
      const owner = authorization.includes('fixture-b') ? B : A;
      result = { user: profile(owner, owner === B ? '987654321' : live.linked) };
      status = live.failRead ? 503 : 200;
      if (live.failRead) result = { error: 'Fixture state unavailable' };
      if (holdRead) await gate;
      if (lateA && owner === A) {
        await new Promise(resolve => setTimeout(resolve, 600));
        live.lateReturned = true;
        live.onLateReturned?.();
      }
    } else if (path === '/web-api/auth/telegram-link-code') {
      live.codes++;
      if (live.linkedOnCode) live.linked = '123456789';
      result = live.linked ? { linked: true, telegramUserId: live.linked } : {
        linked: false, code: 'fixture-short-code', botUrl: 'https://t.me/example_fixture_bot?start=link_fixture-short-code',
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      };
    } else if (path === '/web-api/auth/link-telegram' && event.request.method === 'DELETE') {
      if (url.searchParams.get('profileId') !== A) { status = 409; result = { error: 'Fixture profile mismatch' }; }
      else { live.deletes++; live.linked = null; result = { success: true }; }
    } else if (event.request.method !== 'GET') {
      await page.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' });
      throw new Error(`Unexpected mutation blocked: ${path}`);
    }
    await page.send('Fetch.fulfillRequest', {
      requestId: event.requestId, responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: path.includes('telegram-web-app') ? 'text/javascript' : 'application/json' }],
      body: Buffer.from(path.includes('telegram-web-app') ? '' : JSON.stringify(result)).toString('base64'),
    });
  });
  return { page, live };
}
const open = page => page.send('Page.navigate', { url: `${base}/web/account` });
const exists = selector => `!!document.querySelector(${JSON.stringify(selector)})`;

test('already-linked profile is checked before any connect prompt and remains linked after reload', async context => {
  const { page, live } = await fixture(context, { holdRead: true });
  await open(page);
  await page.wait(`${text}.includes('Проверяем подключение Telegram')`);
  assert.equal(await page.evaluate(exists(connect)), false);
  live.releaseProfile();
  await page.wait(exists(unlink));
  assert.match(await page.evaluate(text), /Telegram подключён/);
  assert.match(await page.evaluate(text), /123456789/);
  assert.match(await page.evaluate(text), /Повторная привязка не требуется/);
  assert.equal(await page.evaluate(exists(connect)), false);
  assert.equal(live.codes, 0);
  await page.send('Page.reload', { ignoreCache: true });
  await page.wait(exists(unlink));
  assert.equal(live.codes, 0);
  const screenshot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 75, captureBeyondViewport: true });
  await writeFile('/tmp/telegram-linked-account-fixture.jpg', Buffer.from(screenshot.data, 'base64'));
});

test('verification failure is not mistaken for unlinked and a retry restores the true state', async context => {
  const { page, live } = await fixture(context, { failRead: true });
  await open(page);
  await page.wait(`!!document.querySelector('[role="alert"]')`);
  assert.equal(await page.evaluate(exists(connect)), false);
  assert.equal(live.codes, 0);
  live.failRead = false;
  await page.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Повторить проверку')).click()`);
  await page.wait(exists(unlink));
  assert.equal(live.codes, 0);
});

test('returning to the account checks fresh state without generating a code', async context => {
  const { page, live } = await fixture(context, { linked: null });
  await open(page);
  await page.wait(exists(connect));
  live.linked = '123456789';
  await page.evaluate(`window.dispatchEvent(new Event('visibilitychange'))`);
  await page.wait(exists(unlink), 6000);
  assert.equal(await page.evaluate(exists(connect)), false);
  assert.equal(live.codes, 0);
});

test('link completed on another device during code request shows linked state, not repeated instructions', async context => {
  const { page, live } = await fixture(context, { linked: null });
  await open(page);
  await page.wait(exists(connect));
  live.linkedOnCode = true;
  await page.click(connect);
  await page.wait(exists(unlink));
  assert.equal(live.codes, 1);
  assert.equal(await page.evaluate(exists('[data-testid="button-open-telegram-bot"]')), false);
  assert.equal(await page.evaluate(`${text}.includes('Как привязать:')`), false);
});

test('new linking attempt is explicit and polling detects completion without another action', async context => {
  const { page, live } = await fixture(context, { linked: null });
  await open(page);
  await page.wait(exists(connect));
  assert.equal(live.codes, 0);
  await page.click(connect);
  await page.wait(exists('[data-testid="button-open-telegram-bot"]'));
  live.linked = '123456789';
  await page.wait(exists(unlink), 8000);
  assert.equal(await page.evaluate(exists('[data-testid="button-open-telegram-bot"]')), false);
  assert.equal(live.codes, 1);
});

test('unlink is deliberate and only its successful completion restores the connect action', async context => {
  const { page, live } = await fixture(context);
  await open(page);
  await page.wait(exists(unlink));
  await page.evaluate('window.confirm=()=>false');
  await page.click(unlink);
  assert.equal(live.deletes, 0);
  await page.evaluate('window.confirm=()=>true');
  await page.click(unlink);
  await page.wait(exists(connect));
  assert.equal(live.deletes, 1);
  assert.equal(live.codes, 0);
  assert.equal(await page.evaluate(exists(unlink)), false);
});

test('late profile response cannot put the previous account back into the auth store', async context => {
  const { page, live } = await fixture(context, { lateA: true });
  await open(page);
  await page.wait(`${text}.includes('Проверяем подключение Telegram')`);
  await page.evaluate(`(async()=>{
    const resources=performance.getEntriesByType('resource').map(e=>e.name);
    const authUrl=resources.find(url=>url.includes('/src/web/hooks/useWebAuth.ts'));
    const apiUrl=resources.find(url=>url.includes('/src/web/lib/webApi.ts'));
    const {useWebAuth}=await import(authUrl);
    const {setAccessToken}=await import(apiUrl);
    window.fixtureAuth=useWebAuth;
    setAccessToken('fixture-b');
    useWebAuth.setState({user:{id:${JSON.stringify(B)},firstName:'Fixture B',isEmailVerified:true},
      accessToken:'fixture-b',isAuthenticated:true,isLoading:false});
  })()`);
  await page.wait(`${text}.includes('987654321')`);
  if (!live.lateReturned) await new Promise(resolve => { live.onLateReturned = resolve; });
  await page.wait(`performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname==='/web-api/auth/me').length>=2`);
  await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const user = await page.evaluate('window.fixtureAuth.getState().user');
  assert.equal(user.id, B);
  assert.equal(user.telegramUserId, '987654321');
  assert.equal(await page.evaluate(`${text}.includes('123456789')`), false);
});
