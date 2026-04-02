import { create } from 'zustand';
import { CreditEntry } from '../domain/entities';
import { container } from '../di/container';

interface CreditState {
  credits: CreditEntry[];
  loading: boolean;
  loadCredits: () => Promise<void>;
  loadCreditsByWorker: (workerId: string) => Promise<void>;
}

export const useCreditStore = create<CreditState>((set) => ({
  credits: [],
  loading: false,

  loadCredits: async () => {
    set({ loading: true });
    try {
      const credits = await container.creditRepo.getAll();
      set({ credits });
    } finally {
      set({ loading: false });
    }
  },

  loadCreditsByWorker: async (workerId: string) => {
    set({ loading: true });
    try {
      const credits = await container.creditRepo.getActiveByWorker(workerId);
      set({ credits });
    } finally {
      set({ loading: false });
    }
  },
}));
