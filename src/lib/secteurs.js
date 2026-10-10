import { nearestSegment, segmentKey } from "./streets";

// Secteurs : une suite de tronçons de rue (traits qui suivent les rues et ne
// se rejoignent pas forcément). Chaque tronçon couvre :
//   • "deux"   : les deux côtés de la rue (ligne au milieu de la rue) ;
//   • "gauche" / "droite" : un seul côté, par rapport au sens de tracé (ligne
//     décalée vers la rangée d'immeubles concernée).
// Un bâtiment appartient au secteur si la rue la plus proche fait partie d'un
// de ses tronçons, du côté couvert.
//
// troncon = { coords: [[lat, lng], …], cote: "deux" | "gauche" | "droite" }

// Couleurs des secteurs, dans l'ordre d'attribution (validées entre voisines ;
// le nom affiché sur la carte sert de second repère). Pas de bleu : c'est la
// couleur des bâtiments.
export const SECTOR_COLORS = [
  { value: "#eb6834", label: "Orange" },
  { value: "#1baf7a", label: "Turquoise" },
  { value: "#eda100", label: "Jaune" },
  { value: "#e87ba4", label: "Rose" },
  { value: "#008300", label: "Vert" },
  { value: "#4a3aa7", label: "Violet" },
  { value: "#e34948", label: "Rouge" },
];

export const nextSectorColor = (sectors) => SECTOR_COLORS[sectors.length % SECTOR_COLORS.length].value;

export const otherSide = (cote) => (cote === "gauche" ? "droite" : "gauche");

// Décalage d'affichage d'un tronçon, en pixels (négatif = à gauche du sens de
// tracé ; 0 = au milieu de la rue pour les deux côtés).
export function legOffset(troncon, px = 5) {
  if (troncon.cote === "gauche") return -px;
  if (troncon.cote === "droite") return px;
  return 0;
}

// Tous les points d'un secteur (pour cadrer la carte).
export const sectorPoints = (sector) => sector.troncons.flatMap((t) => t.coords);

// Position du nom sur la carte : au milieu du plus long tronçon.
export function sectorLabelPosition(sector) {
  const longest = sector.troncons.reduce((a, t) => (t.coords.length > (a?.coords.length ?? 0) ? t : a), null);
  return longest ? longest.coords[Math.floor(longest.coords.length / 2)] : null;
}

// Deux tronçons passent-ils par la même rue ? Renvoie null si non, sinon
// { sameDirection } (tracés dans le même sens ou non).
export function sharedStreet(a, b) {
  const keysB = new Map(b.coords.slice(1).map((q, i) => [segmentKey(b.coords[i], q), [b.coords[i], q]]));
  for (let i = 1; i < a.coords.length; i++) {
    const seg = keysB.get(segmentKey(a.coords[i - 1], a.coords[i]));
    if (seg) {
      const same = seg[0][0] === a.coords[i - 1][0] && seg[0][1] === a.coords[i - 1][1];
      return { sameDirection: same };
    }
  }
  return null;
}

// Côté qu'il faut donner à b pour qu'il couvre la rangée opposée à celle de a.
export function oppositeCote(coteA, shared) {
  const single = coteA === "deux" ? "gauche" : coteA;
  return shared.sameDirection ? otherSide(single) : single;
}

function bbox(points) {
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
  for (const [la, ln] of points) {
    if (la < s) s = la;
    if (la > n) n = la;
    if (ln < w) w = ln;
    if (ln > e) e = ln;
  }
  return { s, w, n, e };
}
const inBox = (b, [la, ln], m = 0) => la >= b.s - m && la <= b.n + m && ln >= b.w - m && ln <= b.e + m;

// Côté d'un point par rapport au tronçon p→q : "gauche" ou "droite".
function sideOf(p, q, [lat, lng], cosLat) {
  const cross = (q[1] - p[1]) * cosLat * (lat - p[0]) - (q[0] - p[0]) * (lng - p[1]) * cosLat;
  return cross > 0 ? "gauche" : "droite";
}

// Secteur de chaque bâtiment : Map id_batiment → id du secteur.
// centers : Map id_batiment → [lat, lng] ; graph : plan des rues.
// Si deux secteurs couvrent la même rangée, le premier créé l'emporte.
export function assignBuildings(sectors, centers, graph) {
  const result = new Map();
  if (!graph) return result;
  const claims = new Map(); // clé de tronçon de rue → [{ sectorId, p, q, cote }]
  const claimed = [];
  for (const s of sectors) {
    for (const t of s.troncons ?? []) {
      claimed.push(...t.coords);
      for (let i = 1; i < t.coords.length; i++) {
        const key = segmentKey(t.coords[i - 1], t.coords[i]);
        if (!claims.has(key)) claims.set(key, []);
        claims.get(key).push({ sectorId: s.id, p: t.coords[i - 1], q: t.coords[i], cote: t.cote });
      }
    }
  }
  if (!claims.size) return result;
  const zone = bbox(claimed);
  const margin = 0.0006; // ~50 m
  for (const [id, c] of centers) {
    if (!inBox(zone, c, margin)) continue;
    const seg = nearestSegment(graph, c);
    const onStreet = seg && claims.get(seg.key);
    if (!onStreet) continue;
    const claim = onStreet.find((cl) => cl.cote === "deux" || cl.cote === sideOf(cl.p, cl.q, c, graph.cosLat));
    if (claim) result.set(id, claim.sectorId);
  }
  return result;
}

// Avancement d'un secteur : bâtiments prospectés depuis moins de `days` jours,
// et boîtes aux lettres connues (pour préparer les flyers). isTarget(id) :
// bâtiment ciblé (les logements sociaux ne comptent pas).
export function sectorStats(sectorId, assignment, records, now = new Date(), days = 30, isTarget = () => true) {
  let total = 0, aJour = 0, bal = 0, balConnus = 0;
  const limit = now - days * 864e5;
  for (const [id, s] of assignment) {
    if (s !== sectorId || !isTarget(id)) continue;
    total++;
    const r = records.get(id);
    if (r?.date && new Date(r.date) >= limit) aJour++;
    if (r?.bal != null) {
      bal += Number(r.bal);
      balConnus++;
    }
  }
  return { total, aJour, pct: total ? Math.round((100 * aJour) / total) : 0, bal, balConnus };
}
