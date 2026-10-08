import { colorFor } from "./colors";

// Adresses des bâtiments (public/adresses-15e.json, Base Adresse Nationale +
// cadastre). Un bâtiment dessiné d'un seul bloc par OpenStreetMap peut en
// porter plusieurs (12, 14, 16 rue X) : chacune est suivie à part.
//
// Côté fiche (colonnes maintenues par la base à partir des passages) :
//   • date_complet : dernier passage qui couvrait tout le bâtiment ;
//   • adresses     : { idBan: date } des passages partiels plus récents.

// Identifiant BAN : « <voie>_<numéro sur 5 chiffres>[_<suffixe>] ».
const ID_BAN = /^(.+)_(\d{5})(?:_([a-z0-9]+))?$/;

// Adresses d'un bâtiment : [{ id, numero, rue, label }], dans l'ordre du fichier
// (par rue puis par numéro).
export function adressesOf(id, data) {
  const ids = data?.batiments?.[id];
  if (!ids) return [];
  return ids.map((ban) => {
    const m = ID_BAN.exec(ban);
    const numero = m ? `${Number(m[2])}${m[3] ? ` ${m[3].toUpperCase()}` : ""}` : "";
    const rue = (m && data.rues[m[1]]) ?? "";
    return { id: ban, numero, rue, label: `${numero} ${rue}`.trim() };
  });
}

// « 12, 14, 16 Rue Leblanc · 39 Rue X ». max : nombre d'adresses écrites au
// plus, les autres sont résumées (« … et 12 autres »).
export function formatAdresses(list, max = Infinity) {
  const shown = list.slice(0, max);
  const groups = [];
  for (const a of shown) {
    const last = groups[groups.length - 1];
    if (last?.rue === a.rue) last.numeros.push(a.numero);
    else groups.push({ rue: a.rue, numeros: [a.numero] });
  }
  const text = groups.map((g) => `${g.numeros.join(", ")} ${g.rue}`).join(" · ");
  const rest = list.length - shown.length;
  return rest > 0 ? `${text} et ${rest} autre${rest > 1 ? "s" : ""}` : text;
}

// Titre court d'un bâtiment : sa première adresse, et le nombre des autres.
export function titreAdresses(list) {
  if (list.length === 0) return null;
  if (list.length === 1) return list[0].label;
  const sameStreet = list.every((a) => a.rue === list[0].rue);
  if (sameStreet && list.length <= 3) return formatAdresses(list);
  return `${list[0].label} (+${list.length - 1})`;
}

const later = (a, b) => (!a ? b : !b ? a : new Date(a) >= new Date(b) ? a : b);

// Date de couverture complète d'une fiche. Une fiche enregistrée avant le
// suivi par adresse (copie locale ancienne) n'a pas la colonne : tous ses
// passages couvraient alors le bâtiment entier.
const completeDate = (record) => (record && "date_complet" in record ? record.date_complet : record?.date) ?? null;

// Dernière date à laquelle chaque adresse a été couverte (null = jamais).
export function datesParAdresse(record, list) {
  const complet = completeDate(record);
  return new Map(list.map((a) => [a.id, later(complet, record?.adresses?.[a.id] ?? null)]));
}

// Date de l'adresse la moins récemment couverte (null si l'une ne l'a jamais
// été). Sans adresse connue : date du dernier passage.
export function oldestDate(record, list) {
  if (list.length === 0) return record?.date ?? null;
  let oldest;
  for (const d of datesParAdresse(record, list).values()) {
    if (!d) return null;
    if (oldest === undefined || new Date(d) < new Date(oldest)) oldest = d;
  }
  return oldest;
}

// Bâtiment fait en partie : ses adresses ne sont pas toutes dans la même
// tranche d'ancienneté. Renvoie la couleur de la plus ancienne, sinon null.
export function partialColor(record, list, now = new Date()) {
  if (list.length < 2 || !record?.date) return null;
  const newest = colorFor(record.date, now);
  const oldest = colorFor(oldestDate(record, list), now);
  return oldest === newest ? null : oldest;
}
