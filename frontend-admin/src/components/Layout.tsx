import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import api from "@/api/client";

const navItems = [
  { to: "/", label: "Tableau de bord", end: true },
  { to: "/societes", label: "Sociétés" },
  { to: "/magasins", label: "Magasins" },
  { to: "/tablettes", label: "Tablettes" },
  { to: "/utilisateurs", label: "Utilisateurs" },
  { to: "/articles", label: "Articles" },
  { to: "/campagnes", label: "Campagnes" },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await api.post("/auth/admin/logout");
    } finally {
      logout();
      navigate("/login");
    }
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 w-64 bg-gray-900 text-white flex flex-col
          transform transition-transform duration-200
          md:relative md:translate-x-0 md:flex
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="px-6 py-5 border-b border-gray-700 flex items-center justify-between">
          <div>
            <Link to="/" className="text-lg font-bold text-white" onClick={closeSidebar}>
              Inventaires G2C
            </Link>
            <p className="text-xs text-gray-400 mt-1">Administration</p>
          </div>
          <button
            className="md:hidden text-gray-400 hover:text-white text-xl"
            onClick={closeSidebar}
            aria-label="Fermer le menu"
          >
            ✕
          </button>
        </div>
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={closeSidebar}
              className={({ isActive }) =>
                `block px-3 py-2 rounded text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-gray-700 hover:text-white"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-gray-700">
          <p className="text-xs text-gray-400 truncate">{user?.email}</p>
          <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
          <button
            onClick={handleLogout}
            className="mt-2 w-full text-left text-xs text-gray-400 hover:text-white transition-colors"
          >
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Contenu principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Barre mobile avec hamburger */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-gray-900 text-white flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-300 hover:text-white text-xl leading-none"
            aria-label="Ouvrir le menu"
          >
            ☰
          </button>
          <span className="font-bold text-sm">Inventaires G2C</span>
        </div>

        <main className="flex-1 overflow-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
