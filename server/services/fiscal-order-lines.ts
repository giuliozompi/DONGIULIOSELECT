import { moneyCents } from '../../shared/checkout';
import type { YooKassaReceiptItem } from './yookassa-payment';

const asMoney = (cents: number) => (cents / 100).toFixed(2);

/** YooKassa sums rounded unit-price × quantity for each fiscal line. */
export function fiscalOrderLines(items: YooKassaReceiptItem[], total: string, deliveryFee?: string | null, vatCode = 1) {
  const fee = moneyCents(deliveryFee ?? '0');
  const goods = moneyCents(total) - fee;
  const milli = items.map(item => Math.round(Number(item.quantity) * 1000));
  const weights = items.map((item, i) => BigInt(Math.round(moneyCents(item.amount.value) * milli[i] / 1000)));
  const subtotal = weights.reduce((sum, weight) => sum + weight, BigInt(0));
  if (goods < 0 || (!subtotal && goods > 0)) throw new Error('Невозможно сверить товары и сумму чека.');
  const result: YooKassaReceiptItem[] = [];
  let consumed = BigInt(0);
  let allocated = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    consumed += weights[i];
    const cumulative = subtotal ? Number((BigInt(goods) * consumed + subtotal / BigInt(2)) / subtotal) : 0;
    const cents = cumulative - allocated;
    allocated = cumulative;
    if (cents === 0) continue; // YooKassa requires positive receipt lines.
    const append = (qty: number, rate: number) => {
      if (qty > 0 && Math.round(qty * rate / 1000) > 0) {
        result.push({ ...item, quantity: (qty / 1000).toFixed(3), amount: { value: asMoney(rate), currency: 'RUB' } });
      }
    };
    const quantity = milli[i];
    const rate = Math.round(cents * 1000 / quantity);
    if (Math.round(quantity * rate / 1000) === cents) {
      append(quantity, rate);
    } else if (item.mark_code_info || quantity <= 1000) {
      throw new Error('Не удалось распределить скидку для кассового чека.');
    } else if (quantity % 1000 === 0) {
      const units = quantity / 1000;
      const low = Math.floor(cents / units);
      const remainder = cents % units;
      append((units - remainder) * 1000, low);
      append(remainder * 1000, low + 1);
    } else {
      // Reserve one kg for the rounding remainder; do not round the weight.
      const low = Math.floor(cents * 1000 / quantity);
      const baseQty = quantity - 1000;
      append(baseQty, low);
      append(1000, cents - Math.round(baseQty * low / 1000));
    }
  }
  if (fee > 0) result.push({
    description: 'Курьерская доставка', quantity: '1.000', amount: { value: asMoney(fee), currency: 'RUB' },
    vat_code: vatCode, payment_subject: 'service', payment_mode: 'full_payment',
  });
  const sum = result.reduce((cents, item) => cents + Math.round(moneyCents(item.amount.value) * Number(item.quantity)), 0);
  if (!result.length || sum !== moneyCents(total)) throw new Error('Сумма кассового чека не совпадает с суммой заказа.');
  return result;
}
