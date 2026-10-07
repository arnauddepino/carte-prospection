// Plan des rues (public/rues-15e.json, extrait d'OpenStreetMap) : graphe pour
// tracer les secteurs en suivant les rues, et index spatial des tronçons.
//
// Format du fichier : nodes = [lat0, lng0, lat1, lng1, …],
// ways = [[catégorie, indice du nom ou -1, [indices des points]], …],
// catégorie 0 = rue, 1 = voie de service, 2 = chemin piéton / cycliste / escalier.

const M_PER_DEG_LAT = 111320;
// Les chemins coûtent plus cher : le tracé préfère les rues quand il le peut.
const COST = [1, 1.4, 1.8];
const CELL = 0.0004; // ~30-45 m

export function buildGraph(data) {
  const n = data.nodes.length / 2;
  const lat = new Float64Array(n);
  const lng = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    lat[i] = data.nodes[2 * i];
    lng[i] = data.nodes[2 * i + 1];
  }
  const cosLat = Math.cos((lat[0] * Math.PI) / 180);
  const meters = (a, b) => Math.hypot((lat[a] - lat[b]) * M_PER_DEG_LAT, (lng[a] - lng[b]) * M_PER_DEG_LAT * cosLat);

  // [voisin, coût, voie, mètres, …] : le coût pénalise les chemins (tracé des
  // secteurs), les mètres servent aux itinéraires à pied (tournées).
  const adj = Array.from({ length: n }, () => []);
  const segments = []; // [a, b, voie]
  data.ways.forEach(([kind, , ids], w) => {
    for (let k = 1; k < ids.length; k++) {
      const a = ids[k - 1];
      const b = ids[k];
      const m = meters(a, b);
      const cost = m * COST[kind];
      adj[a].push(b, cost, w, m);
      adj[b].push(a, cost, w, m);
      segments.push([a, b, w]);
    }
  });

  // Index spatial : points (pour l'accroche) et tronçons (pour les côtés de rue).
  const cellOf = (la, ln) => `${Math.floor(la / CELL)}:${Math.floor(ln / CELL)}`;
  const nodeGrid = new Map();
  for (let i = 0; i < n; i++) {
    if (adj[i].length === 0) continue;
    const key = cellOf(lat[i], lng[i]);
    if (!nodeGrid.has(key)) nodeGrid.set(key, []);
    nodeGrid.get(key).push(i);
  }
  const segGrid = new Map();
  segments.forEach(([a, b], s) => {
    const keys = new Set([cellOf(lat[a], lng[a]), cellOf(lat[b], lng[b]), cellOf((lat[a] + lat[b]) / 2, (lng[a] + lng[b]) / 2)]);
    for (const key of keys) {
      if (!segGrid.has(key)) segGrid.set(key, []);
      segGrid.get(key).push(s);
    }
  });

  return { n, lat, lng, adj, segments, names: data.names, ways: data.ways, cosLat, cellOf, nodeGrid, segGrid };
}

// Cellules voisines d'un point (3×3).
function nearbyCells(g, la, ln) {
  const [ci, cj] = g.cellOf(la, ln).split(":").map(Number);
  const keys = [];
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) keys.push(`${ci + di}:${cj + dj}`);
  return keys;
}

// Point du plan le plus proche (à moins de maxMeters), ou -1.
export function snap(g, { lat, lng }, maxMeters = 45) {
  let best = -1;
  let bestD = maxMeters;
  for (const key of nearbyCells(g, lat, lng)) {
    for (const i of g.nodeGrid.get(key) ?? []) {
      const d = Math.hypot((g.lat[i] - lat) * M_PER_DEG_LAT, (g.lng[i] - lng) * M_PER_DEG_LAT * g.cosLat);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  }
  return best;
}

export const STRIDE = 4; // taille d'une entrée de g.adj
export const WEIGHT_COST = 1; // coût du tracé (chemins pénalisés)
export const WEIGHT_METERS = 3; // distance à pied réelle

// Plus court chemin (Dijkstra) entre deux points du plan : liste d'indices, ou null.
// weight : WEIGHT_COST (tracé des secteurs) ou WEIGHT_METERS (à pied).
export function route(g, from, to, weight = WEIGHT_COST) {
  if (from === to) return [from];
  const dist = new Float64Array(g.n).fill(Infinity);
  const prev = new Int32Array(g.n).fill(-1);
  const heap = new MinHeap();
  dist[from] = 0;
  heap.push(0, from);
  while (heap.size) {
    const [d, u] = heap.pop();
    if (u === to) break;
    if (d > dist[u]) continue;
    const edges = g.adj[u];
    for (let k = 0; k < edges.length; k += STRIDE) {
      const v = edges[k];
      const nd = d + edges[k + weight];
      if (nd < dist[v]) {
        dist[v] = nd;
        prev[v] = u;
        heap.push(nd, v);
      }
    }
  }
  if (dist[to] === Infinity) return null;
  const path = [];
  for (let u = to; u !== -1; u = prev[u]) path.push(u);
  return path.reverse();
}

// Distances à pied (mètres) depuis `from` vers chacun des `targets` (indices).
export function walkingDistances(g, from, targets) {
  const dist = new Float64Array(g.n).fill(Infinity);
  const wanted = new Set(targets);
  const heap = new MinHeap();
  dist[from] = 0;
  heap.push(0, from);
  let remaining = wanted.size;
  while (heap.size && remaining > 0) {
    const [d, u] = heap.pop();
    if (d > dist[u]) continue;
    if (wanted.has(u)) {
      wanted.delete(u);
      remaining--;
    }
    const edges = g.adj[u];
    for (let k = 0; k < edges.length; k += STRIDE) {
      const v = edges[k];
      const nd = d + edges[k + WEIGHT_METERS];
      if (nd < dist[v]) {
        dist[v] = nd;
        heap.push(nd, v);
      }
    }
  }
  return targets.map((t) => dist[t]);
}

export const coords = (g, path) => path.map((i) => [g.lat[i], g.lng[i]]);

// Clé d'un tronçon à partir de ses deux extrémités (indépendante du sens).
export function segmentKey(p, q) {
  const a = `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  const b = `${q[0].toFixed(6)},${q[1].toFixed(6)}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// Tronçon de rue le plus proche d'un point (à moins de maxMeters) :
// { key, a: [lat, lng], b: [lat, lng], name } ou null.
export function nearestSegment(g, [lat, lng], maxMeters = 45) {
  const k = g.cosLat;
  let best = null;
  let bestD = maxMeters;
  const seen = new Set();
  for (const key of nearbyCells(g, lat, lng)) {
    for (const s of g.segGrid.get(key) ?? []) {
      if (seen.has(s)) continue;
      seen.add(s);
      const [a, b, w] = g.segments[s];
      // Distance point-segment dans un repère local en mètres.
      const ax = (g.lng[a] - lng) * k, ay = g.lat[a] - lat;
      const bx = (g.lng[b] - lng) * k, by = g.lat[b] - lat;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
      const d = Math.hypot(ax + t * dx, ay + t * dy) * M_PER_DEG_LAT;
      if (d < bestD) {
        bestD = d;
        const pa = [g.lat[a], g.lng[a]];
        const pb = [g.lat[b], g.lng[b]];
        best = { key: segmentKey(pa, pb), a: pa, b: pb, ia: a, ib: b, t, name: g.names[g.ways[w][1]] ?? null };
      }
    }
  }
  return best;
}

// Petit tas binaire (min) pour Dijkstra.
class MinHeap {
  constructor() {
    this.keys = [];
    this.vals = [];
  }
  get size() {
    return this.keys.length;
  }
  push(key, val) {
    const { keys, vals } = this;
    let i = keys.length;
    keys.push(key);
    vals.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      keys[i] = keys[p];
      vals[i] = vals[p];
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
  }
  pop() {
    const { keys, vals } = this;
    const top = [keys[0], vals[0]];
    const key = keys.pop();
    const val = vals.pop();
    if (keys.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= keys.length) break;
        if (c + 1 < keys.length && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= key) break;
        keys[i] = keys[c];
        vals[i] = vals[c];
        i = c;
      }
      keys[i] = key;
      vals[i] = val;
    }
    return top;
  }
}
