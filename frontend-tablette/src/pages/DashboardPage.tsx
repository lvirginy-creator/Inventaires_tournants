import { Fragment, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { useAuthStore } from "@/store/auth";
import { useSyncStore } from "@/store/sync";
import {
  getCampagneActive,
  getArticleByCodeBarre,
  getArticlesByCodeArticle,
  saveComptage,
  getPendingComptages,
  db,
} from "@/db/schema";
import { runSync } from "@/db/sync";
import api from "@/api/client";
import type { CampagneLocal, ComptageLocal } from "@/types";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { magasin_nom, role } = useAuthStore();
  const { status, pendingCount, lastSyncAt, lastError, setStatus, setPendingCount, setLastSyncAt } =
    useSyncStore();

  const [campagne, setCampagne] = useState<CampagneLocal | null>(null);
  const [comptagesMap, setComptagesMap] = useState<Map<string, ComptageLocal[]>>(new Map());
  const [loadingCampagne, setLoadingCampagne] = useState(true);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const [addQty, setAddQty] = useState<Record<string, string>>({});
  const [addedArticle, setAddedArticle] = useState<string | null>(null); // flash feedback
  const [barcodeInput, setBarcodeInput] = useState("");
  const [codeArticleInput, setCodeArticleInput] = useState("");
  const [searchError, setSearchError] = useState("");
  const [highlightedArticle, setHighlightedArticle] = useState<string | null>(null);
  const [cloturerLoading, setCloturerLoading] = useState(false);

  const barcodeRef = useRef<HTMLInputElement>(null);
  const qtyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const articleRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadComptages = async (c: CampagneLocal) => {
    const all = await db.comptages.where("campagne_id").equals(c.id).toArray();

    // Build article_id → code_article from the campaign's embedded ligne data
    // This avoids relying on db.articles which may not contain all campaign article IDs
    const articleCodeMap = new Map<string, string>(
      c.lignes.map((l) => [l.article_id, l.article.code_article])
    );

    const map = new Map<string, ComptageLocal[]>();
    for (const cpt of all) {
      // Prefer campaign data; fall back to db.articles for hors-campagne counts
      let key = articleCodeMap.get(cpt.article_id);
      if (!key) {
        const art = await db.articles.get(cpt.article_id);
        key = art?.code_article ?? cpt.article_id;
      }
      const arr = map.get(key) ?? [];
      arr.push(cpt);
      map.set(key, arr);
    }
    // Sort each group newest-first
    for (const [k, v] of map) {
      map.set(k, v.sort((a, b) => b.counted_at.localeCompare(a.counted_at)));
    }
    setComptagesMap(map);
    const pending = await getPendingComptages();
    setPendingCount(pending.length);
  };

  const refreshState = async () => {
    const c = await getCampagneActive();
    setCampagne(c ?? null);
    if (c) await loadComptages(c);
    else setComptagesMap(new Map());
    setLoadingCampagne(false);
  };

  useEffect(() => {
    refreshState();
    barcodeRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived state ────────────────────────────────────────────────────────────

  const lignesUniques = campagne
    ? campagne.lignes.filter(
        (l, i, arr) =>
          arr.findIndex((x) => x.article.code_article === l.article.code_article) === i
      )
    : [];

  const uniqueCodeArticles = lignesUniques.map((l) => l.article.code_article);
  const countedCount = uniqueCodeArticles.filter(
    (ca) => (comptagesMap.get(ca)?.length ?? 0) > 0
  ).length;

  // ── Navigation helpers ───────────────────────────────────────────────────────

  const scrollToAndFocus = (codeArticle: string) => {
    setExpandedArticle(codeArticle);
    setHighlightedArticle(codeArticle);
    setTimeout(() => setHighlightedArticle(null), 1500);
    const row = articleRowRefs.current[codeArticle];
    if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => qtyInputRefs.current[codeArticle]?.focus(), 350);
  };

  // ── Search handlers ──────────────────────────────────────────────────────────

  const handleBarcodeSearch = async () => {
    setSearchError("");
    const code = barcodeInput.trim();
    if (!code) return;
    const found = await getArticleByCodeBarre(code);
    if (!found) {
      setSearchError(`Code barre "${code}" introuvable`);
      setBarcodeInput("");
      barcodeRef.current?.focus();
      return;
    }
    const inCampaign = lignesUniques.some(
      (l) => l.article.code_article === found.code_article
    );
    if (!inCampaign) {
      setSearchError(`Code barre "${code}" non présent dans cette campagne`);
      setBarcodeInput("");
      barcodeRef.current?.focus();
      return;
    }
    setBarcodeInput("");
    scrollToAndFocus(found.code_article);
  };

  const handleCodeArticleSearch = async () => {
    setSearchError("");
    const code = codeArticleInput.trim();
    if (!code) return;
    const candidates = await getArticlesByCodeArticle(code);
    if (candidates.length === 0) {
      setSearchError(`Code article "${code}" introuvable`);
      setCodeArticleInput("");
      return;
    }
    const inCampaign = lignesUniques.some(
      (l) => l.article.code_article === candidates[0].code_article
    );
    if (!inCampaign) {
      setSearchError(`Code article "${code}" non présent dans cette campagne`);
      setCodeArticleInput("");
      return;
    }
    setCodeArticleInput("");
    scrollToAndFocus(candidates[0].code_article);
  };

  // ── Comptage handlers ────────────────────────────────────────────────────────

  const handleAddComptage = async (codeArticle: string) => {
    if (!campagne) return;
    const qty = parseFloat(addQty[codeArticle] ?? "");
    if (isNaN(qty) || qty <= 0) return;
    const ligne = lignesUniques.find((l) => l.article.code_article === codeArticle);
    if (!ligne) return;

    const comptage: ComptageLocal = {
      client_uuid: uuidv4(),
      campagne_id: campagne.id,
      article_id: ligne.article_id,
      quantite: qty,
      counted_at: new Date().toISOString(),
      synced: false,
    };
    await saveComptage(comptage);

    // Optimistic update — instant visual feedback without waiting for async DB reload
    setComptagesMap((prev) => {
      const next = new Map(prev);
      next.set(codeArticle, [comptage, ...(prev.get(codeArticle) ?? [])]);
      return next;
    });
    setPendingCount(pendingCount + 1);

    setAddQty((prev) => ({ ...prev, [codeArticle]: "" }));
    setAddedArticle(codeArticle);
    setTimeout(() => setAddedArticle(null), 1000);
    setTimeout(() => qtyInputRefs.current[codeArticle]?.focus(), 50);

    // Background reload to reconcile DB state (synced flags, etc.)
    loadComptages(campagne);
  };

  const handleDeleteComptage = async (cpt: ComptageLocal) => {
    if (!campagne) return;
    if (!confirm("Supprimer ce comptage ?")) return;
    if (cpt.synced) {
      try {
        await api.delete(`/campagne-active/comptages/${cpt.client_uuid}`);
      } catch (err) {
        const detail =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        alert(detail ?? "Erreur lors de la suppression — vérifiez votre connexion.");
        return;
      }
    }
    await db.comptages.delete(cpt.client_uuid);
    await loadComptages(campagne);
  };

  // ── Sync ────────────────────────────────────────────────────────────────────

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

  // ── Clôturer ────────────────────────────────────────────────────────────────

  const handleCloturer = async () => {
    if (!campagne) return;
    if (!confirm(`Clôturer la campagne « ${campagne.nom} » ?\nLes tablettes ne pourront plus saisir de comptages.`)) return;
    try {
      setCloturerLoading(true);
      await handleSync(); // upload pending counts first
      await api.post("/campagne-active/cloturer");
      await refreshState();
    } catch {
      alert("Erreur lors de la clôture. Vérifiez votre connexion.");
    } finally {
      setCloturerLoading(false);
    }
  };

  // ── Sync button labels ───────────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* ── Header ── */}
      <header className="bg-blue-900 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-base font-bold leading-tight">{magasin_nom || "Mon Magasin"}</h1>
          <p className="text-xs text-blue-300 capitalize">{role?.replace("_", " ")}</p>
        </div>
        <button
          onClick={() => navigate("/settings")}
          className="text-blue-300 hover:text-white text-xl p-1"
          aria-label="Paramètres"
        >
          ⚙
        </button>
      </header>

      {/* ── Campaign info + progress ── */}
      {!loadingCampagne && campagne && (
        <div className="bg-white border-b px-4 py-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400 uppercase font-semibold tracking-wide">
              Campagne
            </span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                campagne.statut === "validee"
                  ? "bg-green-100 text-green-700"
                  : campagne.statut === "terminee"
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-blue-100 text-blue-700"
              }`}
            >
              {campagne.statut === "validee"
                ? "✓ Validée"
                : campagne.statut === "terminee"
                ? "Terminée"
                : "En cours"}
            </span>
          </div>
          <p className="font-bold text-gray-900">{campagne.nom}</p>
          {campagne.statut === "en_cours" && lignesUniques.length > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Articles comptés</span>
                <span className="font-semibold text-gray-900">
                  {countedCount} / {lignesUniques.length}
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (countedCount / lignesUniques.length) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {loadingCampagne && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400">Chargement…</p>
        </div>
      )}

      {!loadingCampagne && !campagne && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-600 font-medium">Aucune campagne active</p>
          <p className="text-gray-400 text-sm mt-1">Synchronisez pour vérifier</p>
        </div>
      )}

      {!loadingCampagne && campagne && (
        <>
          {/* ── Search bar ── */}
          <div className="bg-white border-b px-3 py-2 flex gap-2 flex-shrink-0">
            <div className="flex-1 relative">
              <input
                ref={barcodeRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleBarcodeSearch();
                }}
                placeholder="Scanner ou saisir le code barre…"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
                autoComplete="off"
                inputMode="none"
                disabled={campagne.statut !== "en_cours"}
              />
            </div>
            <div className="flex-1 relative">
              <input
                type="text"
                value={codeArticleInput}
                onChange={(e) => setCodeArticleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCodeArticleSearch();
                }}
                placeholder="Saisir le code article…"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                autoComplete="off"
                disabled={campagne.statut !== "en_cours"}
              />
            </div>
          </div>

          {/* ── Search error ── */}
          {searchError && (
            <div className="mx-3 mt-2 flex-shrink-0 bg-red-50 border border-red-300 rounded-lg px-3 py-2 text-xs text-red-700 flex items-center justify-between">
              <span>{searchError}</span>
              <button onClick={() => setSearchError("")} className="ml-2 text-red-400 hover:text-red-600">✕</button>
            </div>
          )}

          {/* ── Sync error ── */}
          {status === "error" && lastError && (
            <div className="mx-3 mt-2 flex-shrink-0 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-700">
              {lastError}
            </div>
          )}

          {/* ── Article list ── */}
          <div className="flex-1 overflow-y-auto">
            {lignesUniques.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">Aucun article dans cette campagne</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr className="border-b border-gray-200">
                    <th className="w-10 px-2 py-2"></th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                      Code article
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                      Libellé
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">
                      Compté
                    </th>
                    {campagne.statut === "en_cours" && (
                      <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
                        Ajouter
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {lignesUniques.map((ligne) => {
                    const codeArticle = ligne.article.code_article;
                    const cpts = comptagesMap.get(codeArticle) ?? [];
                    const total = cpts.reduce((s, c) => s + c.quantite, 0);
                    const isCounted = cpts.length > 0;
                    const isExpanded = expandedArticle === codeArticle;
                    const isHighlighted = highlightedArticle === codeArticle;
                    const isAdded = addedArticle === codeArticle;
                    const rowBg = isHighlighted
                      ? "bg-yellow-50"
                      : isAdded
                      ? "bg-green-50"
                      : isCounted
                      ? "bg-green-50/40"
                      : "";

                    return (
                      <Fragment key={codeArticle}>
                        <tr
                          ref={(el) => { articleRowRefs.current[codeArticle] = el; }}
                          className={`transition-colors ${rowBg}`}
                        >
                          {/* Expand toggle */}
                          <td className="px-2 py-2 text-center">
                            <button
                              onClick={() =>
                                setExpandedArticle(isExpanded ? null : codeArticle)
                              }
                              className="text-gray-400 hover:text-gray-700 text-xs leading-none"
                            >
                              {isExpanded ? "▼" : "▶"}
                            </button>
                            {cpts.length > 0 && (
                              <div className="text-xs text-gray-400 leading-none mt-0.5">
                                ({cpts.length})
                              </div>
                            )}
                          </td>

                          {/* Code article */}
                          <td className="px-3 py-2 font-mono text-xs text-blue-700 font-medium whitespace-nowrap">
                            {codeArticle}
                          </td>

                          {/* Libellé */}
                          <td className="px-3 py-2 max-w-[180px] truncate text-gray-800" title={ligne.article.libelle}>
                            {ligne.article.libelle}
                          </td>

                          {/* Total compté */}
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {isCounted ? (
                              <span className={`font-bold ${isAdded ? "text-green-700" : "text-gray-900"}`}>
                                {total % 1 === 0 ? total : total.toFixed(3)}
                                {ligne.article.unite ? ` ${ligne.article.unite}` : ""}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400 italic">—</span>
                            )}
                          </td>

                          {/* Qty input + Ajouter */}
                          {campagne.statut === "en_cours" && (
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1">
                                <input
                                  ref={(el) => { qtyInputRefs.current[codeArticle] = el; }}
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="any"
                                  placeholder="Qté"
                                  value={addQty[codeArticle] ?? ""}
                                  onChange={(e) =>
                                    setAddQty((prev) => ({
                                      ...prev,
                                      [codeArticle]: e.target.value,
                                    }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleAddComptage(codeArticle);
                                  }}
                                  className="border rounded px-2 py-1.5 text-sm w-20 text-right font-mono focus:outline-none focus:ring-2 focus:ring-green-400"
                                />
                                <button
                                  onClick={() => handleAddComptage(codeArticle)}
                                  disabled={!addQty[codeArticle]}
                                  className="px-2 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-40 whitespace-nowrap font-medium"
                                >
                                  + Ajouter
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>

                        {/* ── Expanded: comptage detail ── */}
                        {isExpanded && (
                          <tr>
                            <td
                              colSpan={campagne.statut === "en_cours" ? 5 : 4}
                              className="px-4 py-2 bg-blue-50/40 border-b border-blue-100"
                            >
                              {cpts.length === 0 ? (
                                <p className="text-xs text-gray-400 italic py-1">
                                  Aucun comptage enregistré
                                </p>
                              ) : (
                                <table className="min-w-full text-xs mb-1">
                                  <thead>
                                    <tr className="text-gray-500 border-b border-gray-200">
                                      <th className="text-left pb-1 pr-4 font-medium">Date</th>
                                      <th className="text-right pb-1 pr-3 font-medium">Qté</th>
                                      <th className="pb-1 w-6"></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {cpts.map((c) => (
                                      <tr key={c.client_uuid} className="border-t border-gray-100">
                                        <td className="pr-4 py-1 text-gray-500">
                                          {new Date(c.counted_at).toLocaleString("fr-FR")}
                                          {!c.synced && (
                                            <span className="ml-1 text-orange-500 text-xs" title="Non synchronisé">●</span>
                                          )}
                                        </td>
                                        <td className="pr-3 py-1 text-right font-mono font-medium">
                                          {c.quantite % 1 === 0 ? c.quantite : c.quantite.toFixed(3)}
                                          {ligne.article.unite ? ` ${ligne.article.unite}` : ""}
                                        </td>
                                        <td className="py-1 text-right">
                                          <button
                                            onClick={() => handleDeleteComptage(c)}
                                            className="text-red-400 hover:text-red-600 px-1"
                                            title="Supprimer ce comptage"
                                          >
                                            ✕
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Pending badge ── */}
          {pendingCount > 0 && (
            <div className="mx-3 mb-2 flex-shrink-0 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 flex items-center gap-2 text-xs">
              <span className="text-orange-500">⚠</span>
              <span className="text-orange-800 font-medium">
                {pendingCount} comptage{pendingCount > 1 ? "s" : ""} non synchronisé
                {pendingCount > 1 ? "s" : ""}
              </span>
            </div>
          )}

          {/* ── Bottom actions ── */}
          <div className="p-3 flex gap-3 flex-shrink-0 border-t bg-white">
            <button
              onClick={handleSync}
              disabled={status === "syncing"}
              className={`flex-1 text-white font-semibold py-3 rounded-xl text-sm shadow transition-colors ${syncColor[status]}`}
            >
              🔄 {syncLabel[status]}
            </button>
            {campagne.statut === "en_cours" && (
              <button
                onClick={handleCloturer}
                disabled={cloturerLoading || status === "syncing"}
                className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-3 rounded-xl text-sm shadow transition-colors disabled:opacity-50"
              >
                {cloturerLoading ? "Clôture…" : "Clôturer"}
              </button>
            )}
          </div>

          {/* ── Last sync label ── */}
          {lastSyncAt && (
            <p className="text-center text-xs text-gray-400 pb-2">
              Sync : {new Date(lastSyncAt).toLocaleString("fr-FR")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
