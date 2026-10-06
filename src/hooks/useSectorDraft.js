import { useCallback, useState } from "react";
import { coords, route, snap } from "../lib/streets";

// Tracé d'un secteur en cours : chaque point touché est accroché au carrefour
// le plus proche, et relié au précédent par le plus court chemin dans les rues.
// Toucher le premier point (ou « Fermer ») referme le contour.
export function useSectorDraft() {
  const [draft, setDraft] = useState(null); // { couleur, nodes: [i], paths: [[i…]] }

  const start = useCallback((couleur) => setDraft({ couleur, nodes: [], paths: [] }), []);
  const cancel = useCallback(() => setDraft(null), []);

  const undo = useCallback(
    () => setDraft((d) => d && { ...d, nodes: d.nodes.slice(0, -1), paths: d.paths.slice(0, -1) }),
    []
  );

  // Ajoute un point. Renvoie { error } ("far" : trop loin d'une rue,
  // "unreachable" : pas de chemin), { closed: true } si le contour est fermé.
  const addPoint = useCallback(
    (graph, latlng) => {
      const node = snap(graph, latlng);
      if (node === -1) return { error: "far" };
      const d = draft;
      if (d.nodes.length && node === d.nodes.at(-1)) return {};
      if (d.nodes.length >= 3 && node === d.nodes[0]) return { closed: true };
      if (d.nodes.length === 0) {
        setDraft({ ...d, nodes: [node] });
        return {};
      }
      const path = route(graph, d.nodes.at(-1), node);
      if (!path) return { error: "unreachable" };
      setDraft({ ...d, nodes: [...d.nodes, node], paths: [...d.paths, path] });
      return {};
    },
    [draft]
  );

  // Contour fermé prêt à enregistrer : { points, legs } en coordonnées, ou null.
  const close = useCallback(
    (graph) => {
      const d = draft;
      if (!d || d.nodes.length < 3) return null;
      const back = route(graph, d.nodes.at(-1), d.nodes[0]);
      if (!back) return null;
      return {
        points: coords(graph, d.nodes),
        legs: [...d.paths, back].map((p) => coords(graph, p)),
      };
    },
    [draft]
  );

  // Pour l'affichage pendant le tracé.
  const view = useCallback(
    (graph) =>
      draft && graph
        ? { couleur: draft.couleur, points: coords(graph, draft.nodes), legs: draft.paths.map((p) => coords(graph, p)) }
        : null,
    [draft]
  );

  return { active: Boolean(draft), count: draft?.nodes.length ?? 0, start, cancel, undo, addPoint, close, view };
}
