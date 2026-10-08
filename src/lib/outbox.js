import { applyPassage } from "./prospections";

// File d'envoi du mode hors ligne. Chaque modification est d'abord appliquée
// sur le téléphone, puis envoyée dans l'ordre dès que le réseau le permet.
//
// Opérations :
//   { type: "passage", id, payload }                       nouveau passage (payload.client_id)
//   { type: "deletePassage", id, client_id, id_batiment, previous }  annulation d'un passage déjà envoyé
//   { type: "fiche", id, payload }                         BAL, code, accès… d'un bâtiment
//   { type: "removeFiche", id, id_batiment }               suppression d'une fiche

const newId = () => crypto.randomUUID();

// uid : auteur du passage (posé par la base à l'envoi, connu ici pour l'affichage).
export const passageOp = (payload, uid = null) => ({ type: "passage", id: newId(), payload, uid });
export const ficheOp = (payload) => ({ type: "fiche", id: newId(), payload });
export const removeFicheOp = (id_batiment) => ({ type: "removeFiche", id: newId(), id_batiment });

// Applique une opération à l'état local des fiches (Map id_batiment → fiche).
export function applyOp(records, op) {
  const next = new Map(records);
  if (op.type === "passage") {
    const p = op.payload;
    next.set(p.id_batiment, applyPassage(records.get(p.id_batiment), { ...p, auteur_id: op.uid }));
  } else if (op.type === "deletePassage") {
    if (op.previous) next.set(op.id_batiment, op.previous);
    else next.delete(op.id_batiment);
  } else if (op.type === "fiche") {
    next.set(op.payload.id_batiment, { ...records.get(op.payload.id_batiment), ...op.payload });
  } else if (op.type === "removeFiche") {
    next.delete(op.id_batiment);
  }
  return next;
}

// Fiches telles que l'utilisateur doit les voir : celles du serveur, plus les
// modifications pas encore envoyées.
export const applyQueue = (records, queue) => queue.reduce(applyOp, records);

// Ajoute une opération ; une fiche en attente pour le même bâtiment est
// remplacée (seule la dernière version compte).
export function enqueue(queue, op) {
  if (op.type === "fiche") {
    return [...queue.filter((q) => !(q.type === "fiche" && q.payload.id_batiment === op.payload.id_batiment)), op];
  }
  return [...queue, op];
}

// Annule un passage. S'il n'est pas encore parti, on le retire simplement de
// la file ; sinon on programme sa suppression (previous = fiche d'avant le
// passage, pour l'affichage en attendant).
export function enqueueUndo(queue, payload, previous) {
  const pending = queue.find((q) => q.type === "passage" && q.payload.client_id === payload.client_id);
  if (pending) return queue.filter((q) => q !== pending);
  return [
    ...queue,
    { type: "deletePassage", id: newId(), client_id: payload.client_id, id_batiment: payload.id_batiment, previous },
  ];
}

// Échec à retenter plus tard (réseau absent, serveur indisponible) ou erreur
// définitive (donnée refusée) ?
// 401 : jeton de connexion expiré (après une longue période hors ligne) ; il
// est rafraîchi automatiquement, la modification repartira au prochain essai.
export function isRetryable(error, status) {
  if (status === 0 || status === 401 || status === 408 || status === 429 || status >= 500) return true;
  return /fetch|network|timeout|abort|load failed/i.test(error?.message ?? "");
}
