import { isValidOrderQuantity } from './order-quantity';

export interface ReorderCartItem {
  productId: string;
  productName: string;
  price: string;
  unit: string;
  quantity: number;
  image?: string;
}

export type ReorderSkipReason = 'removed' | 'unavailable' | 'unit_changed' | 'invalid_quantity' | 'invalid_price' | 'cart_conflict';
export interface ReorderSkippedItem {
  productId: string;
  productName: string;
  reason: ReorderSkipReason;
}
export interface ReorderPreview {
  items: (ReorderCartItem & { priceChanged: boolean })[];
  skipped: ReorderSkippedItem[];
}
export interface ReorderCatalogProduct {
  id: string;
  name: string;
  price: string;
  unit: string;
  images: string[] | null;
  isVisible: boolean;
  inStock: boolean;
}

function unitKey(unit: string) {
  const key = unit.trim().toLowerCase().replace(/\.$/, '');
  if (['kg', 'кг'].includes(key)) return 'kg';
  if (['g', 'г'].includes(key)) return 'g';
  if (['шт', 'pcs', 'pc'].includes(key)) return 'piece';
  return key;
}

/** Keep the physical amount when the catalogue changes between grams and kg. */
export function convertReorderQuantity(quantity: number, from: string, to: string): number | null {
  if (!isValidOrderQuantity(quantity, from)) return null;
  const source = unitKey(from);
  const target = unitKey(to);
  if (!source || !target) return null;
  let converted = quantity;
  if (source !== target) {
    if (source === 'kg' && target === 'g') converted *= 1000;
    else if (source === 'g' && target === 'kg') converted /= 1000;
    else return null;
  }
  converted = Math.round(converted * 1e9) / 1e9;
  return isValidOrderQuantity(converted, to) ? converted : null;
}

function sourceItems(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Invalid order items');
  return value.map(item => item && typeof item === 'object' ? item : {});
}

export function getReorderProductIds(value: unknown): string[] {
  return Array.from(new Set(sourceItems(value)
    .map(item => item.productId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)));
}

function validPrice(price: string) {
  return price.trim().length > 0 && Number.isFinite(Number(price)) && Number(price) >= 0;
}

export function buildReorderPreview(value: unknown, catalogue: ReorderCatalogProduct[]): ReorderPreview {
  const byId = new Map(catalogue.map(product => [product.id, product]));
  const result: ReorderPreview = { items: [], skipped: [] };
  for (const source of sourceItems(value)) {
    const productId = typeof source.productId === 'string' ? source.productId : '';
    const productName = typeof source.productName === 'string' ? source.productName : 'Товар из заказа';
    const skip = (reason: ReorderSkipReason) => result.skipped.push({ productId, productName, reason });
    const product = byId.get(productId);
    if (!product || !product.isVisible) { skip('removed'); continue; }
    if (!product.inStock) { skip('unavailable'); continue; }
    if (!validPrice(product.price)) { skip('invalid_price'); continue; }
    if (typeof source.unit !== 'string' ||
      !['string', 'number'].includes(typeof source.quantity) ||
      !isValidOrderQuantity(Number(source.quantity), source.unit)) {
      skip('invalid_quantity'); continue;
    }
    const quantity = convertReorderQuantity(Number(source.quantity), source.unit, product.unit);
    if (quantity === null) { skip('unit_changed'); continue; }
    result.items.push({
      productId: product.id, productName: product.name, price: product.price,
      unit: product.unit, quantity, image: product.images?.[0],
      priceChanged: Number(source.price) !== Number(product.price),
    });
  }
  return result;
}

/** Atomic merge: preserve unrelated items and refresh the price of matching ones. */
export function mergeReorderCart(existing: ReorderCartItem[], incoming: ReorderCartItem[]) {
  const items = existing.map(item => ({ ...item }));
  const skipped: ReorderSkippedItem[] = [];
  const added = new Set<string>();
  for (const item of incoming) {
    const skip = (reason: ReorderSkipReason) => skipped.push({
      productId: item.productId, productName: item.productName, reason,
    });
    if (!validPrice(item.price)) { skip('invalid_price'); continue; }
    if (!isValidOrderQuantity(item.quantity, item.unit)) { skip('invalid_quantity'); continue; }
    const index = items.findIndex(current => current.productId === item.productId);
    if (index < 0) items.push({ ...item });
    else {
      const previous = convertReorderQuantity(items[index].quantity, items[index].unit, item.unit);
      if (previous === null) { skip('cart_conflict'); continue; }
      const quantity = Math.round((previous + item.quantity) * 1e9) / 1e9;
      if (!isValidOrderQuantity(quantity, item.unit)) { skip('cart_conflict'); continue; }
      items[index] = { ...items[index], ...item, quantity };
    }
    added.add(item.productId);
  }
  return { items, addedCount: added.size, skipped };
}
