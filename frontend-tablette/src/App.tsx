import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import { useTokenRenewal } from "@/hooks/useTokenRenewal";
import SyncManager from "@/sync/SyncManager";
import LoginPage from "@/pages/LoginPage";
import PairingPage from "@/pages/PairingPage";
import DashboardPage from "@/pages/DashboardPage";
import CountPage from "@/pages/CountPage";
import SettingsPage from "@/pages/SettingsPage";
import OfflineUnlockPage from "@/pages/OfflineUnlockPage";
import OfflineBanner from "@/components/OfflineBanner";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const offlineSession = useAuthStore((s) => s.offlineSession);
  if (isAuthenticated || offlineSession) return <>{children}</>;
  if (!navigator.onLine) return <Navigate to="/offline-unlock" replace />;
  return <Navigate to="/login" replace />;
}

function RequirePaired({ children }: { children: React.ReactNode }) {
  const tablette_id = useAuthStore((s) => s.tablette_id);
  return tablette_id ? <>{children}</> : <Navigate to="/pair" replace />;
}

export default function App() {
  useTokenRenewal();

  useEffect(() => {
    SyncManager.getInstance().init();
    if ("storage" in navigator && navigator.storage.persist) {
      navigator.storage.persist();
    }
  }, []);

  return (
    <>
      <OfflineBanner />
      <Routes>
        <Route path="/pair" element={<PairingPage />} />
        <Route path="/login" element={<RequirePaired><LoginPage /></RequirePaired>} />
        <Route path="/offline-unlock" element={<RequirePaired><OfflineUnlockPage /></RequirePaired>} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/count"
          element={
            <RequireAuth>
              <CountPage />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <SettingsPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
