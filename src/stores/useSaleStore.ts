import { create } from 'zustand';
import { Sale } from '../domain/entities';
import { PizzaSize, PORTIONS_PER_SIZE } from '../domain/enums';

export interface CartItem {
  cartItemId: string;
  productId: string;
  productName: string;
  size: PizzaSize;
  quantity: number;
  portions: number;
  unitPrice: number;
  subtotal: number;
  customerNote: string;
}

interface SaleState {
  cart: CartItem[];
  cartPackagingSupplyId: string | undefined;
  sales: Sale[];
  pendingSales: Sale[];
  loading: boolean;
  submitting: boolean;
  lastSaleResult: { success: boolean; message: string } | null;

  addToCart: (item: Omit<CartItem, 'cartItemId' | 'portions' | 'subtotal' | 'customerNote'> & { customerNote?: string }) => void;
  removeFromCart: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  updateCustomerNote: (cartItemId: string, note: string) => void;
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
      // Individual portions are always added as separate line items
      // so each can have its own customer note
      const isIndividual = item.size === PizzaSize.INDIVIDUAL;

      if (!isIndividual) {
        const existing = state.cart.find(
          (c) => c.productId === item.productId && c.size === item.size,
        );

        if (existing) {
          return {
            cart: state.cart.map((c) =>
              c.productId === item.productId && c.size === item.size
                ? {
                    ...c,
                    quantity: c.quantity + item.quantity,
                    portions: PORTIONS_PER_SIZE[item.size] * (c.quantity + item.quantity),
                    subtotal: c.unitPrice * (c.quantity + item.quantity),
                  }
                : c,
            ),
          };
        }
      }

      const cartItemId = String(nextCartItemId++);
      const portions = PORTIONS_PER_SIZE[item.size] * item.quantity;
      const subtotal = item.unitPrice * item.quantity;

      return {
        cart: [...state.cart, { ...item, cartItemId, portions, subtotal, customerNote: item.customerNote ?? '' }],
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
                portions: PORTIONS_PER_SIZE[c.size] * quantity,
                subtotal: c.unitPrice * quantity,
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

  setCartPackaging: (packagingSupplyId) =>
    set({ cartPackagingSupplyId: packagingSupplyId }),

  clearCart: () => set({ cart: [], cartPackagingSupplyId: undefined }),

  setSales: (sales) => set({ sales }),
  setPendingSales: (pendingSales) => set({ pendingSales }),
  setLoading: (loading) => set({ loading }),
  setSubmitting: (submitting) => set({ submitting }),
  setLastSaleResult: (result) => set({ lastSaleResult: result }),
}));
