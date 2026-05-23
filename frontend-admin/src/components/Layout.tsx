import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import api from "@/api/client";

const navItems = [
  { to: "/", label: "Tableau de bord", end: true },
  { to: "/societes", label: "Sociétés" },
  { to: "/magasins", label: "Magasins" },
  { to: "/tablettes", label: "Tablettes" },
  { to: "/utilisateurs", label: "Utilisateurs" },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await api.post("/auth/admin/logout");
    } finally {
      logout();
      navigate("/login");
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="px-6 py-5 border-b border-gray-700">
          <Link to="/" className="text-lg font-bold text-white">
            Inventaires G2C
          </Link>
          <p className="text-xs text-gray-400 mt-1">Administration</p>
        </div>
        <nav className="flex-1 px-4 py-4 space-y-1">
          {navItems.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
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
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
