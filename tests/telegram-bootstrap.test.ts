import assert from 'node:assert/strict';
import { test } from 'node:test';
import { needsTelegramSdk } from '../client/src/lib/telegram-bootstrap';

test('all storefront routes skip Telegram, including copied launch parameters', () => {
  for (const pathname of ['/web', '/web/', '/web/admin', '/web/cheeses', '/web/product/cheese']) {
    assert.equal(needsTelegramSdk({ pathname, hash: '#tgWebAppData=private', search: '?tgWebAppVersion=8.0' }), false);
  }
});
test('normal website visits never load Telegram but Mini App launch parameters do', () => {
  for (const pathname of ['/', '/cart', '/product/test']) {
    assert.equal(needsTelegramSdk({ pathname, hash: '', search: '?utm_source=telegram' }), false);
    for (const key of ['tgWebAppData', 'tgWebAppVersion', 'tgWebAppPlatform']) {
      assert.equal(needsTelegramSdk({ pathname, hash: `#${key}=value`, search: '' }), true);
      assert.equal(needsTelegramSdk({ pathname, hash: '', search: `?${key}=value` }), true);
    }
  }
});
