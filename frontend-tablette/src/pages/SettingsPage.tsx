import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import { useSyncStore } from "@/store/sync";
import api from "@/api/client";
import { clearAuthLocal } from "@/db/authLocal";

export default function SettingsPage() {
  const navigate = useNavigate();
  const { magasin_nom, role, tablette_id, logout } = useAuthStore();
  const { lastSyncAt, pendingCount } = useSyncStore();

  const handleLogout = async () => {
    try {
      await api.post("/auth/tablette/logout");
    } finally {
      await clearAuthLocal();
      logout();
      navigate("/login", { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-blue-900 text-white px-5 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate("/")}
          className="text-blue-300 hover:text-white text-2xl"
          aria-label="Retour"
        >
          ←
        </button>
        <h1 className="text-lg font-bold">Paramètres</h1>
      </header>

      <main className="flex-1 p-5 space-y-4">
        {/* Infos tablette */}
        <div className="bg-white rounded-2xl shadow p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Informations tablette
          </h2>
          <InfoRow label="Magasin" value={magasin_nom || "—"} />
          <InfoRow
            label="Rôle"
            value={role === "responsable_depot" ? "Responsable dépôt" : "Opérateur"}
          />
          <InfoRow
            label="ID tablette"
            value={tablette_id || "—"}
            mono
          />
          <InfoRow
            label="Dernière sync"
            value={lastSyncAt ? new Date(lastSyncAt).toLocaleString("fr-FR") : "Jamais"}
          />
          {pendingCount > 0 && (
            <InfoRow
              label="En attente de sync"
              value={`${pendingCount} comptage${pendingCount > 1 ? "s" : ""}`}
              warn
            />
          )}
        </div>

        {/* Version */}
        <div className="bg-white rounded-2xl shadow p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Application
          </h2>
          <InfoRow label="Version" value="0.2.0" />
        </div>
      </main>

      {/* Déconnexion */}
      <div className="p-5">
        <button
          onClick={handleLogout}
          className="w-full bg-red-600 text-white font-semibold py-4 rounded-2xl text-base hover:bg-red-700 active:scale-95 transition-transform"
        >
          Se déconnecter
        </button>
        {pendingCount > 0 && (
          <p className="text-xs text-orange-500 text-center mt-2">
            ⚠ {pendingCount} comptage{pendingCount > 1 ? "s" : ""} non synchronisé
            {pendingCount > 1 ? "s" : ""} — synchronisez avant de vous déconnecter
          </p>
        )}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
  warn = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-sm text-gray-500 flex-shrink-0">{label}</span>
      <span
        className={`text-sm text-right break-all ${
          mono ? "font-mono" : "font-medium"
        } ${warn ? "text-orange-600" : "text-gray-900"}`}
      >
        {value}
      </span>
    </div>
  );
}
