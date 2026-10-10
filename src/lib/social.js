// Logements sociaux, hors cible de la prospection.
//   • données : public/social-15e.json (répertoire national RPLS et Ville de
//     Paris) : batiments[id] = [logements sociaux, "social" | "mixte", source,
//     adresses (identifiants BAN) qui en ont] ;
//   • fiche : logement_social (coché à la main) et pas_social (donnée corrigée).
// Un immeuble « social » est grisé et exclu des tournées et de la couverture ;
// une copropriété « mixte » reste ciblée.

export const SOCIAL_SOURCES = {
  saisie: "Coché dans l’appli",
  rpls: "Répertoire des logements sociaux (RPLS)",
  paris: "Logements sociaux financés (Ville de Paris)",
};

export function socialInfo(id, record, data) {
  const d = data?.batiments?.[id];
  const donnees = d ? { logements: d[0], categorie: d[1], source: d[2], adresses: d[3] ?? [] } : null;
  const parDonnees = donnees?.categorie === "social";
  if (record?.logement_social) return { social: true, source: "saisie", donnees, corrige: false };
  if (parDonnees && !record?.pas_social) return { social: true, source: donnees.source, donnees, corrige: false };
  return { social: false, source: null, donnees, corrige: parDonnees };
}

// Case « Logement social » de la fiche : champs à enregistrer pour obtenir
// l'état voulu, selon ce que disent les données.
export function socialPatch(id, checked, data) {
  const parDonnees = data?.batiments?.[id]?.[1] === "social";
  if (parDonnees) return { logement_social: false, pas_social: !checked };
  return { logement_social: checked, pas_social: false };
}

// Adresses sociales d'un bâtiment (pour les signaler dans la liste).
export const adressesSociales = (id, data) => new Set(data?.batiments?.[id]?.[3] ?? []);
