import { useEffect, useState } from "react";

// Fichiers de données fixes (public/), chargés une fois puis gardés hors
// ligne par le service worker. null tant qu'ils ne sont pas arrivés.
const promises = new Map();

function useStaticJson(file) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!promises.has(file)) {
      promises.set(
        file,
        fetch(`${import.meta.env.BASE_URL}${file}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => {
            promises.delete(file); // nouvel essai possible
            return null;
          })
      );
    }
    let cancelled = false;
    promises.get(file).then((d) => !cancelled && setData(d));
    return () => {
      cancelled = true;
    };
  }, [file]);
  return data;
}

// Registre des copropriétés et estimations du nombre de boîtes aux lettres.
export const useBalData = () => useStaticJson("bal-15e.json");

// Adresses de chaque bâtiment (Base Adresse Nationale + cadastre).
export const useAdressesData = () => useStaticJson("adresses-15e.json");
