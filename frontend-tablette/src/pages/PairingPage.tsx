import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/api/client";
import { useAuthStore } from "@/store/auth";

export default function PairingPage() {
  const navigate = useNavigate();
  const { setTabletteId } = useAuthStore();

  const [token, setToken] = useState("");
  const [nom, setNom] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim() || !nom.trim()) return;
    setError("");
    setLoading(true);

    try {
      const resp = await api.post<{
        tablette_id: string;
        magasin_id: string;
        magasin_nom: string;
        magasin_code: string;
      }>("/auth/tablette/appairer", {
        token: token.trim(),
        nom: nom.trim(),
      });

      setTabletteId(resp.data.tablette_id);
      navigate("/login", { replace: true });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data
        ?.detail;
      const msg = typeof detail === "string" ? detail : undefined;
      setError(msg ?? "Erreur lors de l'appairage");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-blue-900 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔗</div>
          <h1 className="text-2xl font-bold text-white">Appairage tablette</h1>
          <p className="text-blue-300 text-sm mt-1">Première mise en service</p>
        </div>

        <form onSubmit={handlePair} className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Token d'appairage
            </label>
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Token fourni par l'administrateur"
              className="w-full border rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="off"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">
              Généré depuis l'interface administrateur
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom de cette tablette
            </label>
            <input
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="ex: Tablette Dépôt 1"
              className="w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="off"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !token.trim() || !nom.trim()}
            className="w-full bg-blue-700 text-white font-semibold py-3 rounded-lg text-base hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {loading ? "Appairage…" : "Appairer la tablette"}
          </button>
        </form>
      </div>
    </div>
  );
}
