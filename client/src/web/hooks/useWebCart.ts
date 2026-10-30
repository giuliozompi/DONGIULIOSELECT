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

export interface ReorderSource {
  owner: string;
  orderId: string;
  confirmed?: boolean;
}

interface WebCartState {
  items: WebCartItem[];
  itemCount: number;
  subtotal: number;
  repeatedOrders: Record<string, string[]>;
  addItem: (item: Omit<WebCartItem, 'quantity'>, qty?: number) => void;
  addReorderItems: (items: WebCartItem[], source?: ReorderSource) =>
    { addedCount: number; skipped: ReorderSkippedItem[]; confirmationRequired?: boolean };
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

const CART_STORAGE_KEY = 'dgs-web-cart';

export const useWebCart = create<WebCartState>()(
  persist(
    (_persistSet, _get, api) => {
      // localStorage hydration is synchronous. Read the latest saved cart even
      // if this tab has not processed the other tab's storage event yet.
      // Wrap the public setter too: editorial purchases use functional setState
      // to refresh a product's price before adding it after an API response.
      const write = api.setState;
      api.setState = ((...args: Parameters<typeof write>) => {
        useWebCart.persist.rehydrate();
        return write(...args);
      }) as typeof write;
      const set = (update: Partial<WebCartState> | ((state: WebCartState) => Partial<WebCartState>)) =>
        api.setState(update);
      return {
      items: [],
      itemCount: 0,
      subtotal: 0,
      repeatedOrders: {},

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

      addReorderItems: (incoming, source) => {
        let result: { addedCount: number; skipped: ReorderSkippedItem[]; confirmationRequired?: boolean } =
          { addedCount: 0, skipped: [] };
        set(state => {
          const history = state.items.length ? state.repeatedOrders : {};
          if (source && history[source.owner]?.includes(source.orderId) && !source.confirmed) {
            result = { addedCount: 0, skipped: [], confirmationRequired: true };
            return state;
          }
          const merged = mergeReorderCart(state.items, incoming);
          result = { addedCount: merged.addedCount, skipped: merged.skipped };
          const repeatedOrders = source && merged.addedCount > 0
            ? { ...history, [source.owner]: Array.from(new Set([...(history[source.owner] || []), source.orderId])) }
            : history;
          return { items: merged.items, ...calcDerived(merged.items), repeatedOrders };
        });
        return result;
      },

      removeItem: (productId) =>
        set(state => {
          const items = state.items.filter(i => i.productId !== productId);
          return { items, ...calcDerived(items), ...(items.length ? {} : { repeatedOrders: {} }) };
        }),

      updateQuantity: (productId, quantity) =>
        set(state => {
          const items = quantity <= 0
            ? state.items.filter(i => i.productId !== productId)
            : state.items.map(i => i.productId === productId ? { ...i, quantity } : i);
          return { items, ...calcDerived(items), ...(items.length ? {} : { repeatedOrders: {} }) };
        }),

      clearCart: () => set({ items: [], itemCount: 0, subtotal: 0, repeatedOrders: {} }),
      };
    },
    {
      name: CART_STORAGE_KEY,
      merge: (persisted, current) => {
        const saved = persisted as Partial<WebCartState> | undefined;
        const items = saved?.items ?? [];
        return {
          ...current,
          items,
          ...calcDerived(items),
          repeatedOrders: items.length ? saved?.repeatedOrders ?? {} : {},
        };
      },
    }
  )
);

if (typeof window !== 'undefined' && window.addEventListener) {
  // Re-read storage, not event.newValue: an older queued event must never
  // roll back a newer edit. Rehydration does not write or echo storage events.
  const refresh = () => { useWebCart.persist.rehydrate(); };
  const onStorage = (event: StorageEvent) => {
    if (event.storageArea === window.localStorage &&
        (event.key === CART_STORAGE_KEY || event.key === null)) refresh();
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') refresh();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', onVisible);
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }
}
