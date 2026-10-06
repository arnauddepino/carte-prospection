import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { indexByBuilding } from "../lib/prospections";

// Prospections indexées par bâtiment (Map id_batiment → ligne), avec
// chargement, enregistrement et suppression. Les fonctions renvoient
// { error } pour que l'interface puisse prévenir l'utilisateur.
export function useProspections() {
  const [records, setRecords] = useState(() => new Map());
  const [status, setStatus] = useState({ loading: true, error: null });
  // Version toujours à jour, pour enchaîner plusieurs enregistrements rapides
  // sans repartir d'un état périmé.
  const recordsRef = useRef(records);

  const apply = useCallback((updater) => {
    recordsRef.current = updater(recordsRef.current);
    setRecords(recordsRef.current);
  }, []);

  const load = useCallback(async () => {
    setStatus({ loading: true, error: null });
    const { data, error } = await supabase.from("prospections").select("*");
    if (error) {
      console.error("Chargement prospections :", error);
      setStatus({ loading: false, error });
      return;
    }
    apply(() => indexByBuilding(data));
    setStatus({ loading: false, error: null });
  }, [apply]);

  useEffect(() => {
    load();
  }, [load]);

  // Met à jour la ligne du bâtiment, ou la crée si elle n'existe pas encore.
  // On interroge la base plutôt que l'état local, qui peut être en retard sur
  // ce qu'un collègue a saisi entre-temps.
  const save = useCallback(async (payload) => {
    let { data: rows, error } = await supabase
      .from("prospections")
      .update(payload)
      .eq("id_batiment", payload.id_batiment)
      .select();
    if (!error && rows.length === 0) {
      ({ data: rows, error } = await supabase
        .from("prospections")
        .insert([payload])
        .select());
    }
    if (error) {
      console.error("Enregistrement prospection :", error);
      return { error };
    }

    const saved = rows[0] ?? payload;
    apply((map) => new Map(map).set(saved.id_batiment, saved));
    return { error: null };
  }, [apply]);

  const remove = useCallback(async (id_batiment) => {
    const { error } = await supabase.from("prospections").delete().eq("id_batiment", id_batiment);
    if (error) {
      console.error("Suppression prospection :", error);
      return { error };
    }
    apply((map) => {
      const next = new Map(map);
      next.delete(id_batiment);
      return next;
    });
    return { error: null };
  }, [apply]);

  return { records, status, reload: load, save, remove };
}
