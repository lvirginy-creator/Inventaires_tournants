import { useEffect, useRef, useState } from "react";
import api from "@/api/client";
import type {
  Article,
  CampagneDetail,
  CampagneRapport,
  CampagneSummary,
  LigneImportResponse,
  Magasin,
  StatutCampagne,
} from "@/types";

// ── Badges statut ──────────────────────────────────────────────────────────────

const STATUT_LABELS: Record<StatutCampagne, string> = {
  brouillon: "Brouillon",
  en_cours: "En cours",
  terminee: "Terminée",
  validee: "Validée",
};

const STATUT_COLORS: Record<StatutCampagne, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  en_cours: "bg-blue-100 text-blue-700",
  terminee: "bg-yellow-100 text-yellow-700",
  validee: "bg-green-100 text-green-700",
};

function StatutBadge({ statut }: { statut: StatutCampagne }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUT_COLORS[statut]}`}
    >
      {STATUT_LABELS[statut]}
    </span>
  );
}

// ── Composant principal ────────────────────────────────────────────────────────

export default function CampagnesPage() {
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [campagnes, setCampagnes] = useState<CampagneSummary[]>([]);
  const [selected, setSelected] = useState<CampagneDetail | null>(null);
  const [loading, setLoading] = useState(false);

  // Filtres liste
  const [filterMagasin, setFilterMagasin] = useState("");
  const [filterStatut, setFilterStatut] = useState<StatutCampagne | "">("");

  // Modal création
  const [showCreate, setShowCreate] = useState(false);
  const [createMagasin, setCreateMagasin] = useState("");
  const [createNom, setCreateNom] = useState("");
  const [createError, setCreateError] = useState("");

  // Ajout article dans détail
  const [articles, setArticles] = useState<Article[]>([]);
  const [addArticleId, setAddArticleId] = useState("");
  const [addQt, setAddQt] = useState("");
  const [addError, setAddError] = useState("");

  // Import lignes
  const [showImport, setShowImport] = useState(false);
  const [importResult, setImportResult] = useState<LigneImportResponse | null>(null);
  const [importError, setImportError] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Onglet détail et rapport
  const [detailTab, setDetailTab] = useState<"articles" | "rapport">("articles");
  const [rapport, setRapport] = useState<CampagneRapport | null>(null);
  const [rapportLoading, setRapportLoading] = useState(false);
  const [rapportSort, setRapportSort] = useState<{ col: keyof CampagneRapport["lignes"][0]; asc: boolean }>({
    col: "ecart",
    asc: true,
  });

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Chargements ─────────────────────────────────────────────────────────────

  useEffect(() => {
    api.get<Magasin[]>("/magasins").then((r) => setMagasins(r.data.filter((m) => m.actif)));
  }, []);

  const fetchCampagnes = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterMagasin) params.set("magasin_id", filterMagasin);
    if (filterStatut) params.set("statut", filterStatut);
    try {
      const r = await api.get<CampagneSummary[]>(`/campagnes?${params}`);
      setCampagnes(r.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampagnes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMagasin, filterStatut]);

  const openDetail = async (c: CampagneSummary) => {
    const r = await api.get<CampagneDetail>(`/campagnes/${c.id}`);
    setSelected(r.data);
    setDetailTab("articles");
    setRapport(null);
    setAddArticleId("");
    setAddQt("");
    setAddError("");
    // Charger les articles de la société du magasin
    const mag = magasins.find((m) => m.id === c.magasin_id);
    if (mag) {
      const ra = await api.get<Article[]>(`/articles?societe_id=${mag.societe_id}&actif=true&limit=500`);
      setArticles(ra.data);
    }
  };

  const refreshSelected = async () => {
    if (!selected) return;
    const r = await api.get<CampagneDetail>(`/campagnes/${selected.id}`);
    setSelected(r.data);
    fetchCampagnes();
  };

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    setCreateError("");
    try {
      await api.post("/campagnes", { magasin_id: createMagasin, nom: createNom });
      setShowCreate(false);
      setCreateMagasin("");
      setCreateNom("");
      fetchCampagnes();
    } catch (err: unknown) {
      setCreateError(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          "Erreur création"
      );
    }
  };

  const handleTransition = async (action: "demarrer" | "cloturer") => {
    if (!selected) return;
    await api.post(`/campagnes/${selected.id}/${action}`);
    refreshSelected();
  };

  const handleValider = async () => {
    if (!selected) return;
    try {
      await api.post(`/campagnes/${selected.id}/valider`);
      await refreshSelected();
      const mag = magasins.find((m) => m.id === selected.magasin_id);
      const emailInfo = mag?.email_responsable
        ? ` — e-mail envoyé à ${mag.email_responsable}`
        : "";
      showToast(`Campagne validée${emailInfo}`);
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Erreur lors de la validation";
      showToast(detail, "error");
    }
  };

  const handleDelete = async () => {
    if (!selected || !confirm(`Supprimer « ${selected.nom} » ?`)) return;
    await api.delete(`/campagnes/${selected.id}`);
    setSelected(null);
    fetchCampagnes();
  };

  const handleAddArticle = async () => {
    if (!selected || !addArticleId) return;
    setAddError("");
    try {
      await api.post(`/campagnes/${selected.id}/articles`, {
        article_id: addArticleId,
        quantite_theorique: addQt ? parseFloat(addQt) : null,
      });
      setAddArticleId("");
      setAddQt("");
      refreshSelected();
    } catch (err: unknown) {
      setAddError(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          "Erreur ajout"
      );
    }
  };

  const handleRemoveArticle = async (articleId: string) => {
    if (!selected) return;
    await api.delete(`/campagnes/${selected.id}/articles/${articleId}`);
    refreshSelected();
  };

  const handleImport = async () => {
    if (!selected || !fileRef.current?.files?.[0]) return;
    setImportError("");
    setImportResult(null);
    setImportLoading(true);
    const form = new FormData();
    form.append("file", fileRef.current.files[0]);
    try {
      const r = await api.post<LigneImportResponse>(
        `/campagnes/${selected.id}/articles/import`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setImportResult(r.data);
      refreshSelected();
    } catch (err: unknown) {
      setImportError(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          "Erreur import"
      );
    } finally {
      setImportLoading(false);
    }
  };

  const loadRapport = async () => {
    if (!selected) return;
    setRapportLoading(true);
    try {
      const r = await api.get<CampagneRapport>(`/campagnes/${selected.id}/rapport`);
      setRapport(r.data);
    } finally {
      setRapportLoading(false);
    }
  };

  const handleExport = async (format: "csv" | "xlsx") => {
    if (!selected) return;
    const resp = await api.get(`/campagnes/${selected.id}/rapport/export?format=${format}`, {
      responseType: "blob",
    });
    const ext = format === "xlsx" ? "xlsx" : "csv";
    const url = URL.createObjectURL(new Blob([resp.data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport_${selected.nom.replace(/\s+/g, "_").slice(0, 40)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSort = (col: keyof CampagneRapport["lignes"][0]) => {
    setRapportSort((prev) =>
      prev.col === col ? { col, asc: !prev.asc } : { col, asc: true }
    );
  };

  const sortedLignes = rapport
    ? [...rapport.lignes].sort((a, b) => {
        const va = a[rapportSort.col] ?? -Infinity;
        const vb = b[rapportSort.col] ?? -Infinity;
        if (va < vb) return rapportSort.asc ? -1 : 1;
        if (va > vb) return rapportSort.asc ? 1 : -1;
        return 0;
      })
    : [];

  const editable = selected?.statut === "brouillon";
  const magasinNom = (id: string) => magasins.find((m) => m.id === id)?.nom ?? id;

  // ── Rendu ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-6 h-full">
      {/* ── Liste ──────────────────────────────────────────────────────────── */}
      <div className="w-96 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">Campagnes</h1>
          <button
            onClick={() => { setShowCreate(true); setCreateError(""); }}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            + Nouvelle
          </button>
        </div>

        {/* Filtres */}
        <div className="flex flex-col gap-2 mb-3">
          <select
            value={filterMagasin}
            onChange={(e) => setFilterMagasin(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="">Tous les magasins</option>
            {magasins.map((m) => (
              <option key={m.id} value={m.id}>{m.nom}</option>
            ))}
          </select>
          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value as StatutCampagne | "")}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="">Tous les statuts</option>
            {(Object.keys(STATUT_LABELS) as StatutCampagne[]).map((s) => (
              <option key={s} value={s}>{STATUT_LABELS[s]}</option>
            ))}
          </select>
        </div>

        {/* Liste */}
        <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-240px)]">
          {loading && <p className="text-sm text-gray-400 text-center py-4">Chargement…</p>}
          {!loading && campagnes.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Aucune campagne</p>
          )}
          {campagnes.map((c) => (
            <button
              key={c.id}
              onClick={() => openDetail(c)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                selected?.id === c.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-900 truncate">{c.nom}</span>
                <StatutBadge statut={c.statut} />
              </div>
              <p className="text-xs text-gray-500">{magasinNom(c.magasin_id)}</p>
              <p className="text-xs text-gray-400 mt-1">{c.nb_articles} article{c.nb_articles > 1 ? "s" : ""}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Détail ─────────────────────────────────────────────────────────── */}
      <div className="flex-1">
        {!selected ? (
          <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
            Sélectionnez une campagne
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow p-6">
            {/* En-tête */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selected.nom}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{magasinNom(selected.magasin_id)}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatutBadge statut={selected.statut} />
                {selected.statut === "brouillon" && (
                  <>
                    <button
                      onClick={() => handleTransition("demarrer")}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Démarrer
                    </button>
                    <button
                      onClick={handleDelete}
                      className="px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50"
                    >
                      Supprimer
                    </button>
                  </>
                )}
                {selected.statut === "en_cours" && (
                  <button
                    onClick={() => handleTransition("cloturer")}
                    className="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700"
                  >
                    Clôturer
                  </button>
                )}
                {selected.statut === "terminee" && (
                  <button
                    onClick={handleValider}
                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    ✓ Valider
                  </button>
                )}
              </div>
            </div>

            {/* Dates */}
            {(selected.date_debut || selected.date_fin) && (
              <div className="flex gap-4 text-xs text-gray-500 mb-4">
                {selected.date_debut && (
                  <span>Démarrée le {new Date(selected.date_debut).toLocaleString("fr-FR")}</span>
                )}
                {selected.date_fin && (
                  <span>Clôturée le {new Date(selected.date_fin).toLocaleString("fr-FR")}</span>
                )}
              </div>
            )}

            {/* ── Onglets Articles / Rapport ─────────────────────────────── */}
            {selected.statut !== "brouillon" && (
              <div className="flex gap-1 mb-4 border-b">
                <button
                  onClick={() => setDetailTab("articles")}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    detailTab === "articles"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Articles
                </button>
                <button
                  onClick={() => {
                    setDetailTab("rapport");
                    if (!rapport) loadRapport();
                  }}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    detailTab === "rapport"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Rapport
                </button>
              </div>
            )}

            {/* ── Vue Rapport ──────────────────────────────────────────────── */}
            {detailTab === "rapport" && (
              <div>
                {rapportLoading ? (
                  <p className="text-sm text-gray-400 text-center py-8">Chargement du rapport…</p>
                ) : rapport ? (
                  <>
                    {/* Cartes résumé */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      {[
                        { label: "Articles", value: rapport.nb_articles, color: "text-gray-700" },
                        { label: "Comptés", value: rapport.nb_articles_comptes, color: "text-blue-700" },
                        { label: "En écart", value: rapport.nb_articles_en_ecart, color: rapport.nb_articles_en_ecart > 0 ? "text-red-600" : "text-green-700" },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className={`text-2xl font-bold ${color}`}>{value}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Exports */}
                    <div className="flex gap-2 mb-4">
                      <button
                        onClick={() => handleExport("csv")}
                        className="px-3 py-1.5 text-xs border rounded hover:bg-gray-50 font-medium"
                      >
                        ↓ CSV
                      </button>
                      <button
                        onClick={() => handleExport("xlsx")}
                        className="px-3 py-1.5 text-xs border rounded hover:bg-gray-50 font-medium"
                      >
                        ↓ XLSX
                      </button>
                      <button
                        onClick={loadRapport}
                        className="ml-auto px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                      >
                        ↺ Actualiser
                      </button>
                    </div>

                    {/* Table */}
                    <div className="overflow-hidden rounded-lg border">
                      <table className="min-w-full divide-y divide-gray-200 text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            {(
                              [
                                ["code_barre", "Code barre"],
                                ["libelle", "Libellé"],
                                ["quantite_theorique", "Théorique"],
                                ["quantite_comptee", "Compté"],
                                ["ecart", "Écart"],
                                ["ecart_pct", "Écart %"],
                              ] as [keyof CampagneRapport["lignes"][0], string][]
                            ).map(([col, label]) => (
                              <th
                                key={col}
                                onClick={() => toggleSort(col)}
                                className="px-3 py-2 text-left font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                              >
                                {label}
                                {rapportSort.col === col && (
                                  <span className="ml-1">{rapportSort.asc ? "▲" : "▼"}</span>
                                )}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {sortedLignes.length === 0 && (
                            <tr>
                              <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                                Aucun article
                              </td>
                            </tr>
                          )}
                          {sortedLignes.map((lg) => {
                            const rowCls =
                              lg.ecart === null
                                ? ""
                                : lg.ecart === 0
                                  ? "bg-green-50"
                                  : "bg-red-50";
                            const ecartCls =
                              lg.ecart === null
                                ? "text-gray-400"
                                : lg.ecart === 0
                                  ? "text-green-700 font-medium"
                                  : "text-red-600 font-semibold";
                            return (
                              <tr key={lg.article_id} className={rowCls}>
                                <td className="px-3 py-2 font-mono">{lg.code_barre}</td>
                                <td className="px-3 py-2 max-w-[200px] truncate" title={lg.libelle}>
                                  {lg.libelle}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-600">
                                  {lg.quantite_theorique ?? "—"}
                                </td>
                                <td className="px-3 py-2 text-right font-medium">
                                  {lg.quantite_comptee}
                                </td>
                                <td className={`px-3 py-2 text-right ${ecartCls}`}>
                                  {lg.ecart !== null
                                    ? (lg.ecart > 0 ? "+" : "") + lg.ecart
                                    : "—"}
                                </td>
                                <td className={`px-3 py-2 text-right ${ecartCls}`}>
                                  {lg.ecart_pct !== null
                                    ? (lg.ecart_pct > 0 ? "+" : "") +
                                      lg.ecart_pct.toFixed(1) +
                                      " %"
                                    : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}
              </div>
            )}

            {/* ── Vue Articles ─────────────────────────────────────────────── */}
            {/* Actions articles (brouillon) */}
            {detailTab === "articles" && editable && (
              <div className="flex flex-wrap gap-2 mb-4 p-3 bg-gray-50 rounded-lg">
                <select
                  value={addArticleId}
                  onChange={(e) => setAddArticleId(e.target.value)}
                  className="border rounded px-3 py-1.5 text-sm flex-1 min-w-[200px]"
                >
                  <option value="">Choisir un article…</option>
                  {articles
                    .filter((a) => !selected.lignes.some((l) => l.article_id === a.id))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code_barre} — {a.libelle}
                      </option>
                    ))}
                </select>
                <input
                  type="number"
                  placeholder="Qté théorique"
                  value={addQt}
                  onChange={(e) => setAddQt(e.target.value)}
                  className="border rounded px-3 py-1.5 text-sm w-32"
                />
                <button
                  onClick={handleAddArticle}
                  disabled={!addArticleId}
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Ajouter
                </button>
                <button
                  onClick={() => { setShowImport(true); setImportResult(null); setImportError(""); }}
                  className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100"
                >
                  Importer CSV / XLSX
                </button>
                {addError && <p className="w-full text-xs text-red-600">{addError}</p>}
              </div>
            )}

            {/* Table des lignes */}
            {detailTab === "articles" && (<div className="overflow-hidden rounded-lg border">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {["Code barre", "Code article", "Libellé", "Unité", "Qté théorique", ""].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selected.lignes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                        Aucun article dans cette campagne
                      </td>
                    </tr>
                  )}
                  {selected.lignes.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-2 font-mono text-xs">{l.article.code_barre}</td>
                      <td className="px-4 py-2 font-mono text-xs">{l.article.code_article}</td>
                      <td className="px-4 py-2">{l.article.libelle}</td>
                      <td className="px-4 py-2 text-gray-500">{l.article.unite ?? "—"}</td>
                      <td className="px-4 py-2 text-right">
                        {l.quantite_theorique != null ? l.quantite_theorique : "—"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {editable && (
                          <button
                            onClick={() => handleRemoveArticle(l.article_id)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Retirer
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {selected.lignes.length > 0 && (
                <div className="px-4 py-2 text-xs text-gray-400 border-t">
                  {selected.lignes.length} article{selected.lignes.length > 1 ? "s" : ""}
                </div>
              )}
            </div>)}
          </div>
        )}
      </div>

      {/* ── Modal création ──────────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">Nouvelle campagne</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Magasin *</label>
                <select
                  value={createMagasin}
                  onChange={(e) => setCreateMagasin(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  <option value="">Sélectionner…</option>
                  {magasins.map((m) => (
                    <option key={m.id} value={m.id}>{m.nom}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                <input
                  type="text"
                  value={createNom}
                  onChange={(e) => setCreateNom(e.target.value)}
                  placeholder="ex: Inventaire Semaine 22"
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              {createError && <p className="text-sm text-red-600">{createError}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:underline"
              >
                Annuler
              </button>
              <button
                onClick={handleCreate}
                disabled={!createMagasin || !createNom}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Créer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast notification ─────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
            toast.type === "success"
              ? "bg-green-700 text-white"
              : "bg-red-700 text-white"
          }`}
        >
          <span>{toast.type === "success" ? "✓" : "✗"}</span>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">
            ×
          </button>
        </div>
      )}

      {/* ── Modal import ────────────────────────────────────────────────────── */}
      {showImport && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-2">Importer des articles</h2>
            <p className="text-sm text-gray-500 mb-4">
              Fichier CSV ou XLSX avec colonne{" "}
              <code className="bg-gray-100 px-1 rounded">code_barre</code> (requis) et{" "}
              <code className="bg-gray-100 px-1 rounded">quantite_theorique</code> (optionnel).
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx"
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 mb-3"
            />
            {importError && (
              <p className="text-sm text-red-600 bg-red-50 rounded p-2 mb-3">{importError}</p>
            )}
            {importResult && (
              <div className="bg-green-50 rounded p-3 text-sm mb-3">
                <p className="font-medium text-green-800">Import terminé</p>
                <p className="text-green-700">
                  {importResult.added} ajouté{importResult.added > 1 ? "s" : ""} ·{" "}
                  {importResult.skipped} ignoré{importResult.skipped > 1 ? "s" : ""}
                </p>
                {importResult.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-orange-600 font-medium text-xs">
                      {importResult.errors.length} erreur{importResult.errors.length > 1 ? "s" : ""}
                    </summary>
                    <ul className="mt-1 space-y-1 text-orange-700 text-xs">
                      {importResult.errors.map((e, i) => <li key={i}>• {e}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowImport(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:underline"
              >
                Fermer
              </button>
              <button
                onClick={handleImport}
                disabled={importLoading}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                {importLoading ? "Import…" : "Lancer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
