import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TabletteAuth } from "@/types";

interface AuthState extends TabletteAuth {
  accessToken: string;
  offlineSession: boolean;
  setAuth: (auth: TabletteAuth & { access_token: string }) => void;
  setTabletteId: (tablette_id: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  enterOfflineSession: () => void;
  exitOfflineSession: () => void;
}

const EMPTY: TabletteAuth & { accessToken: string } = {
  tablette_id: "",
  access_token: "",
  accessToken: "",
  magasin_id: "",
  magasin_nom: "",
  session_id: "",
  role: "operateur",
};

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp && Date.now() / 1000 > payload.exp) return true;
  } catch {
    // token mal formé
  }
  return false;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...EMPTY,
      offlineSession: false,
      setAuth: (auth) =>
        set({
          tablette_id: auth.tablette_id,
          accessToken: auth.access_token,
          access_token: auth.access_token,
          magasin_id: auth.magasin_id,
          magasin_nom: auth.magasin_nom,
          session_id: auth.session_id,
          role: auth.role,
          offlineSession: false,
        }),
      setTabletteId: (tablette_id) => set({ tablette_id }),
      logout: () =>
        set((state) => ({ ...EMPTY, tablette_id: state.tablette_id, offlineSession: false })),
      isAuthenticated: () => {
        const token = get().accessToken;
        if (!token) return false;
        return !isTokenExpired(token);
      },
      enterOfflineSession: () => set({ offlineSession: true }),
      exitOfflineSession: () => set({ offlineSession: false }),
    }),
    {
      name: "tablette-auth",
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        if (version === 0) {
          const old = persistedState as { tablette_id?: string };
          return { ...EMPTY, tablette_id: old.tablette_id ?? "" };
        }
        return persistedState as Partial<AuthState>;
      },
      partialize: (state) => ({
        tablette_id: state.tablette_id,
        accessToken: state.accessToken,
        access_token: state.access_token,
        magasin_id: state.magasin_id,
        magasin_nom: state.magasin_nom,
        session_id: state.session_id,
        role: state.role,
        // offlineSession intentionally excluded — resets on each page load
      }),
    }
  )
);
