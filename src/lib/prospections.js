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
// la fiche est placée à midi pour rester sur le bon jour. adresses : les
// adresses couvertes (identifiants BAN) quand le passage ne couvre qu'une
// partie du bâtiment ; absent = tout le bâtiment.
export function passagePayload({ id_batiment, date, typeId, auteur, adresses }) {
  return {
    client_id: crypto.randomUUID(), // identifiant stable, même hors ligne (évite les doublons au renvoi)
    id_batiment,
    date: date ? fromDateInputValue(date) : new Date().toISOString(),
    prospection_type_id: typeId,
    auteur: toText(auteur),
    ...(adresses?.length ? { adresses } : {}),
  };
}

const after = (a, b) => new Date(a) > new Date(b);

// La fiche après un passage, comme le calcule la base (déclencheur
// sync_dernier_passage) : le résumé du dernier passage ne change que pour un
// passage plus récent ; date_complet = dernier passage sur tout le bâtiment ;
// adresses = { idBan: date } des passages partiels postérieurs.
export function applyPassage(record, passage) {
  const complet = (record && "date_complet" in record ? record.date_complet : record?.date) ?? null;
  let date_complet = complet;
  let adresses = record?.adresses ?? null;
  if (!passage.adresses?.length) {
    if (!complet || !after(complet, passage.date)) {
      date_complet = passage.date;
      const kept = Object.entries(adresses ?? {}).filter(([, d]) => after(d, passage.date));
      adresses = kept.length ? Object.fromEntries(kept) : null;
    }
  } else if (!complet || after(passage.date, complet)) {
    adresses = { ...adresses };
    for (const a of passage.adresses) if (!adresses[a] || after(passage.date, adresses[a])) adresses[a] = passage.date;
  }
  const base = { ...record, id_batiment: passage.id_batiment, date_complet, adresses };
  if (record?.date && after(record.date, passage.date)) return base;
  return {
    ...base,
    date: passage.date,
    prospection_type_id: passage.prospection_type_id,
    dernier_auteur: passage.auteur,
    dernier_auteur_id: passage.auteur_id ?? null,
  };
}

// ─── Filtres d'affichage ──────────────────────────────────────────────────

export const NO_FILTERS = {
  secteurId: null,
  typeId: null,
  auteur: null,
  age: null, // null | "recent" (< 30 j) | "a-refaire" (≥ 30 j ou jamais)
  avecCode: false,
  inaccessible: false,
  social: false,
};

export const hasFilters = (f) =>
  Boolean(f.secteurId || f.typeId || f.auteur || f.age || f.avecCode || f.inaccessible || f.social);

const DAYS_30 = 30 * 24 * 3600 * 1000;

// Le bâtiment correspond-il à tous les filtres actifs ? (secteurId = secteur
// du bâtiment, s'il en a un)
export function matchesFilters(record, f, now = new Date(), secteurId = null) {
  if (f.secteurId && secteurId !== f.secteurId) return false;
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
