import { useEffect, useState } from "react";
import api from "@/api/client";
import type { Magasin, Tablette, TokenAppairage } from "@/types";

export default function TablettesPage() {
  const [tablettes, setTablEttes] = useState<Tablette[]>([]);
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [token, setToken] = useState<TokenAppairage | null>(null);
  const [selectedMagasin, setSelectedMagasin] = useState("");
  const [error, setError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const load = () =>
    Promise.all([api.get<Tablette[]>("/tablettes"), api.get<Magasin[]>("/magasins")]).then(
      ([t, m]) => {
        setTablEttes(t.data);
        setMagasins(m.data.filter((mg) => mg.actif));
      },
    );

  useEffect(() => {
    load();
  }, []);

  const handleGenerateToken = async () => {
    if (!selectedMagasin) return;
    setError("");
    try {
      const { data } = await api.post<TokenAppairage>("/tablettes/tokens-appairage", {
        magasin_id: selectedMagasin,
      });
      setToken(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Erreur");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette tablette ?")) return;
    setDeleteError("");
    try {
      await api.delete(`/tablettes/${id}`);
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setDeleteError(msg ?? "Erreur lors de la suppression");
    }
  };

  const magasinNom = (id: string) => {
    const m = magasins.find((mg) => mg.id === id);
    return m ? `${m.code} — ${m.nom}` : id.slice(0, 8);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Tablettes</h1>

      <div className="bg-white rounded-xl shadow p-6 mb-6 max-w-lg space-y-4">
        <h2 className="font-semibold text-gray-800">Générer un token d'appairage</h2>
        <div className="flex gap-3">
          <select
            value={selectedMagasin}
            onChange={(e) => setSelectedMagasin(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Choisir un magasin…</option>
            {magasins.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} — {m.nom}
              </option>
            ))}
          </select>
          <button
            onClick={handleGenerateToken}
            disabled={!selectedMagasin}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            Générer
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {token && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-xs text-blue-600 font-medium mb-1">Token d'appairage (valable 24h)</p>
            <p className="font-mono text-sm text-blue-900 break-all">{token.token}</p>
            <p className="text-xs text-blue-500 mt-1">
              Expire le {new Date(token.expires_at).toLocaleString("fr-FR")}
            </p>
          </div>
        )}
      </div>

      {deleteError && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2 mb-4">{deleteError}</p>
      )}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Nom</th>
              <th className="px-4 py-3 text-left">Magasin</th>
              <th className="px-4 py-3 text-left">Device ID</th>
              <th className="px-4 py-3 text-left">Dernière sync</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tablettes.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-900">{t.nom}</td>
                <td className="px-4 py-3 text-gray-500">{magasinNom(t.magasin_id)}</td>
                <td className="px-4 py-3 font-mono text-gray-400 text-xs">
                  {t.device_id ?? "—"}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {t.derniere_sync
                    ? new Date(t.derniere_sync).toLocaleString("fr-FR")
                    : "Jamais"}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
            {tablettes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  Aucune tablette appairée
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
