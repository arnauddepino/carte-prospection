import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { applyPassage, indexByBuilding } from "../lib/prospections";
import { applyQueue, enqueue, enqueueUndo, ficheOp, isRetryable, passageOp, removeFicheOp } from "../lib/outbox";
import { readJson, writeJson } from "../lib/storage";

const RESYNC_AFTER = 60 * 1000; // appli restée en arrière-plan plus d'une minute
const RETRY_EVERY = 30 * 1000; // nouvel essai d'envoi tant que la file n'est pas vide
const PAGE = 1000; // Supabase renvoie au plus 1000 lignes par requête
const CACHE_KEY = "prospection.cache.fiches";
const QUEUE_KEY = "prospection.envois";

// Lit toutes les lignes d'une requête, page par page (la requête doit être triée).
async function fetchAll(buildQuery) {
  let rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error, status } = await buildQuery().range(from, from + PAGE - 1);
    if (error) return { data: null, error, status };
    rows = rows.concat(data);
    if (data.length < PAGE) return { data: rows, error: null };
  }
}

// Fiches des bâtiments (Map id_batiment → ligne de prospections), utilisables
// hors ligne :
//   • une copie des fiches est gardée sur le téléphone ;
//   • chaque modification est appliquée tout de suite à l'écran, mise dans une
//     file d'envoi (conservée même si l'appli est fermée) puis envoyée dès que
//     le réseau le permet ;
//   • les changements des collègues arrivent en temps réel.
// onFatal(op, error) signale une modification refusée par le serveur.
export function useProspections({ onFatal, uid } = {}) {
  const cached = useMemo(() => readJson(CACHE_KEY, null), []);
  const [server, setServer] = useState(() => indexByBuilding(cached?.rows ?? []));
  const [queue, setQueue] = useState(() => readJson(QUEUE_KEY, []));
  const [status, setStatus] = useState({ loading: !cached, error: null });
  const [offline, setOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Versions toujours à jour, pour les envois qui s'enchaînent.
  const serverRef = useRef(server);
  const queueRef = useRef(queue);
  const flushingRef = useRef(false);
  const onFatalRef = useRef(onFatal);
  onFatalRef.current = onFatal;
  const uidRef = useRef(uid);
  uidRef.current = uid;

  const updateServer = useCallback((updater) => {
    serverRef.current = updater(serverRef.current);
    setServer(serverRef.current);
  }, []);

  const updateQueue = useCallback((updater) => {
    queueRef.current = updater(queueRef.current);
    writeJson(QUEUE_KEY, queueRef.current);
    setQueue(queueRef.current);
  }, []);

  const setServerRow = useCallback(
    (id_batiment, row) =>
      updateServer((map) => {
        const next = new Map(map);
        if (row) next.set(id_batiment, row);
        else next.delete(id_batiment);
        return next;
      }),
    [updateServer]
  );

  // Copie locale des fiches du serveur, réécrite au plus toutes les 2 s.
  useEffect(() => {
    const timer = setTimeout(() => writeJson(CACHE_KEY, { savedAt: Date.now(), rows: [...server.values()] }), 2000);
    return () => clearTimeout(timer);
  }, [server]);

  const refresh = useCallback(
    async (id_batiment) => {
      const { data, error } = await supabase
        .from("prospections")
        .select("*")
        .eq("id_batiment", id_batiment)
        .maybeSingle();
      if (!error) setServerRow(id_batiment, data);
    },
    [setServerRow]
  );

  // Envoie la file dans l'ordre. S'arrête au premier échec réseau (nouvel
  // essai plus tard) ; une modification refusée est abandonnée et signalée.
  const flush = useCallback(async () => {
    if (flushingRef.current || queueRef.current.length === 0) return;
    flushingRef.current = true;
    setSyncing(true);
    try {
      while (queueRef.current.length > 0) {
        const op = queueRef.current[0];
        let result;
        if (op.type === "passage") {
          result = await supabase
            .from("passages")
            .upsert(op.payload, { onConflict: "client_id", ignoreDuplicates: true });
        } else if (op.type === "deletePassage") {
          result = await supabase.from("passages").delete().eq("client_id", op.client_id);
        } else if (op.type === "fiche") {
          result = await supabase.from("prospections").upsert(op.payload, { onConflict: "id_batiment" }).select();
        } else if (op.type === "removeFiche") {
          result = await supabase.from("prospections").delete().eq("id_batiment", op.id_batiment);
        }

        if (result.error) {
          if (isRetryable(result.error, result.status)) {
            setOffline(true);
            return;
          }
          console.error("Envoi refusé :", op, result.error);
          updateQueue((q) => q.filter((x) => x.id !== op.id));
          onFatalRef.current?.(op, result.error);
          await refresh(op.payload?.id_batiment ?? op.id_batiment);
          continue;
        }

        setOffline(false);
        // Le serveur reflète maintenant l'opération.
        if (op.type === "passage") {
          setServerRow(
            op.payload.id_batiment,
            applyPassage(serverRef.current.get(op.payload.id_batiment), { ...op.payload, auteur_id: op.uid })
          );
        } else if (op.type === "fiche" && result.data?.[0]) {
          setServerRow(op.payload.id_batiment, result.data[0]);
        } else if (op.type === "removeFiche") {
          setServerRow(op.id_batiment, null);
        }
        updateQueue((q) => q.filter((x) => x.id !== op.id));
        if (op.type === "deletePassage") await refresh(op.id_batiment);
      }
    } finally {
      flushingRef.current = false;
      setSyncing(false);
    }
  }, [refresh, setServerRow, updateQueue]);

  const load = useCallback(async () => {
    const { data, error, status: httpStatus } = await fetchAll(() =>
      supabase.from("prospections").select("*").order("id_batiment")
    );
    if (error) {
      console.error("Chargement prospections :", error);
      const network = isRetryable(error, httpStatus);
      setOffline(network);
      // Avec une copie locale, on continue hors ligne ; sinon on affiche l'erreur.
      const hasLocalCopy = serverRef.current.size > 0 || queueRef.current.length > 0;
      setStatus({ loading: false, error: hasLocalCopy ? null : error });
      return;
    }
    setOffline(false);
    updateServer(() => indexByBuilding(data));
    setStatus({ loading: false, error: null });
    flush();
  }, [updateServer, flush]);

  // Chargement initial, temps réel, nouveaux essais d'envoi.
  useEffect(() => {
    load();
    const channel = supabase
      .channel("prospections")
      .on("postgres_changes", { event: "*", schema: "public", table: "prospections" }, (payload) => {
        if (payload.eventType === "DELETE") setServerRow(payload.old.id_batiment, null);
        else setServerRow(payload.new.id_batiment, payload.new);
      })
      .subscribe();

    // Au retour sur l'appli (téléphone sorti de veille) ou du réseau, on
    // recharge et on envoie la file : des changements ont pu être manqués.
    let hiddenAt = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > RESYNC_AFTER) load();
      else flush();
    };
    const onOnline = () => load();
    const retry = setInterval(() => queueRef.current.length && flush(), RETRY_EVERY);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      clearInterval(retry);
      supabase.removeChannel(channel);
    };
  }, [load, flush, setServerRow]);

  // ─── Modifications (toutes passent par la file) ─────────────────────────

  const push = useCallback(
    (op) => {
      updateQueue((q) => enqueue(q, op));
      flush();
    },
    [updateQueue, flush]
  );

  const records = useMemo(() => applyQueue(server, queue), [server, queue]);
  const recordsRef = useRef(records);
  recordsRef.current = records;

  // Nouveau passage. Renvoie de quoi l'annuler.
  const addPassage = useCallback(
    (payload) => {
      const previous = recordsRef.current.get(payload.id_batiment);
      push(passageOp(payload, uidRef.current));
      return { payload, previous };
    },
    [push]
  );

  const undoPassage = useCallback(
    ({ payload, previous }) => {
      updateQueue((q) => enqueueUndo(q, payload, previous));
      flush();
    },
    [updateQueue, flush]
  );

  const saveFiche = useCallback((payload) => push(ficheOp(payload)), [push]);
  const removeFiche = useCallback((id_batiment) => push(removeFicheOp(id_batiment)), [push]);

  // Suppression d'un passage depuis l'historique : nécessite le réseau. La
  // base ne supprime que ses propres passages (ou tout, pour l'admin) : un
  // refus se traduit par « aucune ligne supprimée ».
  const deletePassage = useCallback(
    async (passage) => {
      const { data, error } = await supabase.from("passages").delete().eq("client_id", passage.client_id).select("id");
      if (error) {
        console.error("Suppression passage :", error);
        return { error };
      }
      if (!data?.length) return { error: { message: "Seul l’auteur du passage ou l’administrateur peut le supprimer." } };
      await refresh(passage.id_batiment);
      return { error: null };
    },
    [refresh]
  );

  return {
    records,
    status,
    offline,
    syncing,
    pending: queue,
    savedAt: cached?.savedAt ?? null,
    reload: load,
    flush,
    addPassage,
    undoPassage,
    saveFiche,
    removeFiche,
    deletePassage,
  };
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
