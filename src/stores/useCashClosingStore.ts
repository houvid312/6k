import { create } from 'zustand';
import { DenominationCount } from '../domain/entities';

interface CashClosingState {
  denominations: DenominationCount;
  bankTotal: number;
  expenses: number;
  cashBase: number;

  setDenomination: (key: keyof DenominationCount, count: number) => void;
  setBankTotal: (amount: number) => void;
  setExpenses: (amount: number) => void;
  setCashBase: (amount: number) => void;
  reset: () => void;

  getTotal: () => number;
}

const initialDenominations: DenominationCount = {
  bills100k: 0,
  bills50k: 0,
  bills20k: 0,
  bills10k: 0,
  bills5k: 0,
  bills2k: 0,
  coins: 0,
};

export const useCashClosingStore = create<CashClosingState>((set, get) => ({
  denominations: { ...initialDenominations },
  bankTotal: 0,
  expenses: 0,
  cashBase: 0,

  setDenomination: (key: keyof DenominationCount, count: number) =>
    set((state) => ({
      denominations: {
        ...state.denominations,
        [key]: count,
      },
    })),

  setBankTotal: (amount: number) => set({ bankTotal: amount }),

  setExpenses: (amount: number) => set({ expenses: amount }),

  setCashBase: (amount: number) => set({ cashBase: amount }),

  reset: () =>
    set({
      denominations: { ...initialDenominations },
      bankTotal: 0,
      expenses: 0,
      cashBase: 0,
    }),

  getTotal: () => {
    const state = get();
    const { denominations } = state;
    const cashTotal =
      denominations.bills100k * 100000 +
      denominations.bills50k * 50000 +
      denominations.bills20k * 20000 +
      denominations.bills10k * 10000 +
      denominations.bills5k * 5000 +
      denominations.bills2k * 2000 +
      denominations.coins * 1;
    return cashTotal + state.bankTotal;
  },
}));
