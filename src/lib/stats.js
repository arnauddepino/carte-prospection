// Calculs du tableau de bord, à partir de l'historique des passages.
// passage = { id_batiment, date, prospection_type_id, auteur }

const DAY = 864e5;

// Lundi 0 h (heure locale) de la semaine d'une date.
export function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// Débuts des `weeks` dernières semaines, de la plus ancienne à la semaine en cours.
export function weekStarts(now, weeks) {
  const current = startOfWeek(now);
  return Array.from({ length: weeks }, (_, i) => {
    const d = new Date(current);
    d.setDate(d.getDate() - 7 * (weeks - 1 - i));
    return d;
  });
}

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

// Passages entre `from` (inclus) et `to` (exclu), éventuellement limités à un secteur.
export function selectPassages(passages, { from, to, secteurId = null, sectorOf }) {
  return passages.filter((p) => {
    const t = new Date(p.date);
    if (t < from || t >= to) return false;
    return !secteurId || sectorOf.get(p.id_batiment) === secteurId;
  });
}

// Flyers d'un passage = boîtes aux lettres du bâtiment, si elles sont connues.
const flyersOf = (p, balOf) => balOf(p.id_batiment);

function sumFlyers(passages, balOf) {
  let flyers = 0;
  let known = 0;
  for (const p of passages) {
    const bal = flyersOf(p, balOf);
    if (bal != null) {
      flyers += Number(bal);
      known++;
    }
  }
  return { flyers, known };
}

// Passages et flyers par semaine.
export function perWeek(passages, starts, balOf) {
  return starts.map((start, i) => {
    const end = starts[i + 1] ?? addDays(start, 7);
    const inWeek = passages.filter((p) => {
      const t = new Date(p.date);
      return t >= start && t < end;
    });
    return { start, count: inWeek.length, ...sumFlyers(inWeek, balOf) };
  });
}

// Regroupement (par collègue, par type…) trié du plus grand au plus petit.
export function groupBy(passages, keyOf, balOf) {
  const groups = new Map();
  for (const p of passages) {
    const key = keyOf(p);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return [...groups]
    .map(([key, list]) => ({ key, count: list.length, ...sumFlyers(list, balOf) }))
    .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key), "fr"));
}

// Garde les `max - 1` premiers groupes et regroupe le reste dans « Autres ».
export function foldOthers(groups, max, otherKey = "Autres") {
  if (groups.length <= max) return groups;
  const rest = groups.slice(max - 1);
  return [
    ...groups.slice(0, max - 1),
    rest.reduce(
      (acc, g) => ({ key: otherKey, count: acc.count + g.count, flyers: acc.flyers + g.flyers, known: acc.known + g.known }),
      { key: otherKey, count: 0, flyers: 0, known: 0 }
    ),
  ];
}

// Couverture : part des bâtiments de `buildingIds` passés dans les `windowDays`
// jours précédant chaque date de `dates`.
export function coverageSeries(passages, buildingIds, dates, windowDays = 30) {
  const byBuilding = new Map();
  for (const p of passages) {
    if (!buildingIds.has(p.id_batiment)) continue;
    if (!byBuilding.has(p.id_batiment)) byBuilding.set(p.id_batiment, []);
    byBuilding.get(p.id_batiment).push(+new Date(p.date));
  }
  for (const list of byBuilding.values()) list.sort((a, b) => a - b);
  const total = buildingIds.size;
  return dates.map((date) => {
    const end = +date;
    const start = end - windowDays * DAY;
    let covered = 0;
    for (const times of byBuilding.values()) {
      // dernier passage avant `end`
      let lo = 0, hi = times.length - 1, last = -Infinity;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= end) {
          last = times[mid];
          lo = mid + 1;
        } else hi = mid - 1;
      }
      if (last > start) covered++;
    }
    return { date, covered, total, pct: total ? (100 * covered) / total : 0 };
  });
}

// Écart signé entre deux valeurs, en %, ou null si la référence est nulle.
export const deltaPct = (current, previous) => (previous ? Math.round((100 * (current - previous)) / previous) : null);
