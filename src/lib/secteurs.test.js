import { describe, expect, test } from "vitest";
import { buildGraph, coords, nearestSegment, route, snap } from "./streets";
import { assignBuildings, legOffset, sectorRing, sectorStats, signedArea } from "./secteurs";

// Quartier fictif : 3 rues est-ouest × 3 rues nord-sud, îlots d'environ 110 m.
const N = (r, c) => [48.84 + 0.001 * r, 2.29 + 0.0015 * c];
const id = (r, c) => r * 3 + c;
const data = {
  nodes: [0, 1, 2].flatMap((r) => [0, 1, 2].flatMap((c) => N(r, c))),
  names: ["Rue Ouest", "Rue du Milieu", "Rue Est", "Rue Sud", "Rue Centre", "Rue Nord"],
  ways: [
    ...[0, 1, 2].map((c) => [0, c, [id(0, c), id(1, c), id(2, c)]]), // nord-sud
    ...[0, 1, 2].map((r) => [0, 3 + r, [id(r, 0), id(r, 1), id(r, 2)]]), // est-ouest
  ],
};
const graph = buildGraph(data);

// Secteur A = moitié ouest, B = moitié est ; la « Rue du Milieu » (c = 1) les sépare.
const A = {
  id: 1,
  legs: [[N(0, 0), N(0, 1)], [N(0, 1), N(1, 1), N(2, 1)], [N(2, 1), N(2, 0)], [N(2, 0), N(1, 0), N(0, 0)]],
  inverses: [],
};
const B = {
  id: 2,
  legs: [[N(0, 1), N(0, 2)], [N(0, 2), N(1, 2), N(2, 2)], [N(2, 2), N(2, 1)], [N(2, 1), N(1, 1), N(0, 1)]],
  inverses: [],
};
// Rangées d'immeubles de part et d'autre de la Rue du Milieu (~15 m).
const centers = new Map([
  ["ouest-1", [48.8405, 2.2915 - 0.0002]],
  ["ouest-2", [48.8415, 2.2915 - 0.0002]],
  ["est-1", [48.8405, 2.2915 + 0.0002]],
  ["est-2", [48.8415, 2.2915 + 0.0002]],
  ["loin", [48.8455, 2.2915]],
]);

describe("plan des rues", () => {
  test("accroche au carrefour le plus proche, rien si trop loin", () => {
    expect(snap(graph, { lat: 48.84002, lng: 2.29152 })).toBe(id(0, 1));
    expect(snap(graph, { lat: 48.8455, lng: 2.2915 })).toBe(-1);
  });

  test("le tracé suit les rues (plus court chemin)", () => {
    const path = route(graph, id(0, 0), id(2, 2));
    expect(path[0]).toBe(id(0, 0));
    expect(path.at(-1)).toBe(id(2, 2));
    expect(path).toHaveLength(5); // 4 tronçons de rue
    expect(coords(graph, [id(1, 1)])).toEqual([N(1, 1)]);
  });

  test("rue la plus proche d'un immeuble, avec son nom", () => {
    expect(nearestSegment(graph, centers.get("ouest-1")).name).toBe("Rue du Milieu");
  });
});

describe("secteurs", () => {
  test("contour fermé et sens de tracé", () => {
    expect(sectorRing(A)).toHaveLength(7);
    expect(signedArea(sectorRing(A))).toBeGreaterThan(0); // sens trigonométrique
  });

  test("ligne vers l'intérieur par défaut, vers l'extérieur une fois inversée", () => {
    expect(legOffset(A, 1)).toBe(-5); // intérieur à gauche
    expect(legOffset({ ...A, inverses: [1] }, 1)).toBe(5);
    // Sur la rue partagée, A et B sont dessinés de part et d'autre.
    const surRueA = legOffset(A, 1);
    const surRueB = legOffset(B, 3);
    expect(Math.sign(surRueA)).toBe(Math.sign(surRueB)); // sens de tracé opposés → côtés opposés
  });

  test("par défaut, chaque rangée appartient au secteur de son côté", () => {
    const r = assignBuildings([A, B], centers, graph);
    expect([r.get("ouest-1"), r.get("ouest-2"), r.get("est-1"), r.get("est-2")]).toEqual([1, 1, 2, 2]);
    expect(r.has("loin")).toBe(false);
  });

  test("intervertir sur la rue partagée échange les deux rangées", () => {
    const r = assignBuildings([{ ...A, inverses: [1] }, { ...B, inverses: [3] }], centers, graph);
    expect([r.get("ouest-1"), r.get("ouest-2"), r.get("est-1"), r.get("est-2")]).toEqual([2, 2, 1, 1]);
  });

  test("inverser un seul côté : le secteur prend aussi la rangée d'en face", () => {
    const r = assignBuildings([{ ...A, inverses: [1] }, B], centers, graph);
    expect([r.get("ouest-1"), r.get("est-1")]).toEqual([1, 1]);
  });

  test("avancement : bâtiments à jour et boîtes aux lettres", () => {
    const now = new Date("2026-10-08T12:00:00Z");
    const records = new Map([
      ["ouest-1", { date: "2026-10-01T10:00:00Z", bal: 12 }],
      ["ouest-2", { date: "2026-06-01T10:00:00Z", bal: 8 }],
    ]);
    const r = assignBuildings([A, B], centers, graph);
    expect(sectorStats(1, r, records, now)).toEqual({ total: 2, aJour: 1, pct: 50, bal: 20, balConnus: 2 });
  });
});
