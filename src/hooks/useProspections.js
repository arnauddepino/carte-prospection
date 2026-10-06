import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { applyPassage, indexByBuilding } from "../lib/prospections";

const RESYNC_AFTER = 60 * 1000; // appli restée en arrière-plan plus d'une minute
const PAGE = 1000; // Supabase renvoie au plus 1000 lignes par requête

// Lit toutes les lignes d'une requête, page par page (la requête doit être triée).
async function fetchAll(buildQuery) {
  let rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    rows = rows.concat(data);
    if (data.length < PAGE) return { data: rows, error: null };
  }
}

// Fiches des bâtiments (Map id_batiment → ligne de prospections), tenues à
// jour en temps réel, et opérations sur les passages et les fiches.
// Les fonctions renvoient { error } pour que l'interface prévienne l'utilisateur.
export function useProspections() {
  const [records, setRecords] = useState(() => new Map());
  const [status, setStatus] = useState({ loading: true, error: null });
  // Version toujours à jour, pour enchaîner plusieurs opérations rapides
  // sans repartir d'un état périmé.
  const recordsRef = useRef(records);

  const apply = useCallback((updater) => {
    recordsRef.current = updater(recordsRef.current);
    setRecords(recordsRef.current);
  }, []);

  const setRecord = useCallback(
    (id_batiment, row) =>
      apply((map) => {
        const next = new Map(map);
        if (row) next.set(id_batiment, row);
        else next.delete(id_batiment);
        return next;
      }),
    [apply]
  );

  const load = useCallback(async () => {
    const { data, error } = await fetchAll(() =>
      supabase.from("prospections").select("*").order("id_batiment")
    );
    if (error) {
      console.error("Chargement prospections :", error);
      setStatus({ loading: false, error });
      return;
    }
    apply(() => indexByBuilding(data));
    setStatus({ loading: false, error: null });
  }, [apply]);

  // Relit la fiche d'un bâtiment telle que la base l'a calculée.
  const refresh = useCallback(
    async (id_batiment) => {
      const { data, error } = await supabase
        .from("prospections")
        .select("*")
        .eq("id_batiment", id_batiment)
        .maybeSingle();
      if (!error) setRecord(id_batiment, data);
    },
    [setRecord]
  );

  // Chargement initial + changements faits par les collègues, en direct.
  useEffect(() => {
    load();
    const channel = supabase
      .channel("prospections")
      .on("postgres_changes", { event: "*", schema: "public", table: "prospections" }, (payload) => {
        if (payload.eventType === "DELETE") setRecord(payload.old.id_batiment, null);
        else setRecord(payload.new.id_batiment, payload.new);
      })
      .subscribe();

    // Au retour sur l'appli (téléphone sorti de veille), on recharge : les
    // changements reçus pendant la veille ont pu être manqués.
    let hiddenAt = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > RESYNC_AFTER) load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      supabase.removeChannel(channel);
    };
  }, [load, setRecord]);

  // Enregistre un passage ; la base met la fiche à jour. Renvoie le passage
  // (son id sert à l'annuler).
  const addPassage = useCallback(
    async (payload) => {
      const { data, error } = await supabase.from("passages").insert(payload).select().single();
      if (error) {
        console.error("Enregistrement passage :", error);
        return { error };
      }
      setRecord(data.id_batiment, applyPassage(recordsRef.current.get(data.id_batiment), data));
      return { error: null, passage: data };
    },
    [setRecord]
  );

  const deletePassage = useCallback(
    async (passage) => {
      const { error } = await supabase.from("passages").delete().eq("id", passage.id);
      if (error) {
        console.error("Suppression passage :", error);
        return { error };
      }
      await refresh(passage.id_batiment);
      return { error: null };
    },
    [refresh]
  );

  // Enregistre la fiche (BAL, code, accès…) sans toucher aux passages.
  const saveFiche = useCallback(
    async (payload) => {
      const { data, error } = await supabase
        .from("prospections")
        .upsert(payload, { onConflict: "id_batiment" })
        .select()
        .single();
      if (error) {
        console.error("Enregistrement fiche :", error);
        return { error };
      }
      setRecord(data.id_batiment, data);
      return { error: null };
    },
    [setRecord]
  );

  // Supprime la fiche ; la base supprime aussi son historique.
  const removeFiche = useCallback(
    async (id_batiment) => {
      const { error } = await supabase.from("prospections").delete().eq("id_batiment", id_batiment);
      if (error) {
        console.error("Suppression fiche :", error);
        return { error };
      }
      setRecord(id_batiment, null);
      return { error: null };
    },
    [setRecord]
  );

  return { records, status, reload: load, addPassage, deletePassage, saveFiche, removeFiche };
}

// Historique d'un bâtiment (du plus récent au plus ancien), ou de tous les
// bâtiments si id_batiment est omis (export).
export async function fetchPassages(id_batiment) {
  const query = () =>
    supabase.from("passages").select("*").order("date", { ascending: false }).order("id", { ascending: false });
  const { data, error } = id_batiment
    ? await query().eq("id_batiment", id_batiment).limit(50)
    : await fetchAll(query);
  if (error) console.error("Chargement passages :", error);
  return { data: data ?? [], error };
}
