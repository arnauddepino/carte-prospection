import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { readJson, writeJson } from "../lib/storage";
import { buildGraph } from "../lib/streets";

const CACHE_KEY = "prospection.cache.secteurs";

// Un secteur sans tronçons (copie locale d'une ancienne version) reste utilisable.
const normalize = (s) => ({ ...s, troncons: Array.isArray(s.troncons) ? s.troncons : [] });

// Secteurs, mis à jour en direct, avec une copie locale pour les consulter
// hors ligne. Créer, modifier ou supprimer un secteur nécessite le réseau.
export function useSecteurs() {
  const [secteurs, setSecteurs] = useState(() => readJson(CACHE_KEY, []).map(normalize));

  const store = useCallback((updater) => {
    setSecteurs((list) => {
      const next = updater(list);
      writeJson(CACHE_KEY, next);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("secteurs").select("*").order("id");
    if (error) console.error("Chargement secteurs :", error);
    else store(() => data.map(normalize));
  }, [store]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("secteurs")
      .on("postgres_changes", { event: "*", schema: "public", table: "secteurs" }, (payload) => {
        if (payload.eventType === "DELETE") store((list) => list.filter((s) => s.id !== payload.old.id));
        else store((list) => [...list.filter((s) => s.id !== payload.new.id), normalize(payload.new)].sort((a, b) => a.id - b.id));
      })
      .subscribe();
    window.addEventListener("online", load);
    return () => {
      window.removeEventListener("online", load);
      supabase.removeChannel(channel);
    };
  }, [load, store]);

  const save = useCallback(
    async (secteur) => {
      const { id, ...fields } = secteur;
      const query = id
        ? supabase.from("secteurs").update(fields).eq("id", id)
        : supabase.from("secteurs").insert(fields);
      const { data, error } = await query.select().single();
      if (error) {
        console.error("Enregistrement secteur :", error);
        return { error };
      }
      store((list) => [...list.filter((s) => s.id !== data.id), normalize(data)].sort((a, b) => a.id - b.id));
      return { error: null, secteur: data };
    },
    [store]
  );

  const remove = useCallback(
    async (id) => {
      const { error } = await supabase.from("secteurs").delete().eq("id", id);
      if (error) {
        console.error("Suppression secteur :", error);
        return { error };
      }
      store((list) => list.filter((s) => s.id !== id));
      return { error: null };
    },
    [store]
  );

  return { secteurs, save, remove };
}

// Plan des rues, chargé à la demande (dessin des secteurs, côtés inversés).
let streetsPromise = null;
export function loadStreets() {
  streetsPromise ??= fetch(`${import.meta.env.BASE_URL}rues-15e.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(buildGraph)
    .catch((e) => {
      streetsPromise = null; // nouvel essai possible
      throw e;
    });
  return streetsPromise;
}
