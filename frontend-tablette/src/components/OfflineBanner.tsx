import { useEffect, useState } from "react";

/**
 * Bannière fixe affichée en haut de l'écran quand la tablette perd la connexion.
 * Les comptages continuent de fonctionner grâce à Dexie (mode offline-first).
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

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

  if (!offline) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-amber-500 text-white text-sm py-2 font-medium shadow-md">
      <span>⚡</span>
      <span>Mode hors-ligne — les comptages seront synchronisés à la reconnexion</span>
    </div>
  );
}
