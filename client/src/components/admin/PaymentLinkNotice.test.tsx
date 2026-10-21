import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PaymentLinkNotice } from './PaymentLinkNotice';
import { summarizePaymentDelivery } from '@shared/payment-link-delivery';

test('admin notice exposes Telegram rejection and distinguishes accepted email from delivery', () => {
  const paymentDelivery = summarizePaymentDelivery([
    { channel: 'telegram', status: 'failed', detail: 'Telegram: Bad Request: chat not found' },
    { channel: 'email', status: 'sent', detail: 'Доставка клиенту не подтверждена.' },
    { channel: 'whatsapp', status: 'skipped', detail: 'Канал отключён.' },
  ]);
  const html = renderToStaticMarkup(<PaymentLinkNotice notice={{ paymentDelivery, warning: paymentDelivery.warning }} />);
  assert.match(html, /chat not found/);
  assert.match(html, /Принято сервисом/);
  assert.match(html, /Доставка клиенту не подтверждена/);
  assert.match(html, /Не отправлялось/);
  assert.match(html, /role="alert"/);
});

test('creation errors remain visible even without channel outcomes', () => {
  const html = renderToStaticMarkup(<PaymentLinkNotice notice={{ warning: 'Не удалось создать ссылку', error: 'Проверьте журнал сервера' }} />);
  assert.match(html, /Не удалось создать ссылку/);
  assert.match(html, /Проверьте журнал сервера/);
});

test('unrelated order updates show no payment notice', () => {
  assert.equal(renderToStaticMarkup(<PaymentLinkNotice notice={{}} />), '');
});
