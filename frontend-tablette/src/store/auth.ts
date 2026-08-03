import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TabletteAuth } from "@/types";

interface AuthState extends TabletteAuth {
  accessToken: string;
  setAuth: (auth: TabletteAuth & { access_token: string }) => void;
  setTabletteId: (tablette_id: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
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
      setAuth: (auth) =>
        set({
          tablette_id: auth.tablette_id,
          accessToken: auth.access_token,
          access_token: auth.access_token,
          magasin_id: auth.magasin_id,
          magasin_nom: auth.magasin_nom,
          session_id: auth.session_id,
          role: auth.role,
        }),
      setTabletteId: (tablette_id) => set({ tablette_id }),
      logout: () =>
        set((state) => ({ ...EMPTY, tablette_id: state.tablette_id })),
      isAuthenticated: () => {
        const token = get().accessToken;
        if (!token) return false;
        return !isTokenExpired(token);
      },
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
      }),
    }
  )
);
