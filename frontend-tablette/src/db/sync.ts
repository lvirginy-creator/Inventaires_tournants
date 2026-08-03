import api from "@/api/client";
import {
  clearDeletion,
  db,
  getPendingComptages,
  getPendingDeletions,
  markComptagesSynced,
  saveCampagne,
} from "@/db/schema";
import type { CampagneLocal } from "@/types";

interface BatchItemResult {
  client_uuid: string;
  status: "created" | "duplicate" | "rejected";
  motif?: string | null;
}

interface BatchResponse {
  results: BatchItemResult[];
  created: number;
  duplicates: number;
  rejected: number;
}

export interface SyncResult {
  uploaded: number;
  rejected: number;
  articlesUpdated: number;
  campaignRefreshed: boolean;
  errors: string[];
  newLastSyncAt: string | null;
  authRequired: boolean;
  retryable: boolean;
}

function isAuthError(err: unknown): boolean {
  return (err as { response?: { status?: number } })?.response?.status === 401;
}

function isRetryable(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return !status || status >= 500;
}

export async function runSync(lastSyncAt: string | null): Promise<SyncResult> {
  const result: SyncResult = {
    uploaded: 0,
    rejected: 0,
    articlesUpdated: 0,
    campaignRefreshed: false,
    errors: [],
    newLastSyncAt: null,
    authRequired: false,
    retryable: false,
  };

  // ── 0. Traitement de la file de suppressions différées ─────────────────────
  const pendingDeletions = await getPendingDeletions();
  for (const clientUuid of pendingDeletions) {
    try {
      await api.delete(`/campagne-active/comptages/${clientUuid}`);
      await clearDeletion(clientUuid);
    } catch (err) {
      if (isAuthError(err)) return { ...result, authRequired: true };
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        await clearDeletion(clientUuid); // déjà absent côté serveur
      } else if (isRetryable(err)) {
        result.retryable = true;
      }
    }
  }

  // ── 1. Upload des comptages en attente ─────────────────────────────────────
  const pending = await getPendingComptages();
  if (pending.length > 0) {
    try {
      const resp = await api.post<BatchResponse>("/comptages/batch", {
        comptages: pending.map((c) => ({
          campagne_id: c.campagne_id,
          article_id: c.article_id,
          quantite: c.quantite,
          client_uuid: c.client_uuid,
          counted_at: c.counted_at,
          commentaire: c.commentaire ?? null,
        })),
      });

      const syncedUuids: string[] = [];
      for (const r of resp.data.results) {
        if (r.status === "created" || r.status === "duplicate") {
          syncedUuids.push(r.client_uuid);
        } else if (r.status === "rejected") {
          await db.comptages
            .where("client_uuid")
            .equals(r.client_uuid)
            .modify({ syncError: r.motif ?? "rejected" });
        }
      }
      if (syncedUuids.length > 0) {
        await markComptagesSynced(syncedUuids);
      }
      result.uploaded = resp.data.created;
      result.rejected = resp.data.rejected;
    } catch (err) {
      if (isAuthError(err)) return { ...result, authRequired: true };
      if (isRetryable(err)) result.retryable = true;
      result.errors.push(
        `Upload comptages : ${(err as { message?: string })?.message ?? "erreur réseau"}`
      );
    }
  }

  // ── 2. Mise à jour catalogue ───────────────────────────────────────────────
  try {
    const url = lastSyncAt
      ? `/catalogue/sync?since=${encodeURIComponent(lastSyncAt)}`
      : "/catalogue";
    const resp = await api.get<{
      last_sync: string;
      articles: Array<{
        id: string;
        code_barre: string;
        code_article: string;
        libelle: string;
        unite: string | null;
        actif: boolean;
      }>;
    }>(url);

    const { articles } = resp.data;
    const actifs = articles.filter((a) => a.actif);
    const inactifIds = articles.filter((a) => !a.actif).map((a) => a.id);

    if (actifs.length) {
      await db.articles.bulkPut(
        actifs.map(({ id, code_barre, code_article, libelle, unite }) => ({
          id,
          code_barre,
          code_article,
          libelle,
          unite,
        }))
      );
    }
    if (inactifIds.length) {
      await db.articles.bulkDelete(inactifIds);
    }
    result.articlesUpdated = articles.length;
    result.newLastSyncAt = resp.data.last_sync;
  } catch (err) {
    if (isAuthError(err)) return { ...result, authRequired: true };
    if (isRetryable(err)) result.retryable = true;
    result.errors.push(
      `Catalogue : ${(err as { message?: string })?.message ?? "erreur réseau"}`
    );
  }

  // ── 3. Rechargement campagne active ────────────────────────────────────────
  try {
    const resp = await api.get<CampagneLocal>("/campagne-active");
    await saveCampagne({ ...resp.data, fetchedAt: new Date().toISOString() });
    result.campaignRefreshed = true;
  } catch (err: unknown) {
    if (isAuthError(err)) return { ...result, authRequired: true };
    const s = (err as { response?: { status?: number } })?.response?.status;
    if (s === 404) {
      await db.campagne.clear();
      result.campaignRefreshed = true;
    } else {
      if (isRetryable(err)) result.retryable = true;
      result.errors.push(
        `Campagne : ${(err as { message?: string })?.message ?? "erreur réseau"}`
      );
    }
  }

  return result;
}
