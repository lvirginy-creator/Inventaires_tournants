import { create } from "zustand";

export type SyncStatus = "idle" | "syncing" | "success" | "error";

interface SyncState {
  status: SyncStatus;
  pendingCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
  setStatus: (status: SyncStatus, error?: string) => void;
  setPendingCount: (n: number) => void;
  setLastSyncAt: (dt: string) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: "idle",
  pendingCount: 0,
  lastSyncAt: localStorage.getItem("lastSyncAt"),
  lastError: null,
  setStatus: (status, error) => set({ status, lastError: error ?? null }),
  setPendingCount: (n) => set({ pendingCount: n }),
  setLastSyncAt: (dt) => {
    localStorage.setItem("lastSyncAt", dt);
    set({ lastSyncAt: dt });
  },
}));
