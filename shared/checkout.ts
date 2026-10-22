import { z } from 'zod';
import { isKilogramUnit, isValidOrderQuantity } from './order-quantity';

export const createOrderSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().min(1),
  customerEmail: z.string().email().optional().or(z.literal('')),
  deliveryAddress: z.string().min(1),
  deliveryNotes: z.string().optional(),
  paymentMethod: z.enum(['yookassa', 'cash_on_delivery']),
  items: z.array(z.object({
    productId: z.string().min(1), productName: z.string(),
    quantity: z.number().finite().positive().max(100000),
    price: z.string(), unit: z.string(),
  })).min(1).max(200),
  amount: z.string(),
  promoCode: z.string().trim().max(100).optional(),
  discountPercent: z.number().finite().optional(),
  discount: z.string().optional(),
});
export type CheckoutInput = z.infer<typeof createOrderSchema>;
export interface CheckoutQuote {
  items: CheckoutInput['items'];
  subtotal: string;
  amount: string;
  discount: string;
  discountPercent: number;
  promoCode?: string;
  message?: string;
}
export class CheckoutError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}
export function moneyCents(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new CheckoutError('Некорректная цена товара');
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents > 9999999999) throw new CheckoutError('Сумма заказа слишком велика');
  return cents;
}
export function quoteItems(input: CheckoutInput['items'], catalogue: Array<{
  id: string; name: string; price: string; unit: string; isVisible: boolean; inStock: boolean;
}>): CheckoutQuote {
  const seen = new Set<string>();
  let subtotalCents = 0;
  const items = input.map(item => {
    const product = catalogue.find(p => p.id === item.productId);
    if (!product?.isVisible || !product.inStock) {
      throw new CheckoutError(`Товар «${item.productName}» недоступен. Вернитесь в корзину и удалите его.`);
    }
    if (seen.has(item.productId)) throw new CheckoutError('Товар повторяется в заказе');
    seen.add(item.productId);
    if (item.unit !== product.unit) throw new CheckoutError(`Единица продажи «${product.name}» изменилась. Обновите товар в корзине.`);
    if (!isValidOrderQuantity(item.quantity, product.unit) ||
      (!isKilogramUnit(product.unit) && !Number.isInteger(item.quantity))) {
      throw new CheckoutError(`Некорректное количество «${product.name}»`);
    }
    // Integer kopecks × integer grams, rounded once per order line.
    const milli = Math.round(item.quantity * 1000);
    const numerator = moneyCents(product.price) * milli;
    if (!Number.isSafeInteger(numerator)) throw new CheckoutError('Сумма заказа слишком велика');
    subtotalCents += Math.round(numerator / 1000);
    return { productId: product.id, productName: product.name, price: product.price,
      quantity: item.quantity, unit: product.unit };
  });
  if (subtotalCents > 9999999999) throw new CheckoutError('Сумма заказа слишком велика');
  const subtotal = (subtotalCents / 100).toFixed(2);
  return { items, subtotal, amount: subtotal, discount: '0.00', discountPercent: 0 };
}
export interface CheckoutPromo {
  userId: string; status: string; expiresAt: Date; discountPercent: number; minOrderAmount?: number;
}
export function promoError(promo: CheckoutPromo | undefined, owners: string[], subtotal: number, now = new Date()): string | null {
  if (!promo || !owners.includes(promo.userId)) return 'Промокод не найден для вашего аккаунта';
  if (promo.status !== 'sent') return 'Промокод недействителен или уже использован';
  if (promo.expiresAt <= now) return 'Срок действия промокода истёк';
  if (!Number.isInteger(promo.discountPercent) || promo.discountPercent <= 0 || promo.discountPercent > 100) return 'Промокод недействителен';
  if (subtotal < (promo.minOrderAmount ?? 0)) return `Минимальная сумма для промокода: ${promo.minOrderAmount} ₽`;
  return null;
}
export function applyQuoteDiscount(quote: CheckoutQuote, percent: number, code: string) {
  const cents = moneyCents(quote.subtotal);
  const discount = Math.round(cents * percent / 100);
  return { ...quote, discountPercent: percent, promoCode: code,
    discount: (discount / 100).toFixed(2), amount: ((cents - discount) / 100).toFixed(2) };
}
export function quoteChanged(input: CheckoutInput, quote: CheckoutQuote) {
  return input.items.some((item, i) => Number(item.price) !== Number(quote.items[i].price)) ||
    Number(input.amount) !== Number(quote.amount) ||
    Number(input.discount ?? 0) !== Number(quote.discount) ||
    (input.discountPercent ?? 0) !== quote.discountPercent ||
    !!quote.message;
}
