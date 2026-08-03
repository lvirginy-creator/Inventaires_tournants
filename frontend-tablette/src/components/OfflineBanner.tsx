import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth";

export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const offlineSession = useAuthStore((s) => s.offlineSession);
  const navigate = useNavigate();

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (offlineSession && !offline) {
    return (
      <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-orange-500 text-white text-sm py-2 font-medium shadow-md">
        <span>🌐</span>
        <span>Réseau disponible —</span>
        <button
          onClick={() => navigate("/login")}
          className="underline font-semibold hover:text-orange-100"
        >
          reconnectez-vous
        </button>
        <span>pour synchroniser</span>
      </div>
    );
  }

  if (offlineSession && offline) {
    return (
      <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-orange-700 text-white text-sm py-2 font-medium shadow-md">
        <span>🔒</span>
        <span>Session hors ligne — reconnexion réseau requise pour synchroniser</span>
      </div>
    );
  }

  if (!offline) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-amber-500 text-white text-sm py-2 font-medium shadow-md">
      <span>⚡</span>
      <span>Mode hors-ligne — les comptages seront synchronisés à la reconnexion</span>
    </div>
  );
}
