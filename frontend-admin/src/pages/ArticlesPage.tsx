import { useEffect, useRef, useState } from "react";
import api from "@/api/client";
import type { Article, ArticleImportResponse, Societe } from "@/types";

// ── Formulaire de création ─────────────────────────────────────────────────────

interface CreateForm {
  societe_id: string;
  code_barre: string;
  code_article: string;
  libelle: string;
  unite: string;
}

const emptyForm: CreateForm = {
  societe_id: "",
  code_barre: "",
  code_article: "",
  libelle: "",
  unite: "",
};

// ── Composant principal ────────────────────────────────────────────────────────

export default function ArticlesPage() {
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);

  // Filtres
  const [filterSociete, setFilterSociete] = useState("");
  const [filterActif, setFilterActif] = useState<"true" | "false" | "">("");
  const [search, setSearch] = useState("");

  // Modal création
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyForm);
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  // Modal import
  const [showImport, setShowImport] = useState(false);
  const [importSociete, setImportSociete] = useState("");
  const [importResult, setImportResult] = useState<ArticleImportResponse | null>(null);
  const [importError, setImportError] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chargement sociétés
  useEffect(() => {
    api.get<Societe[]>("/societes").then((r) => {
      setSocietes(r.data.filter((s) => s.actif));
    });
  }, []);

  // Chargement articles
  const fetchArticles = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterSociete) params.set("societe_id", filterSociete);
    if (filterActif) params.set("actif", filterActif);
    if (search) params.set("q", search);
    params.set("limit", "200");
    try {
      const r = await api.get<Article[]>(`/articles?${params}`);
      setArticles(r.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArticles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSociete, filterActif, search]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleDeactivate = async (a: Article) => {
    if (!confirm(`Désactiver « ${a.libelle} » ?`)) return;
    await api.delete(`/articles/${a.id}`);
    fetchArticles();
  };

  const handleActivate = async (a: Article) => {
    await api.patch(`/articles/${a.id}`, { actif: true });
    fetchArticles();
  };

  const handleCreate = async () => {
    setCreateError("");
    setCreateLoading(true);
    try {
      await api.post("/articles", {
        ...createForm,
        unite: createForm.unite || null,
      });
      setShowCreate(false);
      setCreateForm(emptyForm);
      fetchArticles();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Erreur lors de la création";
      setCreateError(msg);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleImport = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !importSociete) return;
    setImportError("");
    setImportResult(null);
    setImportLoading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const r = await api.post<ArticleImportResponse>(
        `/articles/import?societe_id=${importSociete}`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setImportResult(r.data);
      fetchArticles();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Erreur lors de l'import";
      setImportError(msg);
    } finally {
      setImportLoading(false);
    }
  };

  // ── Rendu ────────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Articles</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowImport(true); setImportResult(null); setImportError(""); }}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700"
          >
            Importer CSV / XLSX
          </button>
          <button
            onClick={() => { setShowCreate(true); setCreateError(""); }}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            + Nouvel article
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filterSociete}
          onChange={(e) => setFilterSociete(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
        >
          <option value="">Toutes les sociétés</option>
          {societes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </select>
        <select
          value={filterActif}
          onChange={(e) => setFilterActif(e.target.value as "true" | "false" | "")}
          className="border rounded px-3 py-2 text-sm"
        >
          <option value="">Actifs + inactifs</option>
          <option value="true">Actifs uniquement</option>
          <option value="false">Inactifs uniquement</option>
        </select>
        <input
          type="text"
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded px-3 py-2 text-sm flex-1 min-w-[200px]"
        />
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Code barre", "Code article", "Libellé", "Unité", "Statut", ""].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  Chargement…
                </td>
              </tr>
            )}
            {!loading && articles.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  Aucun article trouvé
                </td>
              </tr>
            )}
            {articles.map((a) => (
              <tr key={a.id} className={!a.actif ? "opacity-50 bg-gray-50" : ""}>
                <td className="px-4 py-3 font-mono">{a.code_barre}</td>
                <td className="px-4 py-3 font-mono">{a.code_article}</td>
                <td className="px-4 py-3 font-medium">{a.libelle}</td>
                <td className="px-4 py-3 text-gray-500">{a.unite ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      a.actif ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    }`}
                  >
                    {a.actif ? "Actif" : "Inactif"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {a.actif ? (
                    <button
                      onClick={() => handleDeactivate(a)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Désactiver
                    </button>
                  ) : (
                    <button
                      onClick={() => handleActivate(a)}
                      className="text-xs text-green-600 hover:underline"
                    >
                      Réactiver
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {articles.length > 0 && (
          <div className="px-4 py-2 text-xs text-gray-400 border-t">
            {articles.length} article{articles.length > 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* ── Modal création ──────────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">Nouvel article</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Société *</label>
                <select
                  value={createForm.societe_id}
                  onChange={(e) => setCreateForm({ ...createForm, societe_id: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  <option value="">Sélectionner…</option>
                  {societes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nom}
                    </option>
                  ))}
                </select>
              </div>
              {(
                [
                  ["code_barre", "Code barre *"],
                  ["code_article", "Code article *"],
                  ["libelle", "Libellé *"],
                  ["unite", "Unité (optionnel)"],
                ] as [keyof CreateForm, string][]
              ).map(([field, label]) => (
                <div key={field}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input
                    type="text"
                    value={createForm[field]}
                    onChange={(e) => setCreateForm({ ...createForm, [field]: e.target.value })}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
              ))}
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
                disabled={createLoading}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {createLoading ? "Création…" : "Créer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal import ────────────────────────────────────────────────────── */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-bold mb-4">Import CSV / XLSX</h2>
            <p className="text-sm text-gray-500 mb-4">
              Colonnes requises : <code className="bg-gray-100 px-1 rounded">code_barre</code>,{" "}
              <code className="bg-gray-100 px-1 rounded">code_article</code>,{" "}
              <code className="bg-gray-100 px-1 rounded">libelle</code>. Optionnel :{" "}
              <code className="bg-gray-100 px-1 rounded">unite</code>. Les articles existants
              (même code barre + société) seront mis à jour.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Société *</label>
                <select
                  value={importSociete}
                  onChange={(e) => setImportSociete(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  <option value="">Sélectionner…</option>
                  {societes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fichier CSV ou XLSX *
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx"
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
            </div>

            {importError && (
              <p className="mt-3 text-sm text-red-600 bg-red-50 rounded p-2">{importError}</p>
            )}

            {importResult && (
              <div className="mt-3 bg-green-50 rounded p-3 text-sm">
                <p className="font-medium text-green-800">Import terminé</p>
                <p className="text-green-700">
                  {importResult.created} créé{importResult.created > 1 ? "s" : ""} ·{" "}
                  {importResult.updated} mis à jour
                </p>
                {importResult.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-orange-600 font-medium">
                      {importResult.errors.length} erreur{importResult.errors.length > 1 ? "s" : ""}
                    </summary>
                    <ul className="mt-1 space-y-1 text-orange-700 text-xs">
                      {importResult.errors.map((e, i) => (
                        <li key={i}>• {e}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowImport(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:underline"
              >
                Fermer
              </button>
              <button
                onClick={handleImport}
                disabled={importLoading || !importSociete}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                {importLoading ? "Import en cours…" : "Lancer l'import"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
