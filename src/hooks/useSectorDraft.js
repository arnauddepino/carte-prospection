import { useCallback, useState } from "react";
import { coords, route, snap } from "../lib/streets";

// Tracé en cours : un ou plusieurs traits. Chaque point touché est accroché au
// carrefour le plus proche et relié au précédent du même trait par le plus
// court chemin dans les rues. « Lever le crayon » commence un nouveau trait,
// qui n'est pas relié au précédent.
// sectorId : secteur existant que l'on complète (sinon nouveau secteur).
export function useSectorDraft() {
  const [draft, setDraft] = useState(null); // { couleur, sectorId, traits: [{ nodes: [i], paths: [[i…]] }] }

  const start = useCallback(
    (couleur, sectorId = null) => setDraft({ couleur, sectorId, traits: [{ nodes: [], paths: [] }] }),
    []
  );
  const cancel = useCallback(() => setDraft(null), []);

  const current = draft?.traits.at(-1);
  const legs = draft?.traits.reduce((n, t) => n + t.paths.length, 0) ?? 0;

  // Retire le dernier point (et revient au trait précédent si le trait est vide).
  const undo = useCallback(
    () =>
      setDraft((d) => {
        if (!d) return d;
        const traits = [...d.traits];
        const last = traits.at(-1);
        if (last.nodes.length === 0 && traits.length > 1) traits.pop();
        const t = traits.at(-1);
        traits[traits.length - 1] = { nodes: t.nodes.slice(0, -1), paths: t.paths.slice(0, -1) };
        return { ...d, traits };
      }),
    []
  );

  // Nouveau trait, non relié au précédent.
  const liftPen = useCallback(
    () =>
      setDraft((d) =>
        d && d.traits.at(-1).nodes.length > 0
          ? { ...d, traits: [...d.traits.filter((t) => t.paths.length > 0), { nodes: [], paths: [] }] }
          : d
      ),
    []
  );

  // Ajoute un point. Renvoie { error } : "far" (trop loin d'une rue),
  // "unreachable" (pas de chemin par les rues).
  const addPoint = useCallback(
    (graph, latlng) => {
      const node = snap(graph, latlng);
      if (node === -1) return { error: "far" };
      const t = draft.traits.at(-1);
      if (t.nodes.at(-1) === node) return {};
      let next;
      if (t.nodes.length === 0) {
        next = { nodes: [node], paths: [] };
      } else {
        const path = route(graph, t.nodes.at(-1), node);
        if (!path) return { error: "unreachable" };
        next = { nodes: [...t.nodes, node], paths: [...t.paths, path] };
      }
      setDraft({ ...draft, traits: [...draft.traits.slice(0, -1), next] });
      return {};
    },
    [draft]
  );

  // Tronçons tracés, prêts à enregistrer (les deux côtés de la rue par défaut).
  const troncons = useCallback(
    (graph) => draft.traits.flatMap((t) => t.paths.map((p) => ({ coords: coords(graph, p), cote: "deux" }))),
    [draft]
  );

  // Pour l'affichage pendant le tracé.
  const view = useCallback(
    (graph) =>
      draft && graph
        ? {
            couleur: draft.couleur,
            points: draft.traits.flatMap((t, ti) =>
              t.nodes.map((n, i) => ({ latlng: coords(graph, [n])[0], last: ti === draft.traits.length - 1 && i === t.nodes.length - 1 }))
            ),
            legs: draft.traits.flatMap((t) => t.paths.map((p) => coords(graph, p))),
          }
        : null,
    [draft]
  );

  return {
    active: Boolean(draft),
    sectorId: draft?.sectorId ?? null,
    couleur: draft?.couleur,
    legs,
    penDown: (current?.nodes.length ?? 0) > 0,
    start,
    cancel,
    undo,
    liftPen,
    addPoint,
    troncons,
    view,
  };
}
