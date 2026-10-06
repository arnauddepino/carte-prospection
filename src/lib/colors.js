// Couleur d'un bâtiment selon l'ancienneté de son dernier passage.
// Les paliers sont exportés pour pouvoir afficher une légende.

export const NEVER_COLOR = "#888";

export const AGE_STEPS = [
  { maxDays: 7,        color: "green",  label: "moins de 7 jours" },
  { maxDays: 14,       color: "yellow", label: "moins de 14 jours" },
  { maxDays: 30,       color: "orange", label: "moins de 30 jours" },
  { maxDays: 90,       color: "red",    label: "moins de 90 jours" },
  { maxDays: Infinity, color: "black",  label: "90 jours et plus" },
];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function colorFor(date, now = new Date()) {
  if (!date) return NEVER_COLOR;
  const days = Math.floor((now - new Date(date)) / MS_PER_DAY);
  return AGE_STEPS.find((step) => days < step.maxDays).color;
}
