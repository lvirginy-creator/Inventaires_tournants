import { FormEvent, useEffect, useState } from "react";
import api from "@/api/client";
import type { Magasin, Societe } from "@/types";

type EditForm = {
  societe_id: string;
  nom: string;
  email_responsable: string;
  password_operateur: string;
  password_responsable: string;
};

export default function MagasinsPage() {
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editError, setEditError] = useState("");
  const [createForm, setCreateForm] = useState({
    societe_id: "",
    code: "",
    nom: "",
    email_responsable: "",
    password_operateur: "",
    password_responsable: "",
  });
  const [editForm, setEditForm] = useState<EditForm>({
    societe_id: "",
    nom: "",
    email_responsable: "",
    password_operateur: "",
    password_responsable: "",
  });

  const load = () =>
    Promise.all([
      api.get<Magasin[]>("/magasins"),
      api.get<Societe[]>("/societes"),
    ]).then(([m, s]) => {
      setMagasins(m.data);
      setSocietes(s.data.filter((s) => s.actif));
    });

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/magasins", {
        ...createForm,
        email_responsable: createForm.email_responsable || null,
      });
      setCreateForm({
        societe_id: "",
        code: "",
        nom: "",
        email_responsable: "",
        password_operateur: "",
        password_responsable: "",
      });
      setShowCreate(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Erreur lors de la création");
    }
  };

  const startEdit = (m: Magasin) => {
    setEditingId(m.id);
    setEditForm({
      societe_id: m.societe_id,
      nom: m.nom,
      email_responsable: m.email_responsable ?? "",
      password_operateur: "",
      password_responsable: "",
    });
    setEditError("");
  };

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setEditError("");
    try {
      const payload: Record<string, unknown> = {
        societe_id: editForm.societe_id || undefined,
        nom: editForm.nom,
        email_responsable: editForm.email_responsable || null,
      };
      if (editForm.password_operateur) payload.password_operateur = editForm.password_operateur;
      if (editForm.password_responsable) payload.password_responsable = editForm.password_responsable;
      await api.patch(`/magasins/${editingId}`, payload);
      setEditingId(null);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setEditError(msg ?? "Erreur lors de la mise à jour");
    }
  };

  const toggleActif = async (m: Magasin) => {
    await api.patch(`/magasins/${m.id}`, { actif: !m.actif });
    load();
  };

  const [deleteError, setDeleteError] = useState("");

  const handleDelete = async (id: string, nom: string) => {
    if (!confirm(`Supprimer le magasin "${nom}" ? Cette action est irréversible.`)) return;
    setDeleteError("");
    try {
      await api.delete(`/magasins/${id}`);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setDeleteError(msg ?? "Erreur lors de la suppression");
    }
  };

  const handleForceDelete = async (id: string, nom: string) => {
    if (!confirm(`⚠ SUPPRESSION FORCÉE du magasin "${nom}"\n\nToutes les données seront définitivement supprimées :\n• Tablettes et sessions\n• Campagnes et leurs articles\n• Tous les comptages\n\nCette action est IRRÉVERSIBLE. Confirmer ?`)) return;
    if (!confirm(`Dernière confirmation : supprimer définitivement "${nom}" et toutes ses données ?`)) return;
    setDeleteError("");
    try {
      await api.delete(`/magasins/${id}?force=true`);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setDeleteError(msg ?? "Erreur lors de la suppression forcée");
    }
  };

  const societeNom = (id: string) =>
    societes.find((s) => s.id === id)?.code ?? id.slice(0, 8);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Magasins</h1>
        <button
          onClick={() => { setShowCreate((v) => !v); setError(""); }}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {showCreate ? "Annuler" : "+ Nouveau magasin"}
        </button>
      </div>

      {/* ── Formulaire de création ─────────────────────────────────────────── */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-xl shadow p-6 mb-6 space-y-4 max-w-lg"
        >
          <h2 className="font-semibold text-gray-800">Nouveau magasin</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Société</label>
              <select
                value={createForm.societe_id}
                onChange={(e) => setCreateForm({ ...createForm, societe_id: e.target.value })}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Choisir…</option>
                {societes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.nom}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
              <input
                value={createForm.code}
                onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
                required
                maxLength={20}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
            <input
              value={createForm.nom}
              onChange={(e) => setCreateForm({ ...createForm, nom: e.target.value })}
              required
              maxLength={200}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email responsable (optionnel)
            </label>
            <input
              type="email"
              value={createForm.email_responsable}
              onChange={(e) => setCreateForm({ ...createForm, email_responsable: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mot de passe opérateur
              </label>
              <input
                type="password"
                value={createForm.password_operateur}
                onChange={(e) => setCreateForm({ ...createForm, password_operateur: e.target.value })}
                required
                minLength={6}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mot de passe responsable
              </label>
              <input
                type="password"
                value={createForm.password_responsable}
                onChange={(e) => setCreateForm({ ...createForm, password_responsable: e.target.value })}
                required
                minLength={6}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            Créer
          </button>
        </form>
      )}

      {deleteError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {deleteError}
        </div>
      )}

      {/* ── Liste des magasins ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Code</th>
              <th className="px-4 py-3 text-left">Nom</th>
              <th className="px-4 py-3 text-left">Société</th>
              <th className="px-4 py-3 text-left">Email responsable</th>
              <th className="px-4 py-3 text-left">Statut</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {magasins.map((m) => (
              <>
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-700">{m.code}</td>
                  <td className="px-4 py-3 text-gray-900 font-medium">{m.nom}</td>
                  <td className="px-4 py-3 text-gray-500">{societeNom(m.societe_id)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {m.email_responsable ?? <span className="italic text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActif(m)}
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        m.actif
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {m.actif ? "Actif" : "Inactif"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right space-x-3 whitespace-nowrap">
                    <button
                      onClick={() => editingId === m.id ? setEditingId(null) : startEdit(m)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      {editingId === m.id ? "Annuler" : "Modifier"}
                    </button>
                    <button
                      onClick={() => handleDelete(m.id, m.nom)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Supprimer
                    </button>
                    <button
                      onClick={() => handleForceDelete(m.id, m.nom)}
                      className="text-xs text-red-800 hover:text-red-900 font-semibold"
                      title="Supprime le magasin et toutes ses données (tablettes, campagnes, comptages)"
                    >
                      ⚠ Forcer
                    </button>
                  </td>
                </tr>

                {/* ── Formulaire d'édition inline ──────────────────────────── */}
                {editingId === m.id && (
                  <tr key={`edit-${m.id}`}>
                    <td colSpan={6} className="px-6 py-4 bg-blue-50 border-b border-blue-100">
                      <form onSubmit={handleEdit} className="space-y-3 max-w-xl">
                        <p className="text-sm font-semibold text-blue-800">Modifier {m.nom}</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Société</label>
                            <select
                              value={editForm.societe_id}
                              onChange={(e) => setEditForm({ ...editForm, societe_id: e.target.value })}
                              required
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                            >
                              <option value="">Choisir…</option>
                              {societes.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.code} — {s.nom}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Nom</label>
                            <input
                              value={editForm.nom}
                              onChange={(e) => setEditForm({ ...editForm, nom: e.target.value })}
                              required
                              maxLength={200}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Email responsable
                          </label>
                          <input
                            type="email"
                            value={editForm.email_responsable}
                            onChange={(e) => setEditForm({ ...editForm, email_responsable: e.target.value })}
                            placeholder="email@exemple.fr"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Nouveau mdp opérateur <span className="text-gray-400">(laisser vide = inchangé)</span>
                            </label>
                            <input
                              type="password"
                              value={editForm.password_operateur}
                              onChange={(e) => setEditForm({ ...editForm, password_operateur: e.target.value })}
                              minLength={editForm.password_operateur ? 6 : undefined}
                              placeholder="••••••"
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Nouveau mdp responsable <span className="text-gray-400">(laisser vide = inchangé)</span>
                            </label>
                            <input
                              type="password"
                              value={editForm.password_responsable}
                              onChange={(e) => setEditForm({ ...editForm, password_responsable: e.target.value })}
                              minLength={editForm.password_responsable ? 6 : undefined}
                              placeholder="••••••"
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                            />
                          </div>
                        </div>
                        {editError && <p className="text-sm text-red-600">{editError}</p>}
                        <button
                          type="submit"
                          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
                        >
                          Enregistrer
                        </button>
                      </form>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {magasins.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  Aucun magasin
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
