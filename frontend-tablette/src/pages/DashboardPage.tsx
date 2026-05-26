import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import { useSyncStore } from "@/store/sync";
import { getCampagneActive, getPendingComptages, db } from "@/db/schema";
import { runSync } from "@/db/sync";
import type { CampagneLocal } from "@/types";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { magasin_nom, role } = useAuthStore();
  const { status, pendingCount, lastSyncAt, lastError, setStatus, setPendingCount, setLastSyncAt } =
    useSyncStore();

  const [campagne, setCampagne] = useState<CampagneLocal | null>(null);
  const [countedArticles, setCountedArticles] = useState(0);
  const [loadingCampagne, setLoadingCampagne] = useState(true);

  const refreshState = async () => {
    const c = await getCampagneActive();
    setCampagne(c ?? null);
    if (c) {
      const counted = await db.comptages
        .where("campagne_id")
        .equals(c.id)
        .count();
      setCountedArticles(counted);
    }
    const pending = await getPendingComptages();
    setPendingCount(pending.length);
    setLoadingCampagne(false);
  };

  useEffect(() => {
    refreshState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSync = async () => {
    setStatus("syncing");
    try {
      const result = await runSync(lastSyncAt);
      if (result.errors.length > 0) {
        setStatus("error", result.errors.join(" | "));
      } else {
        setStatus("success");
        const synced = localStorage.getItem("lastSyncAt");
        if (synced) setLastSyncAt(synced);
      }
      await refreshState();
    } catch {
      setStatus("error", "Erreur inattendue");
    }
  };

  const syncLabel: Record<typeof status, string> = {
    idle: "Synchroniser",
    syncing: "Synchronisation…",
    success: "Synchronisé ✓",
    error: "Réessayer",
  };

  const syncColor: Record<typeof status, string> = {
    idle: "bg-blue-600 hover:bg-blue-700",
    syncing: "bg-gray-400 cursor-not-allowed",
    success: "bg-green-600 hover:bg-green-700",
    error: "bg-red-600 hover:bg-red-700",
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-blue-900 text-white px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{magasin_nom || "Mon Magasin"}</h1>
            <p className="text-xs text-blue-300 capitalize">{role?.replace("_", " ")}</p>
          </div>
          <button
            onClick={() => navigate("/settings")}
            className="text-blue-300 hover:text-white text-2xl"
            aria-label="Paramètres"
          >
            ⚙
          </button>
        </div>
      </header>

      <main className="flex-1 p-5 space-y-4">
        {/* Campagne active */}
        <div className="bg-white rounded-2xl shadow p-5">
          {loadingCampagne ? (
            <p className="text-gray-400 text-center py-4">Chargement…</p>
          ) : campagne ? (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400 uppercase font-semibold tracking-wide">
                  Campagne active
                </span>
                <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                  En cours
                </span>
              </div>
              <p className="text-xl font-bold text-gray-900 mt-1">{campagne.nom}</p>

              {/* Barre de progression */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-600">Articles comptés</span>
                  <span className="font-semibold text-gray-900">
                    {countedArticles} / {campagne.lignes.length}
                  </span>
                </div>
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all"
                    style={{
                      width: campagne.lignes.length
                        ? `${Math.min(100, (countedArticles / campagne.lignes.length) * 100)}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="text-4xl mb-2">📋</div>
              <p className="text-gray-500 text-sm">Aucune campagne active</p>
              <p className="text-gray-400 text-xs mt-1">Synchronisez pour vérifier</p>
            </div>
          )}
        </div>

        {/* Badge comptages en attente */}
        {pendingCount > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl px-5 py-3 flex items-center gap-3">
            <span className="text-orange-500 text-2xl">⚠</span>
            <div>
              <p className="text-sm font-semibold text-orange-800">
                {pendingCount} comptage{pendingCount > 1 ? "s" : ""} non synchronisé
                {pendingCount > 1 ? "s" : ""}
              </p>
              <p className="text-xs text-orange-600">Synchronisez dès que vous avez du réseau</p>
            </div>
          </div>
        )}

        {/* Erreur sync */}
        {status === "error" && lastError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-3 text-sm text-red-700">
            {lastError}
          </div>
        )}

        {/* Dernière sync */}
        {lastSyncAt && (
          <p className="text-center text-xs text-gray-400">
            Dernière sync : {new Date(lastSyncAt).toLocaleString("fr-FR")}
          </p>
        )}
      </main>

      {/* Boutons d'action en bas */}
      <div className="p-5 space-y-3">
        {campagne && (
          <button
            onClick={() => navigate("/count")}
            className="w-full bg-blue-700 text-white font-bold py-5 rounded-2xl text-xl shadow-lg hover:bg-blue-800 active:scale-95 transition-transform"
          >
            📷 COMPTER
          </button>
        )}
        <button
          onClick={handleSync}
          disabled={status === "syncing"}
          className={`w-full text-white font-semibold py-4 rounded-2xl text-base shadow transition-colors ${syncColor[status]}`}
        >
          🔄 {syncLabel[status]}
        </button>
      </div>
    </div>
  );
}
