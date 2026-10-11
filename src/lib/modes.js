// Modes de prospection terrain.
//   • boîtage : flyers dans les boîtes aux lettres, par série de flyers
//     (prospection_types) ; suivi adresse par adresse ;
//   • porte-à-porte, gardiens, commerçants : un passage = une visite.
// Sur la fiche : date / prospection_type_id = dernier boîtage ;
// modes = { mode: { date, auteur } } pour les autres modes.

export const MODES = [
  { value: "boitage", label: "Boîtage", court: "Boîtage", fait: "Boîtage fait" },
  { value: "porte_a_porte", label: "Porte-à-porte", court: "Porte-à-porte", fait: "Porte-à-porte fait" },
  { value: "gardien", label: "Gardiens", court: "Gardien", fait: "Visite gardien notée" },
  { value: "commercant", label: "Commerçants", court: "Commerçants", fait: "Visite commerçants notée" },
];
export const modeInfo = (mode) => MODES.find((m) => m.value === (mode ?? "boitage")) ?? MODES[0];

// Les logements sociaux sont hors cible, sauf pour les commerces en pied
// d'immeuble.
export const socialHorsCible = (mode) => mode !== "commercant";

// Date du dernier passage d'un mode.
export function dateMode(record, mode = "boitage") {
  if (!record) return null;
  if (mode === "boitage") return record.date ?? null;
  return record.modes?.[mode]?.date ?? null;
}

// Date du dernier passage, tous modes confondus.
export function derniereDate(record) {
  let last = record?.date ?? null;
  for (const m of Object.values(record?.modes ?? {})) {
    if (m?.date && (!last || new Date(m.date) > new Date(last))) last = m.date;
  }
  return last;
}

// Choix de la barre du bas : une série de flyers (boîtage) ou un autre mode.
// Valeur des options : « t:<id du type> » ou « m:<mode> ».
export const choixValue = ({ mode, typeId }) => (mode === "boitage" ? (typeId ? `t:${typeId}` : "") : `m:${mode}`);
export function choixFrom(value) {
  if (value?.startsWith("t:")) return { mode: "boitage", typeId: Number(value.slice(2)) };
  if (value?.startsWith("m:")) return { mode: value.slice(2), typeId: null };
  return { mode: "boitage", typeId: null };
}

// Libellé d'un passage : série de flyers pour un boîtage, sinon le mode.
export function passageLabel(passage, typeName) {
  const mode = passage.mode ?? "boitage";
  if (mode === "boitage") return typeName(passage.prospection_type_id) ?? "Boîtage";
  return modeInfo(mode).court;
}
