import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { mergeReorderCart } from '@shared/reorder';
import type { ReorderSkippedItem } from '@shared/reorder';
import { getCartAddQuantity, isKilogramUnit } from '@shared/order-quantity';

export interface WebCartItem {
  productId: string;
  productName: string;
  price: string;
  unit: string;
  quantity: number;
  image?: string;
}

interface WebCartState {
  items: WebCartItem[];
  itemCount: number;
  subtotal: number;
  addItem: (item: Omit<WebCartItem, 'quantity'>, qty?: number) => void;
  addReorderItems: (items: WebCartItem[]) => { addedCount: number; skipped: ReorderSkippedItem[] };
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
}

function calcDerived(items: WebCartItem[]) {
  return {
    itemCount: items.length,
    subtotal: items.reduce((s, i) => s + parseFloat(i.price) * i.quantity, 0),
  };
}

export const useWebCart = create<WebCartState>()(
  persist(
    (set) => ({
      items: [],
      itemCount: 0,
      subtotal: 0,

      addItem: (item, qty) =>
        set(state => {
          const existing = state.items.find(i => i.productId === item.productId);
          const increment = qty ?? getCartAddQuantity(existing?.unit ?? item.unit, existing?.quantity);
          const quantity = (existing?.quantity ?? 0) + increment;
          const nextQuantity = isKilogramUnit(existing?.unit ?? item.unit)
            ? Math.round(quantity * 1000) / 1000
            : quantity;
          const items = existing
            ? state.items.map(i =>
                i.productId === item.productId
                  ? { ...i, quantity: nextQuantity }
                  : i
              )
            : [...state.items, { ...item, quantity: nextQuantity }];
          return { items, ...calcDerived(items) };
        }),

      addReorderItems: incoming => {
        let result = { addedCount: 0, skipped: [] as ReorderSkippedItem[] };
        set(state => {
          const merged = mergeReorderCart(state.items, incoming);
          result = { addedCount: merged.addedCount, skipped: merged.skipped };
          return { items: merged.items, ...calcDerived(merged.items) };
        });
        return result;
      },

      removeItem: (productId) =>
        set(state => {
          const items = state.items.filter(i => i.productId !== productId);
          return { items, ...calcDerived(items) };
        }),

      updateQuantity: (productId, quantity) =>
        set(state => {
          const items = quantity <= 0
            ? state.items.filter(i => i.productId !== productId)
            : state.items.map(i => i.productId === productId ? { ...i, quantity } : i);
          return { items, ...calcDerived(items) };
        }),

      clearCart: () => set({ items: [], itemCount: 0, subtotal: 0 }),
    }),
    { name: 'dgs-web-cart' }
  )
);
