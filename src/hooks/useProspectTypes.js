import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { readJson, writeJson } from "../lib/storage";

const CACHE_KEY = "prospection.cache.types";

// Types de prospection, avec une copie locale pour le mode hors ligne.
export function useProspectTypes() {
  const [types, setTypes] = useState(() => readJson(CACHE_KEY, []));

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("prospection_types")
      .select("*")
      .order("name", { ascending: true });
    if (error) {
      console.error("Chargement types :", error);
      return;
    }
    setTypes(data);
    writeJson(CACHE_KEY, data);
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("online", load);
    return () => window.removeEventListener("online", load);
  }, [load]);

  // Création d'un type : nécessite le réseau.
  const create = async (name) => {
    const { error } = await supabase.from("prospection_types").insert({ name });
    if (error) {
      console.error("Création type :", error);
      return { error };
    }
    await load();
    return { error: null };
  };

  return { types, create };
}
