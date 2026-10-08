import { describe, expect, test } from "vitest";
import { AGE_STEPS, colorFor, NEVER_COLOR, styleFor } from "./colors";
import { fromDateInputValue, relativeDay, toDateInputValue } from "./dates";
import { fichesCsv, passagesCsv } from "./csv";
import {
  applyPassage,
  formToPayload,
  hasFilters,
  matchesFilters,
  NO_FILTERS,
  passagePayload,
  recordToForm,
} from "./prospections";

const daysAgo = (n, now) => new Date(now.getTime() - n * 24 * 3600 * 1000).toISOString();

describe("colorFor", () => {
  const now = new Date("2026-10-06T12:00:00");

  test("jamais prospecté → gris", () => {
    expect(colorFor(null, now)).toBe(NEVER_COLOR);
  });

  test.each([
    [0, 0], [6, 0], [7, 1], [13, 1], [14, 2], [29, 2], [30, 3], [89, 3], [90, 4], [400, 4],
  ])("%i jours → palier %i", (days, step) => {
    expect(colorFor(daysAgo(days, now), now)).toBe(AGE_STEPS[step].color);
  });

  test("bâtiment jamais prospecté discret, bâtiment ouvert cerclé", () => {
    expect(styleFor(NEVER_COLOR).fillOpacity).toBeLessThan(styleFor(AGE_STEPS[4].color).fillOpacity);
    expect(styleFor(AGE_STEPS[0].color, { selected: true })).toMatchObject({ weight: 3, fillColor: AGE_STEPS[0].color });
    expect(styleFor(AGE_STEPS[0].color, { inaccessible: true }).dashArray).toBeTruthy();
    expect(styleFor(AGE_STEPS[0].color, { hidden: true }).fillOpacity).toBe(0);
  });
});

describe("relativeDay", () => {
  const now = new Date(2026, 9, 6, 9, 0);
  test.each([
    [new Date(2026, 9, 6, 8, 0), "aujourd’hui"],
    [new Date(2026, 9, 5, 23, 30), "hier"],
    [new Date(2026, 9, 1, 12, 0), "il y a 5 jours"],
  ])("%s → %s", (date, label) => {
    expect(relativeDay(date.toISOString(), now)).toBe(label);
  });
});

describe("dates", () => {
  test("aller-retour sur le même jour local", () => {
    expect(toDateInputValue(fromDateInputValue("2026-03-29"))).toBe("2026-03-29");
  });

  test("un passage juste après minuit reste sur le bon jour", () => {
    const local = new Date(2026, 9, 6, 0, 30); // 6 octobre, 0 h 30 heure locale
    expect(toDateInputValue(local.toISOString())).toBe("2026-10-06");
  });
});

describe("fiche", () => {
  const record = {
    id_batiment: "way/1",
    date: "2026-09-01T08:15:00+00:00",
    prospection_type_id: 3,
    dernier_auteur: "Léa",
    bal: 0,
    code_entree: "A1234",
    infos: "gardien le matin",
    acces: "code",
    logement_social: true,
  };

  test("aller-retour fiche → formulaire → ligne, BAL à 0 conservé", () => {
    const form = recordToForm("way/1", record);
    expect(form.bal).toBe(0);
    expect(formToPayload(form)).toEqual({
      id_batiment: "way/1", acces: "code", logement_social: true, bal: 0, code_entree: "A1234", infos: "gardien le matin",
    });
  });

  test("la fiche n'envoie ni date ni type (ils viennent des passages)", () => {
    const payload = formToPayload(recordToForm("way/1", record));
    expect(payload).not.toHaveProperty("date");
    expect(payload).not.toHaveProperty("prospection_type_id");
  });

  test("champs vides → null, accès désélectionné → null", () => {
    const payload = formToPayload({ ...recordToForm("way/9", undefined), code_entree: "  ", acces: "" });
    expect(payload).toMatchObject({ bal: null, code_entree: null, infos: null, acces: null, logement_social: false });
  });
});

describe("passages", () => {
  test("tap : date de maintenant, type et prénom", () => {
    const p = passagePayload({ id_batiment: "way/1", typeId: 2, auteur: " Arnaud " });
    expect(p).toMatchObject({ id_batiment: "way/1", prospection_type_id: 2, auteur: "Arnaud" });
    expect(Date.now() - new Date(p.date)).toBeLessThan(5000);
  });

  test("passage daté depuis la fiche : bon jour local", () => {
    expect(toDateInputValue(passagePayload({ id_batiment: "x", date: "2026-03-29", typeId: 1 }).date)).toBe("2026-03-29");
  });

  test("un passage plus récent met la fiche à jour, un plus ancien non", () => {
    const record = { id_batiment: "way/1", date: "2026-09-01T10:00:00Z", prospection_type_id: 1, code_entree: "A1" };
    const recent = applyPassage(record, { id_batiment: "way/1", date: "2026-10-01T10:00:00Z", prospection_type_id: 2, auteur: "Léa" });
    expect(recent).toMatchObject({ prospection_type_id: 2, dernier_auteur: "Léa", code_entree: "A1" });
    const ancien = applyPassage(record, { id_batiment: "way/1", date: "2025-01-01T10:00:00Z", prospection_type_id: 3 });
    expect(ancien).toMatchObject({ date: record.date, prospection_type_id: 1, date_complet: record.date });
    expect(applyPassage(undefined, { id_batiment: "way/2", date: "2026-10-01T10:00:00Z", prospection_type_id: 1 }).id_batiment).toBe("way/2");
  });
});

describe("filtres", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  const recent = { date: "2026-10-01T10:00:00Z", prospection_type_id: 1, dernier_auteur: "Léa", code_entree: "A1", acces: "code" };
  const ancien = { date: "2026-06-01T10:00:00Z", prospection_type_id: 2, dernier_auteur: "Arnaud", acces: "inaccessible", logement_social: true };

  test("sans filtre, tout correspond", () => {
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(matchesFilters(undefined, NO_FILTERS, now)).toBe(true);
  });

  test.each([
    [{ typeId: 1 }, true, false],
    [{ auteur: "Arnaud" }, false, true],
    [{ avecCode: true }, true, false],
    [{ inaccessible: true }, false, true],
    [{ social: true }, false, true],
    [{ age: "recent" }, true, false],
    [{ age: "a-refaire" }, false, true],
    [{ typeId: 1, avecCode: true }, true, false],
  ])("%o → récent %s, ancien %s", (f, attenduRecent, attenduAncien) => {
    const filters = { ...NO_FILTERS, ...f };
    expect(hasFilters(filters)).toBe(true);
    expect(matchesFilters(recent, filters, now)).toBe(attenduRecent);
    expect(matchesFilters(ancien, filters, now)).toBe(attenduAncien);
  });

  test("« à refaire » inclut les bâtiments jamais prospectés", () => {
    expect(matchesFilters(undefined, { ...NO_FILTERS, age: "a-refaire" }, now)).toBe(true);
  });
});

describe("export CSV", () => {
  const types = [{ id: 1, name: "Flyer A" }];
  test("fiches : en-têtes, séparateur « ; », guillemets et BOM", () => {
    const records = new Map([
      ["way/1", { id_batiment: "way/1", date: "2026-10-01T10:00:00Z", prospection_type_id: 1, dernier_auteur: "Léa", bal: 12, acces: "code", code_entree: "A1", infos: 'dit "bonjour"; sympa', logement_social: true }],
    ]);
    const csv = fichesCsv(records, types, new Map([["way/1", [48.8451234, 2.2912346]]]));
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const [header, line] = csv.slice(1).split("\r\n");
    expect(header.split(";")[0]).toBe("Bâtiment");
    expect(line).toContain(";Flyer A;Léa;12;Saisie dans l’appli;Code;A1;oui;");
    expect(line).toContain('"dit ""bonjour""; sympa"');
    expect(line.endsWith(";48.845123;2.291235")).toBe(true);
  });

  test("historique : une ligne par passage", () => {
    const csv = passagesCsv([{ date: "2026-10-01T10:00:00Z", id_batiment: "way/1", prospection_type_id: 1, auteur: "Léa" }], types);
    expect(csv.slice(1).split("\r\n")).toHaveLength(2);
  });

  test("adresses : toutes pour la fiche, celles cochées pour un passage partiel", () => {
    const list = [
      { id: "a12", numero: "12", rue: "Rue Leblanc" },
      { id: "a14", numero: "14", rue: "Rue Leblanc" },
    ];
    const records = new Map([["way/1", { id_batiment: "way/1", date: "2026-10-01T10:00:00Z", prospection_type_id: 1 }]]);
    const fiches = fichesCsv(records, types, new Map(), undefined, () => list).slice(1).split("\r\n");
    expect(fiches[0].split(";")[1]).toBe("Adresses");
    expect(fiches[1]).toContain("way/1;12, 14 Rue Leblanc;");
    const passages = [
      { date: "2026-10-01T10:00:00Z", id_batiment: "way/1", prospection_type_id: 1, adresses: ["a14"] },
      { date: "2026-09-01T10:00:00Z", id_batiment: "way/1", prospection_type_id: 1 },
    ];
    const lines = passagesCsv(passages, types, () => list).slice(1).split("\r\n");
    expect(lines[1]).toContain("way/1;14 Rue Leblanc;oui;Flyer A");
    expect(lines[2]).toContain("way/1;12, 14 Rue Leblanc;;Flyer A");
  });
});
