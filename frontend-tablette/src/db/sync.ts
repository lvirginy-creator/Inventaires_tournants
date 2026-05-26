/**
 * Logique de synchronisation bidirectionnelle :
 * 1. Upload des comptages en attente (POST /comptages/batch)
 * 2. Mise à jour du catalogue (GET /catalogue/sync?since=)
 * 3. Rechargement de la campagne active (GET /campagne-active)
 */
import api from "@/api/client";
import {
  db,
  getPendingComptages,
  markComptagesSynced,
  saveCampagne,
} from "@/db/schema";
import type { CampagneLocal } from "@/types";

interface SyncResult {
  uploaded: number;
  articlesUpdated: number;
  campaignRefreshed: boolean;
  errors: string[];
}

export async function runSync(lastSyncAt: string | null): Promise<SyncResult> {
  const result: SyncResult = {
    uploaded: 0,
    articlesUpdated: 0,
    campaignRefreshed: false,
    errors: [],
  };

  // ── 1. Upload des comptages en attente ─────────────────────────────────────
  const pending = await getPendingComptages();
  if (pending.length > 0) {
    try {
      const resp = await api.post<{ created: number; duplicates: number }>(
        "/comptages/batch",
        {
          comptages: pending.map((c) => ({
            campagne_id: c.campagne_id,
            article_id: c.article_id,
            quantite: c.quantite,
            client_uuid: c.client_uuid,
            counted_at: c.counted_at,
          })),
        }
      );
      result.uploaded = resp.data.created;
      await markComptagesSynced(pending.map((c) => c.client_uuid));
    } catch (err) {
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
    // Upsert articles actifs, supprimer désactivés
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
    localStorage.setItem("lastSyncAt", resp.data.last_sync);
  } catch (err) {
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
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
      // Aucune campagne active — vider localement
      await db.campagne.clear();
      result.campaignRefreshed = true;
    } else {
      result.errors.push(
        `Campagne : ${(err as { message?: string })?.message ?? "erreur réseau"}`
      );
    }
  }

  return result;
}
