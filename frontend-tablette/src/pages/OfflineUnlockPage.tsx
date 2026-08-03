import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import { verifyAuthLocal, hasAuthLocal } from "@/db/authLocal";

export default function OfflineUnlockPage() {
  const navigate = useNavigate();
  const { enterOfflineSession, magasin_nom } = useAuthStore();

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [noVerifier, setNoVerifier] = useState<boolean | null>(null); // null = checking

  useEffect(() => {
    if (navigator.onLine) {
      navigate("/login", { replace: true });
      return;
    }
    hasAuthLocal().then((has) => setNoVerifier(!has));
  }, [navigate]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setError("");
    setLoading(true);
    try {
      const ok = await verifyAuthLocal(password);
      if (ok) {
        enterOfflineSession();
        navigate("/", { replace: true });
      } else {
        setError("Mot de passe incorrect");
      }
    } finally {
      setLoading(false);
    }
  };

  if (noVerifier === null) {
    return (
      <div className="min-h-screen bg-orange-900 flex items-center justify-center">
        <p className="text-orange-200 text-sm">Vérification…</p>
      </div>
    );
  }

  if (noVerifier) {
    return (
      <div className="min-h-screen bg-blue-900 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="text-5xl mb-4">📡</div>
          <h1 className="text-xl font-bold text-white mb-3">Connexion réseau requise</h1>
          <p className="text-blue-300 text-sm leading-relaxed">
            Le déblocage hors ligne n&apos;est pas disponible sur cette tablette.
            Connectez-vous au réseau Wi-Fi pour vous authentifier.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-orange-800 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔒</div>
          <h1 className="text-2xl font-bold text-white">Session hors ligne</h1>
          <p className="text-orange-200 text-sm mt-1">
            {magasin_nom ? `${magasin_nom} — ` : ""}
            Entrez votre mot de passe pour continuer
          </p>
        </div>

        <form onSubmit={handleUnlock} className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe magasin"
              className="w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
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
            className="w-full bg-orange-700 text-white font-semibold py-3 rounded-lg text-base hover:bg-orange-800 disabled:opacity-50 transition-colors"
          >
            {loading ? "Vérification…" : "Déverrouiller"}
          </button>
        </form>

        <p className="text-center text-xs text-orange-300 mt-4">
          Les synchronisations seront effectuées à la reconnexion au réseau
        </p>
      </div>
    </div>
  );
}
