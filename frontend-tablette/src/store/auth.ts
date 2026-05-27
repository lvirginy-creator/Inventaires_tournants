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
      isAuthenticated: () => Boolean(get().accessToken),
    }),
    {
      name: "tablette-auth",
      // Ne pas persister le token — relogin requis après fermeture
      // Pour simplifier en V1, on persiste pour garder tablette_id
      partialize: (state) => ({ tablette_id: state.tablette_id }),
    }
  )
);
