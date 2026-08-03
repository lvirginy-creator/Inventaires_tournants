import { create } from "zustand";

export type SyncStatus = "idle" | "syncing" | "success" | "error";

interface SyncState {
  status: SyncStatus;
  pendingCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
  nextRetryAt: number | null;
  consecutiveFailures: number;
  setStatus: (status: SyncStatus, error?: string) => void;
  setPendingCount: (n: number) => void;
  setLastSyncAt: (dt: string) => void;
  setRetryState: (nextRetryAt: number | null, consecutiveFailures: number) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: "idle",
  pendingCount: 0,
  // Seed depuis localStorage pour compatibilité — migré vers Dexie meta au 1er lancement du SyncManager
  lastSyncAt: localStorage.getItem("lastSyncAt"),
  lastError: null,
  nextRetryAt: null,
  consecutiveFailures: 0,
  setStatus: (status, error) => set({ status, lastError: error ?? null }),
  setPendingCount: (n) => set({ pendingCount: n }),
  setLastSyncAt: (dt) => set({ lastSyncAt: dt }),
  setRetryState: (nextRetryAt, consecutiveFailures) => set({ nextRetryAt, consecutiveFailures }),
}));
