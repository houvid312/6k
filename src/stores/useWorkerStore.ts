import { create } from 'zustand';
import { Worker, Schedule, Attendance } from '../domain/entities';
import { container } from '../di/container';

interface WorkerState {
  workers: Worker[];
  schedules: Schedule[];
  attendance: Attendance[];
  loading: boolean;

  loadWorkers: () => Promise<void>;
  loadSchedules: (storeId: string) => Promise<void>;
  loadAttendance: (storeId: string, date: string) => Promise<void>;
}

export const useWorkerStore = create<WorkerState>((set) => ({
  workers: [],
  schedules: [],
  attendance: [],
  loading: false,

  loadWorkers: async () => {
    set({ loading: true });
    try {
      const workers = await container.workerRepo.getAll();
      set({ workers });
    } finally {
      set({ loading: false });
    }
  },

  loadSchedules: async (storeId: string) => {
    set({ loading: true });
    try {
      const schedules = await container.scheduleRepo.getByStore(storeId);
      set({ schedules });
    } finally {
      set({ loading: false });
    }
  },

  loadAttendance: async (storeId: string, date: string) => {
    set({ loading: true });
    try {
      const attendance = await container.attendanceRepo.getByDate(storeId, date);
      set({ attendance });
    } finally {
      set({ loading: false });
    }
  },
}));
