import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { launchBrowser } from './helpers/browser.mjs';
import { renderOrderPrintDocument } from '../server/services/order-print-document.ts';

// No server, authentication, database or real orders are involved.
// Run: npm run test:order-print-pagination (Python dependencies: uv sync).
const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeee123456';
const money = cents => `${(cents / 100).toLocaleString('ru-RU', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
})} ₽`;
function fixture(count, longNames = false) {
  const items = Array.from({ length: count }, (_, i) => ({
    productId: `synthetic-${i}`,
    productName: `ROW${String(i + 1).padStart(3, '0')} Сыр итальянский ${
      longNames ? 'выдержанный из молока небольшого хозяйства с подробным описанием происхождения и условий созревания '.repeat(2) : 'Пармиджано Реджано'
    } END${String(i + 1).padStart(3, '0')}`,
    quantity: i % 2 ? 2 : 0.735,
    unit: i % 2 ? 'шт' : 'кг',
    price: i % 2 ? '200.00' : '1200.00',
  }));
  const subtotal = items.reduce((sum, item) => sum + Math.round(Number(item.price) * 100 * item.quantity), 0);
  return {
    id, customerName: 'Синтетический покупатель', customerPhone: 'fixture-phone',
    customerEmail: 'fixture@example.invalid', createdAt: new Date('2026-10-22T10:00:00Z'),
    deliveryAddress: 'Тестовый адрес, не предназначен для отправки',
    deliveryMethod: 'cdek', status: 'СОБРАН', paymentMethod: 'cash_on_delivery',
    customerPaysShipping: true, deliveryCost: '250.00', refundedAmount: '25.00',
    amount: ((subtotal - 13200) / 100).toFixed(2), items,
  };
}

test('Chromium A4 PDFs preserve long orders, repeated headers, QR and indivisible totals', { timeout: 180000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'order-print-pagination-'));
  const browser = await launchBrowser();
  try {
    // Sweep consecutive counts to exercise totals just before/after page breaks,
    // in addition to multi-page short and very long product descriptions.
    for (const [count, longNames] of [[65, false], [90, true], ...Array.from({ length: 10 }, (_, i) => [18 + i, false])]) {
      await t.test(`${count} products${longNames ? ', long descriptions' : ''}`, async () => {
        const order = fixture(count, longNames);
        const stem = join(dir, `order-${count}-${longNames}`);
        const html = await renderOrderPrintDocument(order, 'order-summary');
        const page = await browser.newPage();
        try {
          const { frameTree } = await page.send('Page.getFrameTree');
          await page.send('Page.setDocumentContent', { frameId: frameTree.frame.id, html });
          await page.evaluate('document.fonts.ready.then(() => true)');
          await page.send('Emulation.setEmulatedMedia', { media: 'print' });
          // Independent expectations: a missing HTML totals section must fail too.
          const total = Math.round(Number(order.amount) * 100);
          const totals = [
            `Стоимость товаров до скидок${money(total + 13200)}`,
            `Скидки, бонусы и корректировки−${money(13200)}`,
            `Итого по заказу${money(total)}`,
            `Доставка (оплачивается отдельно)${money(25000)}`,
            `Общая стоимость с доставкой${money(total + 25000)}`,
            'Доставка не включена в сумму оплаты товаров по заказу.',
            `Возвращено${money(2500)}`,
          ];
          const { data } = await page.send('Page.printToPDF', {
            preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false,
          });
          await writeFile(`${stem}.pdf`, Buffer.from(data, 'base64'));
          await writeFile(`${stem}.json`, JSON.stringify({ id, items: order.items, totals }));
          const report = JSON.parse(execFileSync(process.env.PYTHON || 'python', [
            'tests/helpers/check-order-print-pdf.py', `${stem}.pdf`, `${stem}.json`,
          ], { encoding: 'utf8' }));
          assert.ok(report.pages >= 2, 'fixture must actually paginate');
          assert.equal(report.rows, count);
          t.diagnostic(JSON.stringify(report));
        } finally {
          await page.close();
        }
      });
    }
  } finally {
    await browser.close();
    // Set KEEP_PRINT_PDFS=1 for manual visual inspection; all output stays in /tmp.
    if (process.env.KEEP_PRINT_PDFS) t.diagnostic(`PDFs and rendered pages: ${dir}`);
    else await rm(dir, { recursive: true, force: true });
  }
});
