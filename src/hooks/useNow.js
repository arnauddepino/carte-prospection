import { useEffect, useState } from "react";

const ONE_HOUR = 60 * 60 * 1000;

// Date courante, rafraîchie toutes les heures et au retour sur l'appli
// (téléphone sorti de veille), pour que les couleurs suivent le temps qui passe.
export function useNow() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    const timer = setInterval(tick, ONE_HOUR);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return now;
}
