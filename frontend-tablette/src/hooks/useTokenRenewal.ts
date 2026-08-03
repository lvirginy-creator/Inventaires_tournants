import { useEffect } from "react";
import api from "@/api/client";
import { useAuthStore } from "@/store/auth";

const RENEWAL_THRESHOLD_S = 24 * 3600;
const TOKEN_LIFETIME_S = 7 * 24 * 3600;

function getTokenAge(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (!payload.exp) return null;
    const issuedAt = payload.exp - TOKEN_LIFETIME_S;
    return Date.now() / 1000 - issuedAt;
  } catch {
    return null;
  }
}

export function useTokenRenewal() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    if (!accessToken) return;

    const ageSeconds = getTokenAge(accessToken);
    if (ageSeconds === null || ageSeconds < RENEWAL_THRESHOLD_S) return;

    api
      .post("/auth/tablette/renouveler")
      .then((res) => {
        const d = res.data;
        setAuth({
          tablette_id: d.tablette_id,
          access_token: d.access_token,
          magasin_id: d.magasin_id,
          magasin_nom: d.magasin_nom,
          session_id: d.session_id,
          role: d.role,
        });
      })
      .catch(() => {
        // Echec silencieux (hors ligne ou session révoquée)
      });
  }, [accessToken]);
}
