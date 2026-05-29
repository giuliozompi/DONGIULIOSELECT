import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
}

function calcDerived(items: WebCartItem[]) {
  return {
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    subtotal: items.reduce((s, i) => s + parseFloat(i.price) * i.quantity, 0),
  };
}

export const useWebCart = create<WebCartState>()(
  persist(
    (set) => ({
      items: [],
      itemCount: 0,
      subtotal: 0,

      addItem: (item, qty = 1) =>
        set(state => {
          const existing = state.items.find(i => i.productId === item.productId);
          const items = existing
            ? state.items.map(i =>
                i.productId === item.productId
                  ? { ...i, quantity: i.quantity + qty }
                  : i
              )
            : [...state.items, { ...item, quantity: qty }];
          return { items, ...calcDerived(items) };
        }),

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
