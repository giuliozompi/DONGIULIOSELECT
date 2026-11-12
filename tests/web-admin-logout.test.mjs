import assert from 'node:assert/strict';
import { test } from 'node:test';
import { launchBrowser } from './helpers/browser.mjs';

for (const mobile of [false, true]) test(`admin logout returns to authorization without reload (${mobile ? 'mobile' : 'desktop'})`, {
  skip: !process.env.REPLIT_DEV_DOMAIN, timeout: 60000,
}, async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  let authenticated = true, logoutCount = 0, checkCount = 0, failLogout = true;
  let releaseLogout;
  const errors = [];
  const profile = { id: 'logout-fixture', firstName: 'Test', email: 'test@example.invalid' };
  await page.send('Network.enable');
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `if ('serviceWorker' in navigator) navigator.serviceWorker.register = async () => ({});`,
  });
  if (mobile) await page.send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  page.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails.text));
  await page.send('Fetch.enable', { patterns: [
    { urlPattern: '*/web-api/*' }, { urlPattern: '*telegram.org/js/telegram-web-app.js*' },
  ] });
  page.on('Fetch.requestPaused', async event => {
    const path = new URL(event.request.url).pathname;
    let status = 200, body = [];
    if (path.endsWith('/auth/refresh')) {
      status = authenticated ? 200 : 401;
      body = authenticated ? { accessToken: 'fixture-token', user: profile } : { error: 'Unauthorized' };
    } else if (path.endsWith('/auth/login')) {
      authenticated = true;
      body = { accessToken: 'fixture-new-token', user: profile };
    } else if (path.endsWith('/auth/logout')) {
      logoutCount++;
      await new Promise(resolve => { releaseLogout = resolve; });
      if (failLogout) { status = 503; body = { error: 'Unavailable' }; }
      else { authenticated = false; body = { message: 'Logged out' }; }
    } else if (path === '/web-api/admin/check') {
      checkCount++;
      status = authenticated ? 200 : 401;
      body = authenticated ? { ok: true, isMasterAdmin: true } : { error: 'Unauthorized' };
    }
    await page.send('Fetch.fulfillRequest', {
      requestId: event.requestId, responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify(body)).toString('base64'),
    });
  });
  const loginSelector = '[data-testid="input-admin-email"]';
  const logoutSelector = '[data-testid="button-admin-logout"]';
  const visibleLogoutSelector = mobile ? `div.fixed ${logoutSelector}` : logoutSelector;
  const openSidebar = async () => {
    if (mobile) {
      await page.evaluate(`document.querySelector('header button').click()`);
      await page.wait(`!!document.querySelector('${visibleLogoutSelector}')`);
    }
  };
  try {
    await page.send('Page.navigate', { url: `https://${process.env.REPLIT_DEV_DOMAIN}/web/admin/categories` });
    await page.wait(`!!document.querySelector('${logoutSelector}')`);
    await openSidebar();
    await page.click(visibleLogoutSelector);
    await page.wait(`document.querySelector('${logoutSelector}')?.disabled`);
    await page.evaluate(`document.querySelector('${logoutSelector}').click()`);
    assert.equal(logoutCount, 1, 'pending logout cannot be sent twice');
    releaseLogout();
    await page.wait(`!!document.querySelector('[role="alert"]')`);
    assert.equal(await page.evaluate(`!!document.querySelector('${loginSelector}')`), false,
      'a failed server revocation must not be presented as a successful logout');
    assert.equal(await page.evaluate(`!!sessionStorage.getItem('dgs_web_access_token')`), true);
    failLogout = false;
    await page.click(visibleLogoutSelector);
    await page.wait(`document.querySelector('${logoutSelector}')?.disabled`);
    releaseLogout();
    await page.wait(`!!document.querySelector('${loginSelector}')`);
    assert.equal(await page.evaluate(`!!document.querySelector('${logoutSelector}')`), false);
    assert.equal(await page.evaluate(`sessionStorage.getItem('dgs_web_access_token')`), null);
    assert.equal(await page.evaluate('location.pathname'), '/web/admin/categories');
    const checksAfterLogout = checkCount;
    // Going back to a protected route must not revive a cached authorization.
    await page.evaluate(`history.pushState({}, '', '/web/admin/products'); dispatchEvent(new PopStateEvent('popstate'))`);
    await page.wait(`!!document.querySelector('${loginSelector}')`);
    assert.equal(checkCount, checksAfterLogout);
    await page.evaluate(`(() => {
      for (const [selector,value] of [['${loginSelector}','test@example.invalid'],['[data-testid="input-admin-password"]','fixture-password']]) {
        const input=document.querySelector(selector);
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
        input.dispatchEvent(new Event('input',{bubbles:true}));
      }
    })()`);
    await page.evaluate(`document.querySelector('form').requestSubmit()`);
    await page.wait(`!!document.querySelector('${logoutSelector}')`);
    assert.ok(checkCount > checksAfterLogout, 'sign-in must perform a fresh role check');
    assert.equal(logoutCount, 2);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
