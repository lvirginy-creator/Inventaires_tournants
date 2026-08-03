import { getMetaValue, setMetaValue } from "@/db/schema";
import { runSync } from "@/db/sync";
import { useSyncStore } from "@/store/sync";
import { useAuthStore } from "@/store/auth";

const BACKOFF_DELAYS = [5_000, 15_000, 45_000, 120_000, 300_000];
const SYNC_INTERVAL_MS = 3 * 60 * 1000;

class SyncManager {
  private static instance: SyncManager | null = null;

  private initialized = false;
  private running = false;
  private pendingTrigger = false;
  private backoffIndex = 0;
  private retryTimeout: ReturnType<typeof setTimeout> | null = null;

  static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // Migration lastSyncAt : localStorage → Dexie meta (une seule fois)
    const existingMeta = await getMetaValue("lastSyncAt");
    if (!existingMeta) {
      const fromLS = localStorage.getItem("lastSyncAt");
      if (fromLS) {
        await setMetaValue("lastSyncAt", fromLS);
        localStorage.removeItem("lastSyncAt");
        useSyncStore.getState().setLastSyncAt(fromLS);
      }
    } else {
      useSyncStore.getState().setLastSyncAt(existingMeta);
    }

    window.addEventListener("online", () => this.trigger());
    setInterval(() => this.trigger(), SYNC_INTERVAL_MS);
    this.trigger();
  }

  trigger(): void {
    if (!navigator.onLine) return;
    if (useAuthStore.getState().offlineSession) return;
    if (this.running) {
      this.pendingTrigger = true;
      return;
    }
    this.cancelRetry();
    this.running = true;
    this.doSync().finally(() => {
      this.running = false;
      if (this.pendingTrigger) {
        this.pendingTrigger = false;
        this.trigger();
      }
    });
  }

  private async doSync(): Promise<void> {
    const store = useSyncStore.getState();
    store.setStatus("syncing");

    try {
      const lastSyncAt = (await getMetaValue("lastSyncAt")) ?? null;
      const result = await runSync(lastSyncAt);

      if (result.authRequired) {
        // L'intercepteur axios a déjà déclenché logout → redirect automatique via RequireAuth
        store.setStatus("error", "Reconnexion requise");
        return;
      }

      if (result.errors.length > 0) {
        store.setStatus("error", result.errors.join(" | "));
        if (result.retryable) {
          this.scheduleRetry();
        }
        return;
      }

      if (result.newLastSyncAt) {
        await setMetaValue("lastSyncAt", result.newLastSyncAt);
        store.setLastSyncAt(result.newLastSyncAt);
      }
      store.setStatus("success");
      this.backoffIndex = 0;
      store.setRetryState(null, 0);
    } catch {
      store.setStatus("error", "Erreur inattendue");
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    const delay = BACKOFF_DELAYS[Math.min(this.backoffIndex, BACKOFF_DELAYS.length - 1)];
    this.backoffIndex = Math.min(this.backoffIndex + 1, BACKOFF_DELAYS.length - 1);
    const nextRetryAt = Date.now() + delay;
    useSyncStore.getState().setRetryState(nextRetryAt, this.backoffIndex);
    this.retryTimeout = setTimeout(() => this.trigger(), delay);
  }

  private cancelRetry(): void {
    if (this.retryTimeout !== null) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
  }
}

export default SyncManager;
