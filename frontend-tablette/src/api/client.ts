import axios from "axios";
import { useAuthStore } from "@/store/auth";

const api = axios.create({
  baseURL: "/api/v1",
  timeout: 15000,
});

// Injecter le JWT à chaque requête
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Sur 401 : déconnecter (sauf en session hors-ligne où le token n'est pas utilisé)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      const state = useAuthStore.getState();
      if (!state.offlineSession) {
        state.logout();
      }
    }
    return Promise.reject(err);
  }
);

export default api;
