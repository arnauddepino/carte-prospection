import { fromDateInputValue } from "./dates";

// Identifiant OSM d'un bâtiment (ex. « way/123456 »).
export const featureId = (feature) => feature.id || feature.properties["@id"];

// Statuts d'accès d'un bâtiment (valeurs de la colonne prospections.acces).
export const ACCES = [
  { value: "libre", label: "Libre" },
  { value: "code", label: "Code" },
  { value: "badge", label: "Badge" },
  { value: "interphone", label: "Interphone" },
  { value: "inaccessible", label: "Inaccessible" },
];
export const accesLabel = (value) => ACCES.find((a) => a.value === value)?.label ?? "";

// Indexe les fiches par bâtiment (une ligne par bâtiment en base).
export function indexByBuilding(rows) {
  return new Map(rows.map((row) => [row.id_batiment, row]));
}

// Fiche du bâtiment (hors passages), pré-remplie depuis la ligne existante.
export function recordToForm(id_batiment, record) {
  return {
    id_batiment,
    acces: record?.acces ?? null,
    logement_social: record?.logement_social ?? false,
    bal: record?.bal ?? "",
    code_entree: record?.code_entree ?? "",
    infos: record?.infos ?? "",
  };
}

function toBal(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const toText = (value) => String(value ?? "").trim() || null;

// Formulaire de fiche → ligne à enregistrer (sans date ni type : ceux-ci
// viennent des passages).
export function formToPayload(form) {
  return {
    id_batiment: form.id_batiment,
    acces: form.acces || null,
    logement_social: Boolean(form.logement_social),
    bal: toBal(form.bal),
    code_entree: toText(form.code_entree),
    infos: toText(form.infos),
  };
}

// Nouveau passage. Sans date (tap), c'est maintenant ; une date choisie dans
// la fiche est placée à midi pour rester sur le bon jour.
export function passagePayload({ id_batiment, date, typeId, auteur }) {
  return {
    client_id: crypto.randomUUID(), // identifiant stable, même hors ligne (évite les doublons au renvoi)
    id_batiment,
    date: date ? fromDateInputValue(date) : new Date().toISOString(),
    prospection_type_id: typeId,
    auteur: toText(auteur),
  };
}

// La fiche après un passage, comme le calcule la base : seul un passage plus
// récent que le dernier connu la met à jour.
export function applyPassage(record, passage) {
  if (record?.date && new Date(record.date) > new Date(passage.date)) return record;
  return {
    ...record,
    id_batiment: passage.id_batiment,
    date: passage.date,
    prospection_type_id: passage.prospection_type_id,
    dernier_auteur: passage.auteur,
  };
}

// ─── Filtres d'affichage ──────────────────────────────────────────────────

export const NO_FILTERS = {
  typeId: null,
  auteur: null,
  age: null, // null | "recent" (< 30 j) | "a-refaire" (≥ 30 j ou jamais)
  avecCode: false,
  inaccessible: false,
  social: false,
};

export const hasFilters = (f) =>
  Boolean(f.typeId || f.auteur || f.age || f.avecCode || f.inaccessible || f.social);

const DAYS_30 = 30 * 24 * 3600 * 1000;

// Le bâtiment correspond-il à tous les filtres actifs ?
export function matchesFilters(record, f, now = new Date()) {
  if (f.typeId && record?.prospection_type_id !== f.typeId) return false;
  if (f.auteur && record?.dernier_auteur !== f.auteur) return false;
  if (f.avecCode && !record?.code_entree) return false;
  if (f.inaccessible && record?.acces !== "inaccessible") return false;
  if (f.social && !record?.logement_social) return false;
  if (f.age) {
    const recent = record?.date && now - new Date(record.date) < DAYS_30;
    if (f.age === "recent" ? !recent : recent) return false;
  }
  return true;
}
