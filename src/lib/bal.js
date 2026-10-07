// Nombre de boîtes aux lettres (BAL) d'un bâtiment, avec sa provenance :
//   • "saisie"     : renseigné dans l'appli (prioritaire) ;
//   • "registre"   : lots d'habitation du registre des copropriétés (public/bal-15e.json) ;
//   • "estimation" : surface au sol × étages, calibrée sur le registre (à vérifier).
// data = contenu de public/bal-15e.json (ou null s'il n'est pas encore chargé).

export const BAL_SOURCES = {
  saisie: { label: "Saisie", long: "Saisie dans l’appli" },
  registre: { label: "Registre", long: "Registre des copropriétés" },
  estimation: { label: "Estimation", long: "Estimation (surface × étages)" },
};

export function balInfo(id, record, data) {
  if (record?.bal != null && record.bal !== "") return { value: Number(record.bal), source: "saisie" };
  const r = data?.registre?.[id];
  if (r) return { value: r[0], source: "registre", immat: r[1], nom: r[2], adresse: r[3] };
  const e = data?.estimation?.[id];
  if (e) return { value: e, source: "estimation" };
  return { value: null, source: null };
}

// Flyers à prévoir pour une liste de bâtiments, détaillés par provenance.
export function flyersPlan(ids, infoOf, margin = 0.1) {
  const plan = { saisie: { n: 0, bal: 0 }, registre: { n: 0, bal: 0 }, estimation: { n: 0, bal: 0 }, inconnu: 0 };
  for (const id of ids) {
    const info = infoOf(id);
    if (info.source) {
      plan[info.source].n++;
      plan[info.source].bal += info.value;
    } else plan.inconnu++;
  }
  const base = plan.saisie.bal + plan.registre.bal + plan.estimation.bal;
  const marge = Math.ceil(base * margin);
  return { ...plan, base, marge, total: base + marge };
}
