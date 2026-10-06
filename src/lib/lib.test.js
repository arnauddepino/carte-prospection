import { describe, expect, test } from "vitest";
import { AGE_STEPS, colorFor, NEVER_COLOR, styleFor } from "./colors";
import { fromDateInputValue, relativeDay, toDateInputValue } from "./dates";
import { formToPayload, indexByBuilding, recordToForm } from "./prospections";

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
    expect(styleFor(AGE_STEPS[0].color, true)).toMatchObject({ weight: 3, fillColor: AGE_STEPS[0].color });
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

describe("indexByBuilding", () => {
  test("garde la ligne la plus récente en cas de doublon", () => {
    const index = indexByBuilding([
      { id_batiment: "way/1", date: "2026-01-01T10:00:00Z", infos: "ancien" },
      { id_batiment: "way/1", date: "2026-05-01T10:00:00Z", infos: "récent" },
      { id_batiment: "way/2", date: "2026-02-01T10:00:00Z" },
    ]);
    expect(index.size).toBe(2);
    expect(index.get("way/1").infos).toBe("récent");
  });
});

describe("formToPayload", () => {
  const record = {
    id_batiment: "way/1",
    date: "2026-09-01T08:15:00.000Z",
    prospection_type_id: 3,
    bal: 0,
    code_entree: "A1234",
    infos: "gardien le matin",
  };

  test("conserve le type du bâtiment au lieu du type sélectionné", () => {
    const payload = formToPayload(recordToForm("way/1", record), 7);
    expect(payload.prospection_type_id).toBe(3);
  });

  test("utilise le type sélectionné pour un bâtiment neuf", () => {
    expect(formToPayload(recordToForm("way/9", undefined), 7).prospection_type_id).toBe(7);
  });

  test("refuse sans aucun type", () => {
    expect(formToPayload(recordToForm("way/9", undefined), null)).toBeNull();
  });

  test("date inchangée → date d'origine conservée à l'identique", () => {
    expect(formToPayload(recordToForm("way/1", record), null).date).toBe(record.date);
  });

  test("BAL à 0 conservé, champs vides → null", () => {
    expect(recordToForm("way/1", record).bal).toBe(0);
    const payload = formToPayload({ ...recordToForm("way/1", record), code_entree: "  ", infos: "" }, null);
    expect(payload).toMatchObject({ bal: 0, code_entree: null, infos: null });
  });
});
