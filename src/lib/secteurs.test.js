import { describe, expect, test } from "vitest";
import { buildGraph, coords, nearestSegment, route, snap } from "./streets";
import {
  assignBuildings,
  legOffset,
  oppositeCote,
  otherSide,
  sectorLabelPosition,
  sectorStats,
  sharedStreet,
} from "./secteurs";

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

// Rue du Milieu tracée vers le nord, et dans l'autre sens.
const versNord = [N(0, 1), N(1, 1), N(2, 1)];
const versSud = [...versNord].reverse();
// Rangées d'immeubles de part et d'autre de la Rue du Milieu (~15 m).
const centers = new Map([
  ["ouest-1", [48.8405, 2.2915 - 0.0002]],
  ["ouest-2", [48.8415, 2.2915 - 0.0002]],
  ["est-1", [48.8405, 2.2915 + 0.0002]],
  ["est-2", [48.8415, 2.2915 + 0.0002]],
  ["rue-ouest", [48.8405, 2.29 + 0.0002]], // le long de la Rue Ouest
]);
const sector = (sid, ...troncons) => ({ id: sid, troncons });
const rows = (r) => ["ouest-1", "ouest-2", "est-1", "est-2"].map((k) => r.get(k) ?? null);

describe("plan des rues", () => {
  test("accroche au carrefour le plus proche, rien si trop loin", () => {
    expect(snap(graph, { lat: 48.84002, lng: 2.29152 })).toBe(id(0, 1));
    expect(snap(graph, { lat: 48.8455, lng: 2.2915 })).toBe(-1);
  });

  test("le tracé suit les rues (plus court chemin)", () => {
    const path = route(graph, id(0, 0), id(2, 2));
    expect(path[0]).toBe(id(0, 0));
    expect(path.at(-1)).toBe(id(2, 2));
    expect(path).toHaveLength(5);
    expect(coords(graph, [id(1, 1)])).toEqual([N(1, 1)]);
  });

  test("rue la plus proche d'un immeuble, avec son nom", () => {
    expect(nearestSegment(graph, centers.get("ouest-1")).name).toBe("Rue du Milieu");
  });
});

describe("secteurs en traits ouverts", () => {
  test("par défaut un tronçon couvre les deux côtés de la rue", () => {
    const r = assignBuildings([sector(1, { coords: versNord, cote: "deux" })], centers, graph);
    expect(rows(r)).toEqual([1, 1, 1, 1]);
    expect(r.has("rue-ouest")).toBe(false); // une autre rue n'est pas couverte
  });

  test("un seul côté : la rangée longée par la ligne", () => {
    // En allant vers le nord, la gauche est à l'ouest.
    expect(rows(assignBuildings([sector(1, { coords: versNord, cote: "gauche" })], centers, graph))).toEqual([1, 1, null, null]);
    expect(rows(assignBuildings([sector(1, { coords: versNord, cote: "droite" })], centers, graph))).toEqual([null, null, 1, 1]);
  });

  test("traits qui ne se rejoignent pas : chacun couvre sa rue", () => {
    const r = assignBuildings(
      [sector(1, { coords: versNord, cote: "gauche" }, { coords: [N(0, 0), N(1, 0)], cote: "deux" })],
      centers,
      graph
    );
    expect(r.get("ouest-1")).toBe(1);
    expect(r.get("rue-ouest")).toBe(1);
  });

  test("ligne au milieu pour les deux côtés, décalée pour un seul côté", () => {
    expect(legOffset({ cote: "deux" })).toBe(0);
    expect(legOffset({ cote: "gauche" })).toBe(-5);
    expect(legOffset({ cote: "droite" })).toBe(5);
    expect(otherSide("gauche")).toBe("droite");
  });

  test("rue partagée tracée dans des sens opposés : chaque secteur prend l'autre rangée", () => {
    const a = { coords: versNord, cote: "gauche" };
    const shared = sharedStreet(a, { coords: versSud });
    expect(shared).toEqual({ sameDirection: false });
    const b = { coords: versSud, cote: oppositeCote(a.cote, shared) };
    expect(rows(assignBuildings([sector(1, a), sector(2, b)], centers, graph))).toEqual([1, 1, 2, 2]);
    // Intervertir = chaque secteur passe de l'autre côté.
    const swapped = [sector(1, { ...a, cote: otherSide(a.cote) }), sector(2, { ...b, cote: otherSide(b.cote) })];
    expect(rows(assignBuildings(swapped, centers, graph))).toEqual([2, 2, 1, 1]);
  });

  test("rue partagée tracée dans le même sens", () => {
    const shared = sharedStreet({ coords: versNord }, { coords: [N(1, 1), N(2, 1)] });
    expect(shared).toEqual({ sameDirection: true });
    expect(oppositeCote("gauche", shared)).toBe("droite");
    expect(oppositeCote("deux", shared)).toBe("droite"); // un secteur « deux côtés » garde la gauche
    expect(sharedStreet({ coords: versNord }, { coords: [N(0, 0), N(1, 0)] })).toBeNull();
  });

  test("deux secteurs sur la même rangée : le premier créé l'emporte", () => {
    const r = assignBuildings(
      [sector(1, { coords: versNord, cote: "deux" }), sector(2, { coords: versSud, cote: "deux" })],
      centers,
      graph
    );
    expect(rows(r)).toEqual([1, 1, 1, 1]);
  });

  test("nom affiché au milieu du plus long tronçon", () => {
    expect(sectorLabelPosition(sector(1, { coords: [N(0, 0), N(1, 0)] }, { coords: versNord }))).toEqual(N(1, 1));
  });

  test("avancement : bâtiments à jour et boîtes aux lettres", () => {
    const now = new Date("2026-10-09T12:00:00Z");
    const records = new Map([
      ["ouest-1", { date: "2026-10-01T10:00:00Z", bal: 12 }],
      ["ouest-2", { date: "2026-06-01T10:00:00Z", bal: 8 }],
    ]);
    const r = assignBuildings([sector(1, { coords: versNord, cote: "gauche" })], centers, graph);
    expect(sectorStats(1, r, records, now)).toEqual({ total: 2, aJour: 1, pct: 50, bal: 20, balConnus: 2 });
  });
});
