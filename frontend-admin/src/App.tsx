import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import LoginPage from "@/pages/LoginPage";
import Layout from "@/components/Layout";
import DashboardPage from "@/pages/DashboardPage";
import SocietesPage from "@/pages/SocietesPage";
import MagasinsPage from "@/pages/MagasinsPage";
import TablettesPage from "@/pages/TablettesPage";
import UtilisateursPage from "@/pages/UtilisateursPage";
import ArticlesPage from "@/pages/ArticlesPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="societes" element={<SocietesPage />} />
        <Route path="magasins" element={<MagasinsPage />} />
        <Route path="tablettes" element={<TablettesPage />} />
        <Route path="utilisateurs" element={<UtilisateursPage />} />
        <Route path="articles" element={<ArticlesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
