import { create } from 'zustand';
import { Sale } from '../domain/entities';

export interface CartItemAddition {
  additionCatalogId: string;
  supplyId: string;
  name: string;
  price: number;
  grams: number;
  quantity: number;
}

export interface CartItem {
  cartItemId: string;
  productId: string;
  productName: string;
  formatId: string;
  formatName: string;
  portionsPerUnit: number;
  quantity: number;
  portions: number;
  unitPrice: number;
  subtotal: number;
  customerNote: string;
  additions: CartItemAddition[];
  additionsTotal: number;
}

interface SaleState {
  cart: CartItem[];
  cartPackagingSupplyId: string | undefined;
  sales: Sale[];
  pendingSales: Sale[];
  loading: boolean;
  submitting: boolean;
  lastSaleResult: { success: boolean; message: string } | null;

  addToCart: (item: Omit<CartItem, 'cartItemId' | 'portions' | 'subtotal' | 'customerNote' | 'additions' | 'additionsTotal'> & { customerNote?: string; additions?: CartItemAddition[] }) => void;
  removeFromCart: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  updateCustomerNote: (cartItemId: string, note: string) => void;
  addAdditionToCartItem: (cartItemId: string, addition: CartItemAddition) => void;
  removeAdditionFromCartItem: (cartItemId: string, additionCatalogId: string) => void;
  setCartPackaging: (packagingSupplyId: string | undefined) => void;
  clearCart: () => void;

  setSales: (sales: Sale[]) => void;
  setPendingSales: (sales: Sale[]) => void;
  setLoading: (loading: boolean) => void;
  setSubmitting: (submitting: boolean) => void;
  setLastSaleResult: (result: { success: boolean; message: string } | null) => void;
}

let nextCartItemId = 1;

export const useSaleStore = create<SaleState>((set) => ({
  cart: [],
  cartPackagingSupplyId: undefined,
  sales: [],
  pendingSales: [],
  loading: false,
  submitting: false,
  lastSaleResult: null,

  addToCart: (item) =>
    set((state) => {
      const additions = item.additions ?? [];
      const additionsTotal = additions.reduce((s, a) => s + a.price * a.quantity, 0);
      // Single-portion formats or items with additions get individual line items
      const isSinglePortion = item.portionsPerUnit === 1;
      const hasAdditions = additions.length > 0;

      if (!isSinglePortion && !hasAdditions) {
        const existing = state.cart.find(
          (c) => c.productId === item.productId && c.formatId === item.formatId && c.additions.length === 0,
        );

        if (existing) {
          return {
            cart: state.cart.map((c) =>
              c.productId === item.productId && c.formatId === item.formatId && c.additions.length === 0
                ? {
                    ...c,
                    quantity: c.quantity + item.quantity,
                    portions: c.portionsPerUnit * (c.quantity + item.quantity),
                    subtotal: c.unitPrice * (c.quantity + item.quantity) + c.additionsTotal,
                  }
                : c,
            ),
          };
        }
      }

      const cartItemId = String(nextCartItemId++);
      const portions = item.portionsPerUnit * item.quantity;
      const subtotal = item.unitPrice * item.quantity + additionsTotal;

      return {
        cart: [...state.cart, { ...item, cartItemId, portions, subtotal, customerNote: item.customerNote ?? '', additions, additionsTotal }],
      };
    }),

  removeFromCart: (cartItemId) =>
    set((state) => ({
      cart: state.cart.filter((c) => c.cartItemId !== cartItemId),
    })),

  updateQuantity: (cartItemId, quantity) =>
    set((state) => {
      if (quantity <= 0) {
        return {
          cart: state.cart.filter((c) => c.cartItemId !== cartItemId),
        };
      }
      return {
        cart: state.cart.map((c) =>
          c.cartItemId === cartItemId
            ? {
                ...c,
                quantity,
                portions: c.portionsPerUnit * quantity,
                subtotal: c.unitPrice * quantity + c.additionsTotal,
              }
            : c,
        ),
      };
    }),

  updateCustomerNote: (cartItemId, note) =>
    set((state) => ({
      cart: state.cart.map((c) =>
        c.cartItemId === cartItemId
          ? { ...c, customerNote: note }
          : c,
      ),
    })),

  addAdditionToCartItem: (cartItemId, addition) =>
    set((state) => ({
      cart: state.cart.map((c) => {
        if (c.cartItemId !== cartItemId) return c;
        const existing = c.additions.find((a) => a.additionCatalogId === addition.additionCatalogId);
        const additions = existing
          ? c.additions.map((a) => a.additionCatalogId === addition.additionCatalogId ? { ...a, quantity: a.quantity + addition.quantity } : a)
          : [...c.additions, addition];
        const additionsTotal = additions.reduce((s, a) => s + a.price * a.quantity, 0);
        return { ...c, additions, additionsTotal, subtotal: c.unitPrice * c.quantity + additionsTotal };
      }),
    })),

  removeAdditionFromCartItem: (cartItemId, additionCatalogId) =>
    set((state) => ({
      cart: state.cart.map((c) => {
        if (c.cartItemId !== cartItemId) return c;
        const additions = c.additions.filter((a) => a.additionCatalogId !== additionCatalogId);
        const additionsTotal = additions.reduce((s, a) => s + a.price * a.quantity, 0);
        return { ...c, additions, additionsTotal, subtotal: c.unitPrice * c.quantity + additionsTotal };
      }),
    })),

  setCartPackaging: (packagingSupplyId) =>
    set({ cartPackagingSupplyId: packagingSupplyId }),

  clearCart: () => set({ cart: [], cartPackagingSupplyId: undefined }),

  setSales: (sales) => set({ sales }),
  setPendingSales: (pendingSales) => set({ pendingSales }),
  setLoading: (loading) => set({ loading }),
  setSubmitting: (submitting) => set({ submitting }),
  setLastSaleResult: (result) => set({ lastSaleResult: result }),
}));
