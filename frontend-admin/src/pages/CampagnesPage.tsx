import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import api from "@/api/client";
import type {
  Article,
  CampagneDetail,
  CampagneRapport,
  CampagneSummary,
  ComptagesCampagneResponse,
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

  // Ajout article dans détail — recherche par code article / libellé
  const [articleSearch, setArticleSearch] = useState("");
  const [articleSearchResults, setArticleSearchResults] = useState<Article[]>([]);
  const [articleSearchLoading, setArticleSearchLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<{ code_article: string; libelle: string; articles: Article[] } | null>(null);
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

  // Multi-comptages expandables
  const [comptagesData, setComptagesData] = useState<ComptagesCampagneResponse | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const [addQty, setAddQty] = useState<Record<string, string>>({});

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
    setComptagesData(null);
    setExpandedArticle(null);
    setArticleSearch("");
    setArticleSearchResults([]);
    setSelectedGroup(null);
    setAddQt("");
    setAddError("");
  };

  const refreshSelected = async () => {
    if (!selected) return;
    const r = await api.get<CampagneDetail>(`/campagnes/${selected.id}`);
    setSelected(r.data);
    fetchCampagnes();
  };

  // ── Recherche article (debounce 300ms) ──────────────────────────────────────

  useEffect(() => {
    if (!articleSearch.trim() || !selected) {
      setArticleSearchResults([]);
      return;
    }
    const mag = magasins.find((m) => m.id === selected.magasin_id);
    if (!mag) return;
    setArticleSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const r = await api.get<Article[]>(
          `/articles?q=${encodeURIComponent(articleSearch)}&societe_id=${mag.societe_id}&actif=true&limit=100`
        );
        setArticleSearchResults(r.data);
      } finally {
        setArticleSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleSearch, selected?.id]);

  // Grouper les résultats par code_article
  const groupedArticleResults = useMemo(() => {
    const map = new Map<string, { code_article: string; libelle: string; articles: Article[] }>();
    for (const a of articleSearchResults) {
      if (!map.has(a.code_article)) {
        map.set(a.code_article, { code_article: a.code_article, libelle: a.libelle, articles: [] });
      }
      map.get(a.code_article)!.articles.push(a);
    }
    return Array.from(map.values());
  }, [articleSearchResults]);

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

  const handleAddByCodeArticle = async () => {
    if (!selected || !selectedGroup) return;
    setAddError("");
    const qt = addQt ? parseFloat(addQt) : null;

    // Une seule ligne par code_article : prendre le premier article non encore présent
    const alreadyInCampagne = selected.lignes.some(
      (l) => l.article.code_article === selectedGroup.code_article
    );
    if (alreadyInCampagne) {
      setAddError("Ce code article est déjà dans la campagne");
      return;
    }
    const article = selectedGroup.articles[0];
    if (!article) return;

    try {
      await api.post(`/campagnes/${selected.id}/articles`, {
        article_id: article.id,
        quantite_theorique: qt,
      });
      setSelectedGroup(null);
      setArticleSearch("");
      setArticleSearchResults([]);
      setAddQt("");
      refreshSelected();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setAddError(detail ?? "Erreur lors de l'ajout");
    }
  };

  const handleRemoveCodeArticle = async (codeArticle: string) => {
    if (!selected) return;
    const toRemove = selected.lignes.filter((l) => l.article.code_article === codeArticle);
    for (const ligne of toRemove) {
      await api.delete(`/campagnes/${selected.id}/articles/${ligne.article_id}`);
    }
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
      // Charger rapport et détail comptages en parallèle
      // Le détail ne bloque pas le rapport en cas d'échec
      const [rapportRes] = await Promise.all([
        api.get<CampagneRapport>(`/campagnes/${selected.id}/rapport`),
        loadComptagesDetail().catch((err: unknown) => {
          const detail =
            (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
            "Impossible de charger le détail des comptages";
          showToast(detail, "error");
        }),
      ]);
      setRapport(rapportRes.data);
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Erreur lors du chargement du rapport";
      showToast(detail, "error");
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

  const loadComptagesDetail = async () => {
    if (!selected) return;
    const r = await api.get<ComptagesCampagneResponse>(
      `/campagnes/${selected.id}/comptages`
    );
    setComptagesData(r.data);
  };

  const handleToggleExpand = (articleId: string) => {
    setExpandedArticle((prev) => (prev === articleId ? null : articleId));
  };

  const handleDeleteComptage = async (comptageId: string) => {
    if (!confirm("Supprimer ce comptage ?")) return;
    await api.delete(`/comptages/${comptageId}`);
    await loadRapport();
  };

  const handleAddAdminComptage = async (articleId: string) => {
    if (!selected) return;
    const qty = parseFloat(addQty[articleId] || "0");
    if (isNaN(qty) || qty < 0) return;
    try {
      await api.post(`/campagnes/${selected.id}/comptages/admin`, {
        article_id: articleId,
        quantite: qty,
      });
      setAddQty((prev) => ({ ...prev, [articleId]: "" }));
      await loadRapport();
      showToast("Comptage ajouté");
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Erreur ajout";
      showToast(detail, "error");
    }
  };

  const comptagesParCodeArticle = (codeArticle: string) =>
    comptagesData?.articles
      .filter((a) => a.code_article === codeArticle)
      .flatMap((a) => a.comptages) ?? [];

  const canEditComptages =
    selected?.statut === "en_cours" || selected?.statut === "terminee";

  const editable = selected?.statut === "brouillon";

  // Lignes groupées par code_article pour l'affichage
  const lignesGroupees = useMemo(() => {
    if (!selected) return [];
    const map = new Map<string, typeof selected.lignes>();
    for (const l of selected.lignes) {
      const key = l.article.code_article;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    }
    return Array.from(map.values());
  }, [selected?.lignes]);
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
                            <th className="px-3 py-2 w-10"></th>
                            {(
                              [
                                ["code_article", "Code article"],
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
                              <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
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
                            const isExpanded = expandedArticle === lg.article_id;
                            const artComptages = comptagesParCodeArticle(lg.code_article);
                            const nbComptages = comptagesData?.articles
                              .filter((a) => a.code_article === lg.code_article)
                              .reduce((sum, a) => sum + a.nb_comptages, 0);
                            return (
                              <Fragment key={lg.article_id}>
                                <tr className={rowCls}>
                                  <td className="px-3 py-2">
                                    <button
                                      onClick={() => handleToggleExpand(lg.article_id)}
                                      className="text-gray-400 hover:text-gray-700 text-xs leading-none"
                                      title={isExpanded ? "Replier" : "Voir les comptages"}
                                    >
                                      {isExpanded ? "▼" : "▶"}
                                    </button>
                                    {nbComptages !== undefined && (
                                      <span className="ml-1 text-xs text-gray-400">
                                        ({nbComptages})
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 font-mono">{lg.code_article}</td>
                                  <td
                                    className="px-3 py-2 max-w-[200px] truncate"
                                    title={lg.libelle}
                                  >
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
                                {isExpanded && (
                                  <tr>
                                    <td
                                      colSpan={7}
                                      className="px-5 py-3 bg-blue-50/40 border-b border-blue-100"
                                    >
                                      {!comptagesData ? (
                                        <p className="text-xs text-gray-400 italic">
                                          Chargement des comptages…
                                        </p>
                                      ) : artComptages.length === 0 ? (
                                        <p className="text-xs text-gray-400 italic">
                                          Aucun comptage enregistré
                                        </p>
                                      ) : (
                                        <table className="min-w-full text-xs mb-2">
                                          <thead>
                                            <tr className="text-gray-500 border-b border-gray-200">
                                              <th className="text-left pb-1 pr-6 font-medium">
                                                Source
                                              </th>
                                              <th className="text-left pb-1 pr-6 font-medium">
                                                Date
                                              </th>
                                              <th className="text-left pb-1 pr-4 font-medium">
                                                Commentaire
                                              </th>
                                              <th className="text-right pb-1 pr-4 font-medium">
                                                Qté
                                              </th>
                                              <th className="pb-1 w-6"></th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {artComptages.map((c) => (
                                              <tr
                                                key={c.id}
                                                className="border-t border-gray-100"
                                              >
                                                <td className="pr-6 py-1">
                                                  {c.saisie_admin ? (
                                                    <span className="text-purple-600 font-medium">
                                                      ✎ Admin
                                                    </span>
                                                  ) : (
                                                    <span className="text-gray-600">
                                                      {c.tablette_nom ?? "—"}
                                                    </span>
                                                  )}
                                                </td>
                                                <td className="pr-6 py-1 text-gray-500">
                                                  {new Date(c.counted_at).toLocaleString(
                                                    "fr-FR"
                                                  )}
                                                </td>
                                                <td className="pr-4 py-1 text-gray-500 text-xs italic max-w-[180px] truncate">
                                                  {c.commentaire || ""}
                                                </td>
                                                <td className="pr-4 py-1 text-right font-mono font-medium">
                                                  {c.quantite}
                                                </td>
                                                <td className="py-1 text-right">
                                                  {canEditComptages && (
                                                    <button
                                                      onClick={() =>
                                                        handleDeleteComptage(c.id)
                                                      }
                                                      className="text-red-400 hover:text-red-600"
                                                      title="Supprimer ce comptage"
                                                    >
                                                      ✕
                                                    </button>
                                                  )}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
                                      {canEditComptages && (
                                        <div className="flex items-center gap-2 pt-2 border-t border-blue-100">
                                          <span className="text-xs text-gray-500">
                                            Saisie admin :
                                          </span>
                                          <input
                                            type="number"
                                            min="0"
                                            step="any"
                                            placeholder="Quantité…"
                                            value={addQty[lg.article_id] ?? ""}
                                            onChange={(e) =>
                                              setAddQty((prev) => ({
                                                ...prev,
                                                [lg.article_id]: e.target.value,
                                              }))
                                            }
                                            className="border rounded px-2 py-1 text-xs w-28"
                                          />
                                          <button
                                            onClick={() =>
                                              handleAddAdminComptage(lg.article_id)
                                            }
                                            disabled={!addQty[lg.article_id]}
                                            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                          >
                                            + Ajouter
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}

                {/* ── Articles hors campagne ──────────────────────────────── */}
                {rapport && rapport.hors_campagne.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold text-orange-700 mb-2">
                      ⚠ Articles comptés hors campagne ({rapport.hors_campagne.length})
                    </h3>
                    <div className="overflow-hidden rounded-lg border border-orange-200">
                      <table className="min-w-full text-xs">
                        <thead className="bg-orange-50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-orange-700">Code article</th>
                            <th className="px-3 py-2 text-left font-medium text-orange-700">Libellé</th>
                            <th className="px-3 py-2 text-right font-medium text-orange-700">Qté comptée</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-orange-100">
                          {rapport.hors_campagne.map((hc) => (
                            <tr key={hc.article_id} className="bg-orange-50/30">
                              <td className="px-3 py-2 font-mono text-orange-800">{hc.code_article}</td>
                              <td className="px-3 py-2 text-gray-700">{hc.libelle}</td>
                              <td className="px-3 py-2 text-right font-medium">{hc.quantite_comptee}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Vue Articles ─────────────────────────────────────────────── */}
            {/* Actions articles (brouillon) */}
            {detailTab === "articles" && editable && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg space-y-2">
                {/* Étape 1 : recherche */}
                {!selectedGroup && (
                  <div className="flex gap-2 flex-wrap items-start">
                    <div className="flex-1 min-w-[260px] relative">
                      <input
                        type="text"
                        placeholder="Rechercher par code article ou libellé…"
                        value={articleSearch}
                        onChange={(e) => setArticleSearch(e.target.value)}
                        className="w-full border rounded px-3 py-1.5 text-sm"
                        autoComplete="off"
                      />
                      {articleSearch.trim() && (
                        <div className="absolute z-10 left-0 right-0 bg-white border rounded shadow-lg max-h-56 overflow-y-auto mt-1">
                          {articleSearchLoading && (
                            <p className="text-xs text-gray-400 px-3 py-2">Recherche…</p>
                          )}
                          {!articleSearchLoading && groupedArticleResults.length === 0 && (
                            <p className="text-xs text-gray-400 px-3 py-2">Aucun résultat</p>
                          )}
                          {groupedArticleResults.map((group) => {
                            const alreadyAll = group.articles.every((a) =>
                              selected.lignes.some((l) => l.article_id === a.id)
                            );
                            return (
                              <button
                                key={group.code_article}
                                disabled={alreadyAll}
                                onClick={() => {
                                  setSelectedGroup(group);
                                  setArticleSearch("");
                                  setArticleSearchResults([]);
                                }}
                                className="w-full text-left flex items-center justify-between px-3 py-2 border-b last:border-0 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-default"
                              >
                                <span>
                                  <span className="text-xs font-mono text-blue-700 font-medium">{group.code_article}</span>
                                  <span className="mx-1 text-gray-300">—</span>
                                  <span className="text-sm text-gray-800">{group.libelle}</span>
                                  {group.articles.length > 1 && (
                                    <span className="ml-2 text-xs text-gray-400">{group.articles.length} codes barres</span>
                                  )}
                                </span>
                                {alreadyAll && <span className="text-xs text-gray-400 ml-2">Déjà présent</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => { setShowImport(true); setImportResult(null); setImportError(""); }}
                      className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100 whitespace-nowrap"
                    >
                      Importer CSV / XLSX
                    </button>
                  </div>
                )}

                {/* Étape 2 : quantité + confirmation */}
                {selectedGroup && (
                  <div className="flex gap-2 flex-wrap items-center p-2 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-mono text-blue-700 font-semibold">{selectedGroup.code_article}</span>
                      <span className="mx-1 text-gray-400">—</span>
                      <span className="text-sm text-gray-800">{selectedGroup.libelle}</span>
                      {selectedGroup.articles.length > 1 && (
                        <span className="ml-2 text-xs text-gray-500">{selectedGroup.articles.length} codes barres</span>
                      )}
                    </div>
                    <input
                      type="number"
                      placeholder="Qté théorique"
                      value={addQt}
                      onChange={(e) => setAddQt(e.target.value)}
                      className="border rounded px-3 py-1.5 text-sm w-36"
                      min="0"
                      step="any"
                      autoFocus
                    />
                    <button
                      onClick={handleAddByCodeArticle}
                      className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Ajouter
                    </button>
                    <button
                      onClick={() => { setSelectedGroup(null); setAddQt(""); setAddError(""); }}
                      className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {addError && <p className="text-xs text-red-600">{addError}</p>}
              </div>
            )}

            {/* Table des lignes — groupée par code_article */}
            {detailTab === "articles" && (
              <div className="overflow-hidden rounded-lg border">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Code article", "Libellé", "Codes barres", "Unité", "Qté théorique", ""].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lignesGroupees.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                          Aucun article dans cette campagne
                        </td>
                      </tr>
                    )}
                    {lignesGroupees.map((groupe) => {
                      const first = groupe[0];
                      return (
                        <tr key={first.article.code_article}>
                          <td className="px-4 py-2 font-mono text-xs text-blue-700 font-medium">
                            {first.article.code_article}
                          </td>
                          <td className="px-4 py-2">{first.article.libelle}</td>
                          <td className="px-4 py-2 font-mono text-xs text-gray-500 space-y-0.5">
                            {groupe.map((l) => (
                              <div key={l.id}>{l.article.code_barre}</div>
                            ))}
                          </td>
                          <td className="px-4 py-2 text-gray-500">{first.article.unite ?? "—"}</td>
                          <td className="px-4 py-2 text-right">
                            {first.quantite_theorique != null ? first.quantite_theorique : "—"}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {editable && (
                              <button
                                onClick={() => handleRemoveCodeArticle(first.article.code_article)}
                                className="text-xs text-red-500 hover:underline"
                              >
                                Retirer
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {lignesGroupees.length > 0 && (
                  <div className="px-4 py-2 text-xs text-gray-400 border-t">
                    {lignesGroupees.length} article{lignesGroupees.length > 1 ? "s" : ""}
                    {selected.lignes.length !== lignesGroupees.length && (
                      <span className="ml-1 text-gray-300">({selected.lignes.length} codes barres)</span>
                    )}
                  </div>
                )}
              </div>
            )}
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
              <code className="bg-gray-100 px-1 rounded">code_article</code> (requis) et{" "}
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
