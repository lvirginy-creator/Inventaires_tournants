import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import { useSyncStore } from "@/store/sync";
import { getCampagneActive, getPendingComptages, db } from "@/db/schema";
import { runSync } from "@/db/sync";
import type { CampagneLocal, ComptageLocal } from "@/types";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { magasin_nom, role } = useAuthStore();
  const { status, pendingCount, lastSyncAt, lastError, setStatus, setPendingCount, setLastSyncAt } =
    useSyncStore();

  const [campagne, setCampagne] = useState<CampagneLocal | null>(null);
  const [comptagesMap, setComptagesMap] = useState<Map<string, ComptageLocal[]>>(new Map());
  const [loadingCampagne, setLoadingCampagne] = useState(true);

  const refreshState = async () => {
    const c = await getCampagneActive();
    setCampagne(c ?? null);
    if (c) {
      const all = await db.comptages.where("campagne_id").equals(c.id).toArray();
      const map = new Map<string, ComptageLocal[]>();
      for (const cpt of all) {
        const arr = map.get(cpt.article_id) ?? [];
        arr.push(cpt);
        map.set(cpt.article_id, arr);
      }
      setComptagesMap(map);
    } else {
      setComptagesMap(new Map());
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

  const countedCount = campagne
    ? campagne.lignes.filter((l) => comptagesMap.has(l.article_id)).length
    : 0;

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

      <main className="flex-1 p-5 space-y-4 pb-2">
        {/* Campagne active */}
        <div className="bg-white rounded-2xl shadow p-5">
          {loadingCampagne ? (
            <p className="text-gray-400 text-center py-4">Chargement…</p>
          ) : campagne ? (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400 uppercase font-semibold tracking-wide">
                  Campagne
                </span>
                {campagne.statut === "validee" ? (
                  <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">
                    ✓ Validée
                  </span>
                ) : campagne.statut === "terminee" ? (
                  <span className="bg-yellow-100 text-yellow-700 text-xs font-medium px-2 py-0.5 rounded-full">
                    En attente de validation
                  </span>
                ) : (
                  <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                    En cours
                  </span>
                )}
              </div>
              <p className="text-xl font-bold text-gray-900 mt-1">{campagne.nom}</p>

              {/* Barre de progression */}
              {campagne.statut === "en_cours" && campagne.lignes.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-600">Articles comptés</span>
                    <span className="font-semibold text-gray-900">
                      {countedCount} / {campagne.lignes.length}
                    </span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (countedCount / campagne.lignes.length) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-4">
              <div className="text-4xl mb-2">📋</div>
              <p className="text-gray-500 text-sm">Aucune campagne active</p>
              <p className="text-gray-400 text-xs mt-1">Synchronisez pour vérifier</p>
            </div>
          )}
        </div>

        {/* Liste des articles à inventorier */}
        {campagne?.statut === "en_cours" && campagne.lignes.length > 0 && (
          <div className="bg-white rounded-2xl shadow overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Articles à inventorier</h2>
            </div>
            <ul className="divide-y divide-gray-100">
              {campagne.lignes.map((ligne) => {
                const cpts = comptagesMap.get(ligne.article_id);
                const isCounted = !!cpts && cpts.length > 0;
                const totalQty = cpts
                  ? cpts.reduce((sum, c) => sum + c.quantite, 0)
                  : 0;
                return (
                  <li
                    key={ligne.id}
                    className={`flex items-center justify-between px-5 py-3 ${
                      isCounted ? "bg-green-50" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {ligne.article.libelle}
                      </p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">
                        {ligne.article.code_article}
                        {ligne.article.code_barre ? ` · ${ligne.article.code_barre}` : ""}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      {isCounted ? (
                        <div>
                          <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-semibold px-2 py-1 rounded-full">
                            ✓ Compté
                          </span>
                          <p className="text-sm font-bold text-green-700 mt-1">
                            {totalQty % 1 === 0 ? totalQty : totalQty.toFixed(3)}
                            {ligne.article.unite ? ` ${ligne.article.unite}` : ""}
                          </p>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-400 text-xs font-medium px-2 py-1 rounded-full">
                          ○ À compter
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

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
        {campagne?.statut === "en_cours" && (
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
