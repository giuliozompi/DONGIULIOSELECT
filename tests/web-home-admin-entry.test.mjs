import assert from 'node:assert/strict';
import { test } from 'node:test';
import { launchBrowser } from './helpers/browser.mjs';

test('homepage administration shortcut is icon-only and opens protected login on desktop and mobile', {
  skip: !process.env.REPLIT_DEV_DOMAIN, timeout: 90000,
}, async () => {
  const browser = await launchBrowser();
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage();
      const submitted = [];
      await page.send('Network.enable');
      await page.send('Network.setBypassServiceWorker', { bypass: true });
      await page.send('Emulation.setDeviceMetricsOverride', {
        width, height: 900, deviceScaleFactor: 1, mobile: width < 500,
      });
      await page.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `if('serviceWorker' in navigator) navigator.serviceWorker.register=async()=>({});`,
      });
      await page.send('Fetch.enable', { patterns: [{ urlPattern: '*/web-api/*' }] });
      page.on('Fetch.requestPaused', async event => {
        const path = new URL(event.request.url).pathname;
        const denied = path === '/web-api/auth/refresh' || path === '/web-api/admin/check';
        const body = denied ? { error: 'Unauthorized' }
          : path === '/web-api/products' ? { products: [], total: 0 }
          : [];
        if (event.request.method !== 'GET' && path !== '/web-api/auth/refresh')
          submitted.push(path);
        await page.send('Fetch.fulfillRequest', {
          requestId: event.requestId, responseCode: denied ? 401 : 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify(body)).toString('base64'),
        });
      });
      await page.send('Page.navigate', { url: `https://${process.env.REPLIT_DEV_DOMAIN}/web` });
      await page.wait(`!!document.querySelector('[data-testid="button-admin-entry"]')`);
      const link = await page.evaluate(`(() => {
        const e=document.querySelector('[data-testid="button-admin-entry"]'),r=e.getBoundingClientRect();
        return {href:e.getAttribute('href'),text:e.textContent.trim(),label:e.getAttribute('aria-label'),
          title:e.getAttribute('title'),icon:!!e.querySelector('svg[aria-hidden="true"]'),
          width:r.width,height:r.height,left:r.left,right:r.right,top:r.top};
      })()`);
      assert.equal(link.href, '/web/admin');
      assert.equal(link.text, '', 'no visible Admin text or other written label');
      assert.equal(link.label, 'Вход в панель управления');
      assert.equal(link.title, link.label);
      assert.equal(link.icon, true);
      assert.ok(link.width >= 36 && link.height >= 36);
      assert.ok(link.left >= 0 && link.right <= width && link.top >= 0, 'shortcut is visible in the initial viewport');
      if (width === 1280) {
        await page.evaluate(`document.querySelector('[data-testid="button-admin-entry"]').focus()`);
        await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      } else await page.click('[data-testid="button-admin-entry"]');
      await page.wait(`location.pathname==='/web/admin' && document.body.innerText.includes('Войдите в панель управления')`);
      assert.equal(await page.evaluate(`!!document.querySelector('input[type="password"]')`), true);
      assert.equal(await page.evaluate(`!!document.querySelector('[data-testid="button-admin-logout"]')`), false, 'unauthenticated visitor cannot see protected administration');
      assert.deepEqual(submitted, [], 'the shortcut never submits credentials or changes data');
      await page.send('Page.navigate', { url: `https://${process.env.REPLIT_DEV_DOMAIN}/web/cart` });
      await page.wait(`document.querySelector('header') && location.pathname==='/web/cart'`);
      assert.equal(await page.evaluate(`!!document.querySelector('[data-testid="button-admin-entry"]')`), false, 'shortcut is limited to homepage');
    }
  } finally { await browser.close(); }
});
