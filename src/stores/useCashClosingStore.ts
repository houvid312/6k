import { create } from 'zustand';
import { DenominationCount } from '../domain/entities';

interface CashClosingState {
  currentStoreId: string | null;
  drafts: Record<string, {
    denominations: DenominationCount;
    bankTotal: number;
    expenses: number;
    cashBase: number;
  }>;

  denominations: DenominationCount;
  bankTotal: number;
  expenses: number;
  cashBase: number;

  setCurrentStore: (storeId: string) => void;
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
  currentStoreId: null,
  drafts: {},

  denominations: { ...initialDenominations },
  bankTotal: 0,
  expenses: 0,
  cashBase: 0,

  setCurrentStore: (storeId: string) => {
    const state = get();
    const currentId = state.currentStoreId;
    
    // Guardar los valores actuales en drafts bajo el store ID viejo antes de cambiar
    const drafts = { ...state.drafts };
    if (currentId) {
      drafts[currentId] = {
        denominations: state.denominations,
        bankTotal: state.bankTotal,
        expenses: state.expenses,
        cashBase: state.cashBase,
      };
    }

    // Cargar los valores del nuevo store ID (o inicializar si no existen)
    const nextDraft = drafts[storeId] || {
      denominations: { ...initialDenominations },
      bankTotal: 0,
      expenses: 0,
      cashBase: 0,
    };

    set({
      currentStoreId: storeId,
      drafts,
      denominations: nextDraft.denominations,
      bankTotal: nextDraft.bankTotal,
      expenses: nextDraft.expenses,
      cashBase: nextDraft.cashBase,
    });
  },

  setDenomination: (key: keyof DenominationCount, count: number) =>
    set((state) => {
      const nextDenominations = {
        ...state.denominations,
        [key]: count,
      };
      
      const drafts = { ...state.drafts };
      if (state.currentStoreId) {
        drafts[state.currentStoreId] = {
          ...drafts[state.currentStoreId],
          denominations: nextDenominations,
        };
      }

      return {
        denominations: nextDenominations,
        drafts,
      };
    }),

  setBankTotal: (amount: number) =>
    set((state) => {
      const drafts = { ...state.drafts };
      if (state.currentStoreId) {
        drafts[state.currentStoreId] = {
          ...drafts[state.currentStoreId],
          bankTotal: amount,
        };
      }
      return { bankTotal: amount, drafts };
    }),

  setExpenses: (amount: number) =>
    set((state) => {
      const drafts = { ...state.drafts };
      if (state.currentStoreId) {
        drafts[state.currentStoreId] = {
          ...drafts[state.currentStoreId],
          expenses: amount,
        };
      }
      return { expenses: amount, drafts };
    }),

  setCashBase: (amount: number) =>
    set((state) => {
      const drafts = { ...state.drafts };
      if (state.currentStoreId) {
        drafts[state.currentStoreId] = {
          ...drafts[state.currentStoreId],
          cashBase: amount,
        };
      }
      return { cashBase: amount, drafts };
    }),

  reset: () =>
    set((state) => {
      const drafts = { ...state.drafts };
      if (state.currentStoreId) {
        drafts[state.currentStoreId] = {
          denominations: { ...initialDenominations },
          bankTotal: 0,
          expenses: 0,
          cashBase: 0,
        };
      }
      return {
        denominations: { ...initialDenominations },
        bankTotal: 0,
        expenses: 0,
        cashBase: 0,
        drafts,
      };
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
