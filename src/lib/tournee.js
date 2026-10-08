import { coords, nearestSegment, route, snap, walkingDistances, WEIGHT_METERS } from "./streets";

const DAY = 864e5;

// Bâtiments d'un secteur à faire : sans passage depuis `days` jours (ou jamais
// prospectés), inaccessibles exclus sauf demande.
// dateOf(id, record) : date à comparer au délai (par défaut le dernier passage ;
// l'appli donne celle de l'adresse la moins récemment faite).
export function tourCandidates({
  secteurId,
  sectorOf,
  records,
  now = new Date(),
  days = 30,
  includeInaccessible = false,
  dateOf = (id, r) => r?.date,
}) {
  const limit = now - days * DAY;
  const ids = [];
  for (const [id, s] of sectorOf) {
    if (s !== secteurId) continue;
    const r = records.get(id);
    if (!includeInaccessible && r?.acces === "inaccessible") continue;
    const date = dateOf(id, r);
    if (date && new Date(date) >= limit) continue;
    ids.push(id);
  }
  return ids;
}

// Point d'accès d'un bâtiment dans le plan des rues : extrémité la plus proche
// du tronçon de rue le plus proche (à défaut, carrefour le plus proche).
export function accessNode(g, center) {
  const seg = nearestSegment(g, center, 80);
  if (seg) return seg.t < 0.5 ? seg.ia : seg.ib;
  return snap(g, { lat: center[0], lng: center[1] }, 150);
}

// Ordre de visite le plus court (chemin ouvert, sans retour au départ) pour la
// matrice de distances D (n × n). start : indice imposé du point de départ, ou
// null pour choisir le meilleur. Plus proche voisin depuis chaque départ
// possible, puis amélioration « 2-opt » jusqu'à ne plus rien gagner.
export function solveOpenTour(D, start = null, deadline = Infinity) {
  const n = D.length;
  if (n <= 2) return Array.from({ length: n }, (_, i) => i);
  const length = (order) => order.reduce((s, v, i) => (i ? s + D[order[i - 1]][v] : 0), 0);

  const nearestNeighbour = (s) => {
    const seen = new Uint8Array(n);
    const order = [s];
    seen[s] = 1;
    for (let k = 1; k < n; k++) {
      const u = order[k - 1];
      let best = -1;
      for (let v = 0; v < n; v++) if (!seen[v] && (best < 0 || D[u][v] < D[u][best])) best = v;
      seen[best] = 1;
      order.push(best);
    }
    return order;
  };

  let order = null;
  let bestLen = Infinity;
  for (const s of start === null ? Array.from({ length: n }, (_, i) => i) : [start]) {
    const o = nearestNeighbour(s);
    const l = length(o);
    if (l < bestLen) {
      bestLen = l;
      order = o;
    }
    if (Date.now() > deadline) break;
  }

  // 2-opt : inverser un morceau du parcours s'il raccourcit le total.
  // Avec un départ imposé, le premier point ne bouge pas.
  const first = start === null ? 0 : 1;
  let improved = true;
  while (improved && Date.now() < deadline) {
    improved = false;
    for (let i = first; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = i > 0 ? order[i - 1] : -1;
        const b = order[i];
        const c = order[j];
        const d = j < n - 1 ? order[j + 1] : -1;
        const before = (a >= 0 ? D[a][b] : 0) + (d >= 0 ? D[c][d] : 0);
        const after = (a >= 0 ? D[a][c] : 0) + (d >= 0 ? D[b][d] : 0);
        if (after < before - 1e-9) {
          for (let x = i, y = j; x < y; x++, y--) [order[x], order[y]] = [order[y], order[x]];
          improved = true;
        }
      }
    }
  }
  return order;
}

// Ordre de passage d'une tournée, en suivant les rues à pied.
// buildings : [{ id, center: [lat, lng] }] ; start : [lat, lng] ou null.
// Renvoie { ids (dans l'ordre), distance (m), route ([[lat, lng], …]) }.
export function planTour(g, buildings, start = null, budgetMs = 4000) {
  const deadline = Date.now() + budgetMs;
  // Les bâtiments desservis par le même point d'accès sont visités ensemble.
  const groups = new Map(); // nœud → [ids]
  const orphans = []; // sans rue proche : ajoutés en fin de liste
  for (const b of buildings) {
    const node = accessNode(g, b.center);
    if (node < 0) {
      orphans.push(b.id);
      continue;
    }
    if (!groups.has(node)) groups.set(node, []);
    groups.get(node).push(b.id);
  }
  const nodes = [...groups.keys()];
  const startNode = start ? snap(g, { lat: start[0], lng: start[1] }, 300) : -1;
  const points = startNode >= 0 && !groups.has(startNode) ? [startNode, ...nodes] : nodes;
  const startIndex = startNode >= 0 ? points.indexOf(startNode) : null;

  const D = points.map((p) => walkingDistances(g, p, points));
  // Point inatteignable (rue isolée) : très loin, mais l'ordre reste calculable.
  for (const row of D) for (let j = 0; j < row.length; j++) if (!Number.isFinite(row[j])) row[j] = 1e7;

  const order = solveOpenTour(D, startIndex, deadline);
  const visit = order.map((i) => points[i]);
  let distance = 0;
  const path = [];
  for (let k = 1; k < visit.length; k++) {
    distance += D[order[k - 1]][order[k]];
    const leg = route(g, visit[k - 1], visit[k], WEIGHT_METERS);
    if (leg) path.push(...(path.length ? leg.slice(1) : leg));
  }
  // Au même point d'accès, les bâtiments sont pris dans le sens de la marche
  // (du point précédent vers le suivant), pour éviter les allers-retours.
  const centerOf = new Map(buildings.map((b) => [b.id, b.center]));
  const pos = (node) => [g.lat[node], g.lng[node] * g.cosLat];
  const ordered = visit.flatMap((node, k) => {
    const ids = [...(groups.get(node) ?? [])];
    const [py, px] = pos(visit[k - 1] ?? node);
    const [ny, nx] = pos(visit[k + 1] ?? node);
    const dx = nx - px, dy = ny - py;
    if (ids.length > 1 && (dx || dy)) {
      const along = (id) => {
        const [la, ln] = centerOf.get(id);
        return (ln * g.cosLat - px) * dx + (la - py) * dy;
      };
      ids.sort((a, b) => along(a) - along(b));
    }
    return ids;
  });
  return {
    ids: [...ordered, ...orphans],
    distance: Math.round(distance),
    route: coords(g, path),
  };
}
