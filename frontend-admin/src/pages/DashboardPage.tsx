import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/api/client";

interface Stats {
  societes: number;
  magasins: number;
  tablettes: number;
  utilisateurs: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    Promise.all([
      api.get("/societes"),
      api.get("/magasins"),
      api.get("/tablettes"),
      api.get("/utilisateurs"),
    ]).then(([s, m, t, u]) => {
      setStats({
        societes: s.data.length,
        magasins: m.data.length,
        tablettes: t.data.length,
        utilisateurs: u.data.length,
      });
    });
  }, []);

  const cards = [
    { label: "Sociétés", value: stats?.societes, to: "/societes" },
    { label: "Magasins", value: stats?.magasins, to: "/magasins" },
    { label: "Tablettes", value: stats?.tablettes, to: "/tablettes" },
    { label: "Utilisateurs", value: stats?.utilisateurs, to: "/utilisateurs" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Tableau de bord</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, to }) => (
          <Link
            key={to}
            to={to}
            className="bg-white rounded-xl shadow p-6 hover:shadow-md transition-shadow"
          >
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {value ?? "—"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
