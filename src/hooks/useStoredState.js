import { useEffect, useState } from "react";

// useState mémorisé dans le navigateur (type et filtre retrouvés à la
// réouverture). Le stockage peut être indisponible (navigation privée) :
// on retombe alors sur la valeur par défaut.
export function useStoredState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? initialValue : JSON.parse(stored);
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // stockage indisponible : la valeur reste valable pour la session
    }
  }, [key, value]);

  return [value, setValue];
}
