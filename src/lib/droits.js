// Ce que l'utilisateur peut faire (mêmes règles que la base, qui reste juge :
// l'interface masque simplement ce qui serait refusé).
// moi = { uid, isAdmin }

// Fiche d'un bâtiment : l'auteur du dernier passage, ou personne d'identifié
// (fiche sans passage ou passages antérieurs aux comptes), ou l'admin.
export const canEditFiche = (record, moi) =>
  moi.isAdmin || !record?.dernier_auteur_id || record.dernier_auteur_id === moi.uid;

// Supprimer un passage : son auteur, ou l'admin.
export const canDeletePassage = (passage, moi) => moi.isAdmin || (Boolean(passage.auteur_id) && passage.auteur_id === moi.uid);

// Supprimer une fiche, gérer les secteurs : l'admin.
export const canDeleteFiche = (moi) => moi.isAdmin;
export const canEditSectors = (moi) => moi.isAdmin;
