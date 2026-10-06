import { fromDateInputValue, toDateInputValue } from "./dates";

// Identifiant OSM d'un bâtiment (ex. « way/123456 »).
export const featureId = (feature) => feature.id || feature.properties["@id"];

// Indexe les prospections par bâtiment. S'il existe plusieurs lignes pour un
// même bâtiment (anciens doublons), on garde la plus récente.
export function indexByBuilding(rows) {
  const index = new Map();
  for (const row of rows) {
    const current = index.get(row.id_batiment);
    if (!current || new Date(row.date) > new Date(current.date)) {
      index.set(row.id_batiment, row);
    }
  }
  return index;
}

// Valeurs du formulaire d'édition, pré-remplies depuis la prospection existante.
export function recordToForm(id_batiment, record) {
  return {
    id_batiment,
    originalDate: record?.date ?? null,
    date: toDateInputValue(record?.date ?? new Date().toISOString()),
    typeId: record?.prospection_type_id ?? null,
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

// Formulaire → ligne à enregistrer. Le type existant du bâtiment est conservé ;
// le type sélectionné ne sert que pour un bâtiment encore jamais prospecté.
// Renvoie null si aucun type n'est disponible.
export function formToPayload(form, selectedTypeId) {
  const typeId = form.typeId ?? selectedTypeId;
  if (!typeId) return null;

  let date;
  if (!form.date) date = new Date().toISOString();
  else if (form.originalDate && form.date === toDateInputValue(form.originalDate)) date = form.originalDate;
  else date = fromDateInputValue(form.date);

  return {
    id_batiment: form.id_batiment,
    date,
    prospection_type_id: typeId,
    bal: toBal(form.bal),
    code_entree: toText(form.code_entree),
    infos: toText(form.infos),
  };
}
