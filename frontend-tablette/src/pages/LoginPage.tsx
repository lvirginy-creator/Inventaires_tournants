import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "@/api/client";
import { useAuthStore } from "@/store/auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const { tablette_id: storedId, setAuth } = useAuthStore();

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storedId || !password) return;
    setError("");
    setLoading(true);

    try {
      const resp = await api.post<{
        access_token: string;
        tablette_id: string;
        magasin_id: string;
        magasin_nom: string;
        session_id: string;
        role: "operateur" | "responsable_depot";
      }>("/auth/tablette/login", {
        tablette_id: storedId,
        password,
      });

      setAuth({
        tablette_id: resp.data.tablette_id,
        access_token: resp.data.access_token,
        magasin_id: resp.data.magasin_id,
        magasin_nom: resp.data.magasin_nom,
        session_id: resp.data.session_id,
        role: resp.data.role,
      });
      navigate("/", { replace: true });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data
        ?.detail;
      const msg = typeof detail === "string" ? detail : undefined;
      setError(msg ?? "Identifiants incorrects");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-blue-900 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo / titre */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📦</div>
          <h1 className="text-2xl font-bold text-white">Inventaire G2C</h1>
          <p className="text-blue-300 text-sm mt-1">Connexion tablette</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
          {/* Tablette ID (lecture seule) */}
          <div className="bg-gray-50 rounded-lg px-4 py-3">
            <p className="text-xs text-gray-500 font-medium mb-0.5">Tablette appairée</p>
            <p className="text-xs font-mono text-gray-700 break-all">{storedId}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe magasin"
              className="w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="current-password"
              autoFocus
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-blue-700 text-white font-semibold py-3 rounded-lg text-base hover:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>

        <p className="text-center text-xs text-blue-400 mt-4">
          Mauvaise tablette ?{" "}
          <Link to="/pair" className="text-blue-200 underline">
            Réappairer
          </Link>
        </p>
      </div>
    </div>
  );
}
