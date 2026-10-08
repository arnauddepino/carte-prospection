// Couleur d'un bâtiment selon l'ancienneté de son dernier passage.
// Une seule teinte (bleu), du plus foncé (récent) au plus clair (ancien) :
// l'ordre se lit par la clarté, ce qui reste lisible pour les daltoniens.
// Gamme vérifiée (clarté monotone, écarts visibles, contraste ≥ 2:1 du bleu
// le plus clair sur les bâtiments beiges du fond OSM).

export const NEVER_COLOR = "#8c8c8c";

export const AGE_STEPS = [
  { maxDays: 7,        color: "#012a63", label: "Moins de 7 jours" },
  { maxDays: 14,       color: "#013d88", label: "7 à 14 jours" },
  { maxDays: 30,       color: "#1351a6", label: "14 à 30 jours" },
  { maxDays: 90,       color: "#2c68bf", label: "30 à 90 jours" },
  { maxDays: Infinity, color: "#427fd8", label: "Plus de 90 jours" },
];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function colorFor(date, now = new Date()) {
  if (!date) return NEVER_COLOR;
  const days = Math.floor((now - new Date(date)) / MS_PER_DAY);
  return AGE_STEPS.find((step) => days < step.maxDays).color;
}

// Hachures d'un bâtiment fait en partie : bandes de la couleur la plus
// récente et de la plus ancienne. Motif Canvas, accepté comme fillColor par
// le rendu Canvas de Leaflet (sans Canvas, dans les tests : couleur pleine).
const patterns = new Map();
export function hatch(color, other) {
  const key = `${color}|${other}`;
  if (!patterns.has(key)) {
    const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    const ctx = canvas?.getContext?.("2d");
    if (!ctx) return color;
    const s = 10;
    canvas.width = canvas.height = s;
    ctx.fillStyle = other;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (const k of [-s, 0, s]) {
      ctx.moveTo(k, s);
      ctx.lineTo(k + s, 0);
    }
    ctx.stroke();
    patterns.set(key, ctx.createPattern(canvas, "repeat"));
  }
  return patterns.get(key);
}

// Style Leaflet d'un bâtiment. Les bâtiments jamais prospectés restent
// discrets pour ne pas noyer la carte ; le bâtiment ouvert est cerclé ;
// un bâtiment inaccessible a un contour en pointillés ; un bâtiment fait en
// partie (partial = couleur de son adresse la plus ancienne) est hachuré ;
// un bâtiment écarté par les filtres n'est plus qu'un léger contour.
export function styleFor(color, { selected = false, inaccessible = false, hidden = false, partial = null } = {}) {
  if (hidden && !selected) {
    return { color: NEVER_COLOR, weight: 0.5, opacity: 0.4, fillOpacity: 0, dashArray: null };
  }
  const never = color === NEVER_COLOR;
  return {
    color: selected ? "#111111" : color,
    weight: selected ? 3 : inaccessible ? 2 : never ? 0.75 : 1,
    opacity: 1,
    dashArray: inaccessible ? "5 4" : null,
    fillColor: partial ? hatch(color, partial) : color,
    fillOpacity: never ? 0.12 : 0.6,
  };
}
