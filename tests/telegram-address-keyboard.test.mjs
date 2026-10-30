import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { launchBrowser } from './helpers/browser.mjs';

const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const selector = id => `[data-testid="${id}"]`;
const exists = id => `!!document.querySelector(${JSON.stringify(selector(id))})`;
const orderId = '11111111-1111-4111-8111-111111111111';
const suggestions = [
  { fullAddress: 'г Москва, ул Тестовая, д 1', city: 'Москва', street: 'Тестовая',
    building: '1', flat: '7', postalCode: '123456', fiasId: 'fixture-fias-1',
    geoLat: '55.75', geoLon: '37.61' },
  { fullAddress: 'г Москва, ул Тестовая, д 2', city: 'Москва', street: 'Тестовая',
    building: '2', flat: null, postalCode: '123457', fiasId: 'fixture-fias-2',
    geoLat: '55.76', geoLon: '37.62' },
];
const user = { id: 'fixture-user', firstName: 'Fixture', customerName: 'Тестовый клиент',
  phone: '+79990000000', email: 'fixture@example.invalid', address: 'Москва, старый адрес, д 3' };
const savedAddress = { id: 'fixture-home', label: 'Дом', fullAddress: user.address,
  city: 'Москва', street: 'Старая', building: '3', flat: '8', isDefault: false };
const order = { id: orderId, userId: user.id, status: 'ОПЛАЧЕН',
  createdAt: '2026-01-01T00:00:00.000Z', amount: '100.00', items: [],
  customerName: user.customerName, customerPhone: user.phone,
  deliveryMethod: 'yandex_go', deliveryAddress: user.address,
  deliveryLatitude: '55.75', deliveryLongitude: '37.61', paymentMethod: 'yookassa' };
const pickupAddress = { id: 'fixture-pickup', label: 'Магазин', fullAddress: user.address,
  contactName: 'Fixture', contactPhone: user.phone, latitude: '55.75', longitude: '37.61', isDefault: true };
let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

async function fixture(context, path, { document: fixtureDocument, pickupAddresses = [] } = {}) {
  // Each page has a fresh browser context; the helper bypasses service workers
  // before navigation so no API call can escape interception in a worker target.
  const page = await browser.newPage();
  context.after(() => page.close());
  const requests = [];
  const blocked = [];
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.Telegram={WebApp:{
      initData:'fixture-telegram-data',initDataUnsafe:{user:{id:999999998,first_name:'Fixture'}},
      colorScheme:'light',themeParams:{},version:'8.0',platform:'web',
      ready(){},expand(){},enableClosingConfirmation(){},onEvent(){},offEvent(){},
      setHeaderColor(){},setBackgroundColor(){},setBottomBarColor(){},isVersionAtLeast(){return true},
      BackButton:{show(){},hide(){},onClick(){},offClick(){}},
      MainButton:{show(){},hide(){},enable(){},disable(){},onClick(){},offClick(){},
        setText(){},setParams(){},showProgress(){},hideProgress(){}},
      HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}
    }};
    window.fixtureSubmits=0;
    document.addEventListener('submit',event=>{
      window.fixtureSubmits++;
      event.preventDefault();
      event.stopImmediatePropagation();
    },true);
  ` });
  // Fail closed: only same-origin GET assets/documents may reach the app.
  // All APIs (including reads), all mutations and external requests are mocked
  // or blocked. In particular no order/payment/carrier endpoint is continued.
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  page.on('Fetch.requestPaused', async event => {
    const { request, requestId } = event;
    const url = new URL(request.url);
    const api = /^\/(?:api|web-api)(?:\/|$)/.test(url.pathname);
    const sdk = url.hostname === 'telegram.org' && url.pathname.endsWith('/telegram-web-app.js');
    if (fixtureDocument && url.origin === new URL(base).origin &&
        url.pathname === path && request.method === 'GET' && event.resourceType === 'Document') {
      await page.send('Fetch.fulfillRequest', { requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/html' }],
        body: Buffer.from(fixtureDocument).toString('base64') });
      return;
    }
    if (!api && !sdk && url.origin === new URL(base).origin && request.method === 'GET') {
      await page.send('Fetch.continueRequest', { requestId });
      return;
    }
    const record = { path: url.pathname, method: request.method, headers: request.headers };
    requests.push(record);
    let body;
    if (sdk) body = '';
    else if (api && url.origin === new URL(base).origin && request.method === 'GET') {
      const responses = {
        '/api/user': user,
        '/api/user/addresses': [savedAddress],
        '/api/cart': { userId: user.id, items: [{ productId: 'fixture-cheese', quantity: 1, priceAtAdd: '100.00' }] },
        '/api/products': [{ id: 'fixture-cheese', name: 'Fixture cheese', price: '100.00', unit: 'шт', isAvailable: true }],
        '/api/fortune': { spinTokens: 0, bonuses: [], totalBonusAmount: '0' },
        '/api/admin/check': { isAdmin: true, isMasterAdmin: false },
        '/api/admin/orders': [order],
        '/api/admin/pickup-addresses': pickupAddresses,
        '/api/categories': [],
        '/api/address/suggest': { suggestions },
      };
      body = responses[url.pathname];
    }
    if (body === undefined) {
      blocked.push(record);
      await page.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
      return;
    }
    await page.send('Fetch.fulfillRequest', { requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: sdk ? 'text/javascript' : 'application/json' }],
      body: Buffer.from(sdk ? body : JSON.stringify(body)).toString('base64'),
    });
  });
  await page.send('Page.navigate', { url: `${base}${path}` });
  return { page, requests, blocked };
}

async function press(page, key) {
  // Native browser events also exercise implicit form submission and Radix's
  // document-capture Escape handler (synthetic React events would miss these).
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key,
    windowsVirtualKeyCode: { Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38 }[key] });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key });
}

async function state(page, id) {
  return page.evaluate(`(() => {
    const input=document.querySelector(${JSON.stringify(selector(id))});
    const controls=input.getAttribute('aria-controls');
    const list=controls && document.getElementById(controls);
    const active=input.getAttribute('aria-activedescendant');
    const option=active && document.getElementById(active);
    return {value:input.value,role:input.getAttribute('role'),
      autocomplete:input.getAttribute('aria-autocomplete'),
      expanded:input.getAttribute('aria-expanded'),controls,active,
      focused:document.activeElement===input,listRole:list?.getAttribute('role'),
      optionIds:list ? [...list.querySelectorAll('[role="option"]')].map(el=>el.id) : [],
      activeInList:!!option && list?.contains(option),
      selected:option?.getAttribute('aria-selected')};
  })()`);
}

async function openSuggestions(page, id, value = 'Москва Тестовая') {
  await page.click(selector(id));
  await page.fill(selector(id), value);
  await page.wait(`document.querySelector(${JSON.stringify(selector(id))})?.getAttribute('aria-expanded')==='true'`);
  const result = await state(page, id);
  assert.equal(result.role, 'combobox');
  assert.equal(result.autocomplete, 'list');
  assert.equal(result.listRole, 'listbox');
  assert.equal(result.focused, true);
  assert.equal(result.active, null);
  assert.equal(result.optionIds.length, 2);
  assert.equal(new Set([result.controls, ...result.optionIds]).size, 3);
  return result;
}

async function selectWithKeyboard(page, id) {
  const draft = (await state(page, id)).value;
  await press(page, 'Enter'); // No highlight: do not select or submit.
  assert.equal((await state(page, id)).value, draft);
  assert.equal((await state(page, id)).expanded, 'true');
  await press(page, 'ArrowDown');
  let current = await state(page, id);
  assert.equal(current.active, current.optionIds[0]);
  assert.equal(current.activeInList, true);
  assert.equal(current.selected, 'true');
  await press(page, 'ArrowUp'); // Wrap to last option.
  current = await state(page, id);
  assert.equal(current.active, current.optionIds[1]);
  assert.equal(current.value, draft);
  await press(page, 'Enter');
  current = await state(page, id);
  assert.equal(current.value, suggestions[1].fullAddress);
  assert.equal(current.focused, true);
  assert.equal(current.expanded, 'false');
  assert.equal(current.active, null);
  assert.equal(current.controls, null);
}

async function assertNoSideEffects({ page, requests, blocked }) {
  // Allow debounced suggestions and any accidental async mutations to settle.
  await delay(500);
  assert.equal(await page.evaluate('window.fixtureSubmits'), 0, 'Enter must not submit the enclosing form');
  assert.deepEqual(requests.filter(r => !['GET', 'HEAD'].includes(r.method)), [], 'No save/order/payment/shipment request');
  assert.deepEqual(blocked, [], 'No unmocked API or external request');
  assert.ok(requests.some(r => r.path === '/api/address/suggest'), 'Suggestion API must actually be intercepted');
  const authenticated = requests.find(r => ['/api/user', '/api/admin/orders', '/api/admin/pickup-addresses'].includes(r.path));
  assert.equal(authenticated?.headers['x-telegram-init-data'], 'fixture-telegram-data');
}

async function standaloneDialogDocument(component) {
  // These legacy dialogs are not mounted by the current admin page. Mount the
  // real source in a browser-only document; never add a test route to the app.
  // Discover Vite's exact versioned imports to avoid duplicate React instances.
  const source = async path => {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, `Vite must serve ${path}`);
    return response.text();
  };
  const [dialog, main] = await Promise.all([
    source(`/src/components/${component}.tsx`), source('/src/main.tsx'),
  ]);
  const dependency = (text, name) => {
    const url = [...text.matchAll(/from "([^"]+)"/g)].map(match => match[1])
      .find(url => url.split('?')[0].endsWith(`/${name}.js`));
    assert.ok(url, `Vite import for ${name} must exist`);
    return JSON.stringify(url);
  };
  return `<!doctype html><html><head><link rel="icon" href="data:,">
    <title>Isolated delivery keyboard test</title></head><body><div id="root"></div>
    <script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$=()=>{};
      window.$RefreshSig$=()=>type=>type;
      window.__vite_plugin_react_preamble_installed__=true;
      const [react,dom,query,client,component]=await Promise.all([
        import(${dependency(dialog, 'react')}),
        import(${dependency(main, 'react-dom_client')}),
        import(${dependency(dialog, '@tanstack_react-query')}),
        import('/src/lib/queryClient.ts'),
        import('/src/components/${component}.tsx')
      ]);
      await import('/src/index.css');
      const React=react.default;
      function Harness(){
        const [open,setOpen]=React.useState(true);
        return React.createElement(query.QueryClientProvider,{client:client.queryClient},
          React.createElement(component.${component},{open,order:${JSON.stringify(order)},
            onOpenChange(value){window.fixtureDialogChanges.push(value);setOpen(value)}}));
      }
      window.fixtureDialogChanges=[];
      dom.default.createRoot(document.getElementById('root')).render(React.createElement(Harness));
    </script></body></html>`;
}

test('Telegram profile: keyboard selection and Escape retain the unsaved delivery draft', async context => {
  const live = await fixture(context, '/my-data');
  const { page } = live;
  await page.click(selector('button-edit-address'));
  await openSuggestions(page, 'input-address-autocomplete');
  await selectWithKeyboard(page, 'input-address-autocomplete');
  await openSuggestions(page, 'input-address-autocomplete', 'Москва несохраненный адрес');
  await press(page, 'Escape');
  assert.equal((await state(page, 'input-address-autocomplete')).expanded, 'false');
  assert.equal((await state(page, 'input-address-autocomplete')).value, 'Москва несохраненный адрес');
  assert.equal((await state(page, 'input-address-autocomplete')).focused, true);
  assert.equal(await page.evaluate(exists('button-save-all')), true);
  assert.equal(await page.evaluate('location.pathname'), '/my-data');
  await assertNoSideEffects(live);
});

for (const mode of ['add', 'edit']) {
  test(`Telegram ${mode} address dialog: first Escape closes only suggestions; Enter never saves`, async context => {
    const live = await fixture(context, '/my-data');
    const { page } = live;
    const id = `input-${mode === 'add' ? 'new' : 'edit'}-address-autocomplete`;
    const dialog = `dialog-${mode}-address`;
    await page.click(selector(mode === 'add' ? 'button-add-address' : 'button-edit-address-fixture-home'));
    if (mode === 'add') await page.fill(selector('input-new-address-label'), 'Работа');
    const opened = await openSuggestions(page, id);
    await selectWithKeyboard(page, id);
    assert.equal(await page.evaluate(exists(dialog)), true);
    await openSuggestions(page, id, 'Москва черновик');
    await press(page, 'Escape');
    const dismissed = await state(page, id);
    assert.equal(dismissed.expanded, 'false');
    assert.equal(dismissed.controls, null);
    assert.equal(dismissed.active, null);
    assert.equal(dismissed.value, 'Москва черновик');
    assert.equal(dismissed.focused, true);
    assert.equal(await page.evaluate(exists(dialog)), true);
    assert.equal(await page.evaluate(`!!document.getElementById(${JSON.stringify(opened.controls)})`), false);
    await delay(400);
    assert.equal((await state(page, id)).expanded, 'false');
    await press(page, 'Escape');
    await page.wait(`!document.querySelector(${JSON.stringify(selector(dialog))})`);
    await assertNoSideEffects(live);
  });
}

test('Telegram checkout: Enter chooses the address without submitting a valid order or saving it', async context => {
  const live = await fixture(context, '/checkout');
  const { page } = live;
  await page.wait(exists('input-customer-name'));
  await page.fill(selector('input-customer-name'), user.customerName);
  await page.fill(selector('input-customer-phone'), user.phone);
  await page.fill(selector('input-customer-email'), user.email);
  await page.click(selector('radio-delivery-yandex_go'));
  await page.click(selector('radio-payment-cash_on_delivery'));
  await page.click(selector('checkbox-save-address'));
  await page.fill(selector('input-address-label'), 'Работа');
  await openSuggestions(page, 'input-delivery-address');
  await selectWithKeyboard(page, 'input-delivery-address');
  await page.fill(selector('input-delivery-notes'), 'Не терять комментарий');
  await openSuggestions(page, 'input-delivery-address', 'Москва черновик, дом 15');
  await press(page, 'Escape');
  const dismissed = await state(page, 'input-delivery-address');
  assert.equal(dismissed.expanded, 'false');
  assert.equal(dismissed.focused, true);
  assert.equal(dismissed.value, 'Москва черновик, дом 15');
  assert.equal(await page.evaluate(`document.querySelector('[data-testid="input-delivery-notes"]').value`), 'Не терять комментарий');
  assert.equal(await page.evaluate('location.pathname'), '/checkout');
  await assertNoSideEffects(live);
});

test('delivery dialog: pickup and destination have distinct ARIA IDs and isolated keyboard state', async context => {
  const live = await fixture(context, '/admin?section=orders');
  const { page } = live;
  await page.click(selector(`button-call-courier-${orderId}`));
  await page.wait(exists('dialog-unified-delivery'));
  await page.click(selector('button-edit-delivery'));
  const pickup = await openSuggestions(page, 'input-pickup-address', 'Москва отправление');
  await selectWithKeyboard(page, 'input-pickup-address');
  assert.equal(await page.evaluate(`document.querySelector('[data-testid="button-save-pickup-address"]').disabled`), false);
  const destination = await openSuggestions(page, 'input-delivery-address', 'Москва получатель');
  assert.notEqual(destination.controls, pickup.controls);
  assert.equal(destination.optionIds.some(id => pickup.optionIds.includes(id)), false);
  assert.equal((await state(page, 'input-pickup-address')).active, null);
  assert.equal((await state(page, 'input-pickup-address')).expanded, 'false');
  await selectWithKeyboard(page, 'input-delivery-address');
  assert.equal((await state(page, 'input-pickup-address')).value, suggestions[1].fullAddress);
  // Reopen each instance, checking stable IDs and two-step Escape priority.
  for (const [id, previous] of [['input-pickup-address', pickup], ['input-delivery-address', destination]]) {
    const current = await openSuggestions(page, id, `Москва черновик ${id}`);
    assert.equal(current.controls, previous.controls);
    await press(page, 'ArrowDown');
    await press(page, 'Escape');
    const dismissed = await state(page, id);
    assert.equal(dismissed.expanded, 'false');
    assert.equal(dismissed.active, null);
    assert.equal(dismissed.focused, true);
    assert.equal(dismissed.value, `Москва черновик ${id}`);
    assert.equal(await page.evaluate(exists('dialog-unified-delivery')), true);
  }
  await press(page, 'Escape');
  await page.wait(`!document.querySelector('[data-testid="dialog-unified-delivery"]')`);
  await assertNoSideEffects(live);
});

for (const config of [
  { component: 'YandexGoDialog', destination: 'input-delivery-address-autocomplete',
    add: 'button-add-new-pickup', phone: 'input-pickup-contact-phone',
    save: 'button-save-pickup-address', price: 'button-calculate-price-yandex-go',
    courier: 'button-call-courier-yandex-go' },
  { component: 'YandexDeliveryDialog', destination: 'input-delivery-address-edit',
    add: 'button-add-pickup', phone: 'input-pickup-phone',
    save: 'button-save-pickup', price: 'button-calculate-price',
    courier: 'button-create-delivery' },
]) {
  for (const hasSavedPickup of [false, true]) {
    test(`${config.component} (${hasSavedPickup ? 'saved' : 'first'} pickup): isolated ARIA, Enter and two-step Escape`, async context => {
      const path = `/__keyboard-fixture/${config.component}`;
      const live = await fixture(context, path, {
        document: await standaloneDialogDocument(config.component),
        pickupAddresses: hasSavedPickup ? [pickupAddress] : [],
      });
      const { page } = live;
      await page.wait(`!!document.querySelector('[role="dialog"]')`);
      if (hasSavedPickup) {
        await page.wait(`document.querySelector(${JSON.stringify(selector(config.price))})?.disabled===false`);
        await page.click(selector(config.add));
      }
      await page.wait(exists('input-pickup-address'));
      await page.fill(selector(config.phone), user.phone);
      await page.click(selector('button-edit-delivery'));
      const pickup = await openSuggestions(page, 'input-pickup-address', 'Москва отправление');
      await selectWithKeyboard(page, 'input-pickup-address');
      assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(selector(config.save))}).disabled`), false);
      const destination = await openSuggestions(page, config.destination, 'Москва получатель');
      assert.notEqual(destination.controls, pickup.controls);
      assert.equal(destination.optionIds.some(id => pickup.optionIds.includes(id)), false);
      assert.equal((await state(page, 'input-pickup-address')).active, null);
      assert.equal((await state(page, 'input-pickup-address')).expanded, 'false');
      await selectWithKeyboard(page, config.destination);
      assert.equal((await state(page, 'input-pickup-address')).value, suggestions[1].fullAddress);
      assert.deepEqual(await page.evaluate('window.fixtureDialogChanges'), []);
      assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(selector(config.courier))}).disabled`), true);

      // Each field independently gets first-Escape protection and a normal
      // second Escape. Reopen a fresh controlled instance for the second field.
      for (const [index, [id, previous]] of [
        ['input-pickup-address', pickup], [config.destination, destination],
      ].entries()) {
        if (index > 0) {
          // Reload the intercepted document, not a real admin/order endpoint.
          await page.send('Page.navigate', { url: `${base}${path}` });
          if (hasSavedPickup) await page.click(selector(config.add));
          await page.wait(exists('input-pickup-address'));
          await page.click(selector('button-edit-delivery'));
        }
        const draft = `Москва черновик ${id}`;
        const opened = await openSuggestions(page, id, draft);
        if (index === 0) assert.equal(opened.controls, previous.controls);
        await press(page, 'ArrowDown');
        await press(page, 'Escape');
        const dismissed = await state(page, id);
        assert.equal(dismissed.expanded, 'false');
        assert.equal(dismissed.controls, null);
        assert.equal(dismissed.active, null);
        assert.equal(dismissed.value, draft);
        assert.equal(dismissed.focused, true);
        assert.equal(await page.evaluate(`!!document.getElementById(${JSON.stringify(opened.controls)})`), false);
        assert.deepEqual(await page.evaluate('window.fixtureDialogChanges'), []);
        await delay(400);
        assert.equal((await state(page, id)).expanded, 'false');
        await assertNoSideEffects(live);
        await press(page, 'Escape');
        await page.wait(`!document.querySelector('[role="dialog"]')`);
        assert.deepEqual(await page.evaluate('window.fixtureDialogChanges'), [false]);
        await assertNoSideEffects(live);
      }
    });
  }
}
