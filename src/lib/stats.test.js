import { describe, expect, test } from "vitest";
import { coverageSeries, deltaPct, foldOthers, groupBy, perWeek, selectPassages, startOfWeek, weekStarts } from "./stats";

const P = (id, date, extra = {}) => ({ id_batiment: id, date: new Date(date).toISOString(), ...extra });
const bal = new Map([["a", 10], ["b", 4]]);
const balOf = (id) => bal.get(id) ?? null;

describe("semaines", () => {
  test("une semaine commence le lundi", () => {
    expect(startOfWeek(new Date(2026, 9, 7, 15)).toDateString()).toBe(new Date(2026, 9, 5).toDateString()); // mercredi → lundi 5
    expect(startOfWeek(new Date(2026, 9, 11, 9)).toDateString()).toBe(new Date(2026, 9, 5).toDateString()); // dimanche
  });

  test("les N dernières semaines, de la plus ancienne à la semaine en cours", () => {
    const s = weekStarts(new Date(2026, 9, 7), 3);
    expect(s.map((d) => d.getDate())).toEqual([21, 28, 5]);
  });
});

describe("passages", () => {
  const passages = [
    P("a", new Date(2026, 9, 6, 10), { auteur: "Léa", prospection_type_id: 1 }),
    P("b", new Date(2026, 9, 6, 11), { auteur: "Léa", prospection_type_id: 2 }),
    P("c", new Date(2026, 8, 29, 10), { auteur: "Owen", prospection_type_id: 1 }),
    P("a", new Date(2026, 7, 1, 10), { auteur: "Owen", prospection_type_id: 1 }),
  ];
  const sectorOf = new Map([["a", 1], ["b", 1], ["c", 2]]);

  test("sélection par période et par secteur", () => {
    const from = new Date(2026, 8, 1), to = new Date(2026, 9, 8);
    expect(selectPassages(passages, { from, to, sectorOf })).toHaveLength(3);
    expect(selectPassages(passages, { from, to, secteurId: 1, sectorOf })).toHaveLength(2);
  });

  test("par semaine : passages et flyers (boîtes aux lettres connues)", () => {
    const weeks = perWeek(passages, weekStarts(new Date(2026, 9, 7), 2), balOf);
    expect(weeks.map((w) => [w.count, w.flyers, w.known])).toEqual([[1, 0, 0], [2, 14, 2]]);
  });

  test("par collègue, du plus actif au moins actif", () => {
    const g = groupBy(passages, (p) => p.auteur, balOf);
    expect(g.map((x) => [x.key, x.count, x.flyers])).toEqual([["Léa", 2, 14], ["Owen", 2, 10]]);
  });

  test("au-delà de N groupes, le reste est regroupé dans « Autres »", () => {
    const groups = ["a", "b", "c", "d"].map((key, i) => ({ key, count: 10 - i, flyers: 0, known: 0 }));
    expect(foldOthers(groups, 3).map((g) => [g.key, g.count])).toEqual([["a", 10], ["b", 9], ["Autres", 15]]);
    expect(foldOthers(groups, 4)).toHaveLength(4);
  });

  test("couverture sur 30 jours glissants", () => {
    const ids = new Set(["a", "b", "c", "d"]);
    const [debutSept, maintenant] = coverageSeries(passages, ids, [new Date(2026, 8, 1), new Date(2026, 9, 7)]);
    expect(debutSept).toMatchObject({ covered: 0, total: 4, pct: 0 }); // passage d'août : plus de 30 jours
    expect(maintenant).toMatchObject({ covered: 3, total: 4, pct: 75 });
  });

  test("écart en % par rapport à la période précédente", () => {
    expect(deltaPct(12, 10)).toBe(20);
    expect(deltaPct(5, 10)).toBe(-50);
    expect(deltaPct(5, 0)).toBeNull();
  });
});
