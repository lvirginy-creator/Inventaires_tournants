import { FormEvent, useEffect, useState } from "react";
import api from "@/api/client";
import type { Societe } from "@/types";

export default function SocietesPage() {
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState("");
  const [nom, setNom] = useState("");
  const [error, setError] = useState("");

  const load = () => api.get<Societe[]>("/societes").then((r) => setSocietes(r.data));

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/societes", { code, nom });
      setCode("");
      setNom("");
      setShowForm(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Erreur lors de la création");
    }
  };

  const toggleActif = async (s: Societe) => {
    await api.patch(`/societes/${s.id}`, { actif: !s.actif });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette société ?")) return;
    await api.delete(`/societes/${id}`);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Sociétés</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {showForm ? "Annuler" : "+ Nouvelle société"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-xl shadow p-6 mb-6 space-y-4 max-w-md"
        >
          <h2 className="font-semibold text-gray-800">Nouvelle société</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              maxLength={20}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              required
              maxLength={200}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
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
              <th className="px-4 py-3 text-left">Statut</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {societes.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-gray-700">{s.code}</td>
                <td className="px-4 py-3 text-gray-900">{s.nom}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleActif(s)}
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      s.actif
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {s.actif ? "Actif" : "Inactif"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
            {societes.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  Aucune société
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
