import { useEffect, useState } from "react";

// Données du registre des copropriétés et estimations (public/bal-15e.json),
// chargées une fois puis gardées hors ligne par le service worker.
let promise = null;

export function useBalData() {
  const [data, setData] = useState(null);
  useEffect(() => {
    promise ??= fetch(`${import.meta.env.BASE_URL}bal-15e.json`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => {
        promise = null;
        return null;
      });
    let cancelled = false;
    promise.then((d) => !cancelled && setData(d));
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}
