import { nearestSegment, segmentKey } from "./streets";

// Secteurs : contour fermé qui suit les rues, découpé en « tronçons » (legs)
// entre les points posés par l'utilisateur. Chaque tronçon est dessiné du côté
// intérieur du secteur ; « inversé », il passe de l'autre côté de la rue : la
// rangée d'immeubles d'en face est alors rattachée au secteur.

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

// Contour fermé du secteur (tronçons mis bout à bout).
export function sectorRing(sector) {
  const ring = [];
  sector.legs.forEach((leg, k) => ring.push(...(k === 0 ? leg : leg.slice(1))));
  return ring;
}

// Aire signée (x = longitude, y = latitude) : positive = sens trigonométrique,
// l'intérieur est alors à gauche du sens de tracé.
export function signedArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][1] * ring[i][0] - ring[i][1] * ring[j][0];
  }
  return a / 2;
}

const interiorIsLeft = (sector) => signedArea(sectorRing(sector)) > 0;

// Décalage d'affichage d'un tronçon, en pixels (négatif = à gauche du sens de
// tracé) : vers l'intérieur par défaut, vers l'extérieur s'il est inversé.
export function legOffset(sector, k, px = 5) {
  const inside = interiorIsLeft(sector) ? -px : px;
  return sector.inverses?.includes(k) ? -inside : inside;
}

export function pointInRing([lat, lng], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
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

// Côté d'un point par rapport au tronçon p→q : true = à droite.
function isRight(p, q, [lat, lng], cosLat) {
  const cross = (q[1] - p[1]) * cosLat * (lat - p[0]) - (q[0] - p[0]) * (lng - p[1]) * cosLat;
  return cross < 0;
}

// Secteur de chaque bâtiment : Map id_batiment → id du secteur.
//   1. un bâtiment à l'intérieur d'un contour appartient au secteur ;
//   2. un tronçon inversé rattache au secteur la rangée d'en face, c'est-à-dire
//      les bâtiments de l'autre côté dont la rue la plus proche est ce tronçon.
// centers : Map id_batiment → [lat, lng] ; graph : plan des rues (pour l'étape 2).
export function assignBuildings(sectors, centers, graph) {
  const result = new Map();
  const rings = sectors.map((s) => {
    const ring = sectorRing(s);
    return { id: s.id, ring, box: bbox(ring) };
  });
  for (const [id, c] of centers) {
    const hit = rings.find((r) => inBox(r.box, c) && pointInRing(c, r.ring));
    if (hit) result.set(id, hit.id);
  }

  if (!graph) return result;
  // Tronçons de rue revendiqués du côté extérieur.
  const claims = new Map(); // clé de tronçon → [{ sectorId, p, q, outerIsRight }]
  const claimed = [];
  for (const s of sectors) {
    if (!s.inverses?.length) continue;
    const outerIsRight = interiorIsLeft(s);
    for (const k of s.inverses) {
      const leg = s.legs[k];
      if (!leg) continue;
      claimed.push(...leg);
      for (let i = 1; i < leg.length; i++) {
        const key = segmentKey(leg[i - 1], leg[i]);
        if (!claims.has(key)) claims.set(key, []);
        claims.get(key).push({ sectorId: s.id, p: leg[i - 1], q: leg[i], outerIsRight });
      }
    }
  }
  if (!claims.size) return result;
  const zone = bbox(claimed);
  const margin = 0.0006; // ~50 m
  for (const [id, c] of centers) {
    if (!inBox(zone, c, margin)) continue;
    const seg = nearestSegment(graph, c);
    for (const claim of seg ? claims.get(seg.key) ?? [] : []) {
      if (isRight(claim.p, claim.q, c, graph.cosLat) === claim.outerIsRight) result.set(id, claim.sectorId);
    }
  }
  return result;
}

// Avancement d'un secteur : bâtiments prospectés depuis moins de `days` jours,
// et boîtes aux lettres connues (pour préparer les flyers).
export function sectorStats(sectorId, assignment, records, now = new Date(), days = 30) {
  let total = 0, aJour = 0, bal = 0, balConnus = 0;
  const limit = now - days * 864e5;
  for (const [id, s] of assignment) {
    if (s !== sectorId) continue;
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
