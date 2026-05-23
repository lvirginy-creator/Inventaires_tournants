import { FormEvent, useEffect, useState } from "react";
import api from "@/api/client";
import type { Magasin, Societe } from "@/types";

export default function MagasinsPage() {
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    societe_id: "",
    code: "",
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
        ...form,
        email_responsable: form.email_responsable || null,
      });
      setForm({
        societe_id: "",
        code: "",
        nom: "",
        email_responsable: "",
        password_operateur: "",
        password_responsable: "",
      });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Erreur lors de la création");
    }
  };

  const toggleActif = async (m: Magasin) => {
    await api.patch(`/magasins/${m.id}`, { actif: !m.actif });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce magasin ?")) return;
    await api.delete(`/magasins/${id}`);
    load();
  };

  const societeNom = (id: string) =>
    societes.find((s) => s.id === id)?.code ?? id.slice(0, 8);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Magasins</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {showForm ? "Annuler" : "+ Nouveau magasin"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-xl shadow p-6 mb-6 space-y-4 max-w-lg"
        >
          <h2 className="font-semibold text-gray-800">Nouveau magasin</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Société</label>
              <select
                value={form.societe_id}
                onChange={(e) => setForm({ ...form, societe_id: e.target.value })}
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
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                required
                maxLength={20}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
            <input
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
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
              value={form.email_responsable}
              onChange={(e) => setForm({ ...form, email_responsable: e.target.value })}
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
                value={form.password_operateur}
                onChange={(e) => setForm({ ...form, password_operateur: e.target.value })}
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
                value={form.password_responsable}
                onChange={(e) => setForm({ ...form, password_responsable: e.target.value })}
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

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Code</th>
              <th className="px-4 py-3 text-left">Nom</th>
              <th className="px-4 py-3 text-left">Société</th>
              <th className="px-4 py-3 text-left">Statut</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {magasins.map((m) => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-gray-700">{m.code}</td>
                <td className="px-4 py-3 text-gray-900">{m.nom}</td>
                <td className="px-4 py-3 text-gray-500">{societeNom(m.societe_id)}</td>
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
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
            {magasins.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
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
