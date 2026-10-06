import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export function useProspectTypes() {
  const [types, setTypes] = useState([]);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("prospection_types")
      .select("*")
      .order("name", { ascending: true });
    if (error) console.error("Chargement types :", error);
    else setTypes(data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
