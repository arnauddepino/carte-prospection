import { describe, expect, test } from "vitest";
import { balInfo, flyersPlan } from "./bal";
import { buildGraph } from "./streets";
import { planTour, solveOpenTour, tourCandidates } from "./tournee";

describe("boîtes aux lettres et provenance", () => {
  const data = { registre: { "way/1": [21, "AA123", "SDC 1 RUE X", "1 rue x"] }, estimation: { "way/2": 14 } };

  test("saisie > registre > estimation > inconnu", () => {
    expect(balInfo("way/1", { bal: 18 }, data)).toEqual({ value: 18, source: "saisie" });
    expect(balInfo("way/1", { bal: null }, data)).toMatchObject({ value: 21, source: "registre", immat: "AA123" });
    expect(balInfo("way/2", undefined, data)).toEqual({ value: 14, source: "estimation" });
    expect(balInfo("way/3", undefined, data)).toEqual({ value: null, source: null });
    expect(balInfo("way/1", { bal: 0 }, data)).toEqual({ value: 0, source: "saisie" }); // 0 saisi reste une saisie
  });

  test("flyers à prévoir, détaillés par provenance, avec marge", () => {
    const infos = { a: { value: 10, source: "saisie" }, b: { value: 21, source: "registre" }, c: { value: 14, source: "estimation" }, d: { value: null, source: null } };
    const plan = flyersPlan(["a", "b", "c", "d"], (id) => infos[id], 0.1);
    expect(plan).toMatchObject({
      saisie: { n: 1, bal: 10 },
      registre: { n: 1, bal: 21 },
      estimation: { n: 1, bal: 14 },
      inconnu: 1,
      base: 45,
      marge: 5,
      total: 50,
    });
  });
});

describe("sélection des bâtiments d'une tournée", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  const sectorOf = new Map([["a", 1], ["b", 1], ["c", 1], ["d", 1], ["e", 2]]);
  const records = new Map([
    ["a", { date: "2026-10-01T10:00:00Z" }], // passé il y a 6 jours
    ["b", { date: "2026-08-01T10:00:00Z" }], // à refaire
    ["c", { acces: "inaccessible" }], // jamais prospecté mais inaccessible
  ]);

  test("à refaire depuis 30 jours ou jamais, inaccessibles exclus", () => {
    expect(tourCandidates({ secteurId: 1, sectorOf, records, now, days: 30 }).sort()).toEqual(["b", "d"]);
  });
  test("inaccessibles inclus sur demande ; délai plus court", () => {
    expect(tourCandidates({ secteurId: 1, sectorOf, records, now, days: 30, includeInaccessible: true }).sort()).toEqual(["b", "c", "d"]);
    expect(tourCandidates({ secteurId: 1, sectorOf, records, now, days: 5 }).sort()).toEqual(["a", "b", "d"]);
  });
});

describe("ordre de passage le plus court", () => {
  // Points sur une ligne, dans le désordre : le meilleur chemin les parcourt dans l'ordre.
  const xs = [5, 0, 9, 2, 7, 1];
  const D = xs.map((a) => xs.map((b) => Math.abs(a - b)));
  const len = (o) => o.reduce((s, v, i) => (i ? s + D[o[i - 1]][v] : 0), 0);

  test("sans départ imposé : longueur minimale (9)", () => {
    const order = solveOpenTour(D);
    expect(order).toHaveLength(xs.length);
    expect(new Set(order).size).toBe(xs.length);
    expect(len(order)).toBe(9);
  });

  test("départ imposé au milieu : on part bien de ce point", () => {
    const order = solveOpenTour(D, 0); // x = 5
    expect(order[0]).toBe(0);
    expect(len(order)).toBe(13); // 5 → 7 → 9 → 2 → 1 → 0 ou l'inverse : 4 + 9
  });

  test("le 2-opt supprime les croisements (carré)", () => {
    const pts = [[0, 0], [1, 1], [1, 0], [0, 1]];
    const Dsq = pts.map((a) => pts.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1])));
    const order = solveOpenTour(Dsq);
    const l = order.reduce((s, v, i) => (i ? s + Dsq[order[i - 1]][v] : 0), 0);
    expect(l).toBeCloseTo(3); // trois côtés du carré, aucune diagonale
  });
});

describe("itinéraire dans les rues", () => {
  // Une seule rue est-ouest de 4 carrefours (~110 m entre deux).
  const N = (c) => [48.84, 2.29 + 0.0015 * c];
  const g = buildGraph({ nodes: [0, 1, 2, 3].flatMap(N), names: ["Rue Test"], ways: [[0, 0, [0, 1, 2, 3]]] });
  const near = (c, side) => [48.84 + side * 0.0002, 2.29 + 0.0015 * c + 0.0001];
  const buildings = [
    { id: "c3", center: near(3, 1) },
    { id: "c0", center: near(0, 1) },
    { id: "c2-nord", center: near(2, 1) },
    { id: "c2-sud", center: near(2, -1) },
    { id: "c1", center: near(1, -1) },
  ];

  test("tous les bâtiments, une fois chacun, en suivant la rue", () => {
    const tour = planTour(g, buildings);
    expect([...tour.ids].sort()).toEqual(buildings.map((b) => b.id).sort());
    const pos = (id) => tour.ids.indexOf(id);
    // Parcours d'un bout à l'autre de la rue, sans aller-retour.
    const sens = pos("c0") < pos("c3") ? 1 : -1;
    expect(Math.sign(pos("c1") - pos("c0"))).toBe(sens);
    expect(Math.sign(pos("c2-nord") - pos("c1"))).toBe(sens);
    // Les deux côtés d'un même endroit sont faits ensemble.
    expect(Math.abs(pos("c2-nord") - pos("c2-sud"))).toBe(1);
    expect(tour.distance).toBeGreaterThan(300);
    expect(tour.distance).toBeLessThan(360);
    expect(tour.route.length).toBe(4);
  });

  test("plusieurs bâtiments au même point : pris dans le sens de la marche", () => {
    // Trois immeubles le long du tronçon 1 → 2, tous rattachés au point 1 ou 2.
    const rangee = [0.2, 0.45, 0.3, 0.05].map((t, i) => ({ id: `r${i}`, center: [48.84 + 0.0002, 2.29 + 0.0015 * (1 + t)] }));
    const tour = planTour(g, [...rangee, { id: "fin", center: near(3, 1) }], N(0));
    const r = tour.ids.filter((id) => id.startsWith("r"));
    expect(r).toEqual(["r3", "r0", "r2", "r1"]); // d'ouest en est, comme la marche
  });

  test("départ depuis ma position (à l'est) : on commence par l'est", () => {
    const tour = planTour(g, buildings, N(3));
    expect(tour.ids[0]).toBe("c3");
    expect(tour.ids.at(-1)).toBe("c0");
  });
});
