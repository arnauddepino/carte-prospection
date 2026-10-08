import { describe, expect, test } from "vitest";
import { adressesOf, datesParAdresse, formatAdresses, oldestDate, partialColor, titreAdresses } from "./adresses";
import { AGE_STEPS, NEVER_COLOR } from "./colors";
import { applyPassage, passagePayload } from "./prospections";

const data = {
  rues: { "75115_3392": "Rue Leblanc", "75115_lrfm3a": "Square Max Hymans" },
  batiments: {
    "way/1": ["75115_3392_00012", "75115_3392_00014", "75115_3392_00014_b", "75115_lrfm3a_00003"],
    "way/2": ["75115_3392_00020"],
  },
};
const list = adressesOf("way/1", data);
const [a12, a14, a14b, a3] = list.map((a) => a.id);
const now = new Date("2026-10-08T12:00:00Z");

describe("adresses d'un bâtiment", () => {
  test("lecture des identifiants BAN", () => {
    expect(list.map((a) => a.label)).toEqual(["12 Rue Leblanc", "14 Rue Leblanc", "14 B Rue Leblanc", "3 Square Max Hymans"]);
    expect(adressesOf("way/9", data)).toEqual([]);
    expect(adressesOf("way/1", null)).toEqual([]);
  });

  test("regroupement par rue et titres", () => {
    expect(formatAdresses(list)).toBe("12, 14, 14 B Rue Leblanc · 3 Square Max Hymans");
    expect(formatAdresses(list, 2)).toBe("12, 14 Rue Leblanc et 2 autres");
    expect(titreAdresses(list)).toBe("12 Rue Leblanc (+3)");
    expect(titreAdresses(list.slice(0, 2))).toBe("12, 14 Rue Leblanc");
    expect(titreAdresses(adressesOf("way/2", data))).toBe("20 Rue Leblanc");
    expect(titreAdresses([])).toBeNull();
  });
});

describe("suivi par adresse", () => {
  const tout = (date) => ({ id_batiment: "way/1", date, prospection_type_id: 1 });
  const partiel = (date, adresses) => ({ ...tout(date), adresses });

  test("un passage complet couvre toutes les adresses", () => {
    const r = applyPassage(undefined, tout("2026-10-01T10:00:00Z"));
    expect(r).toMatchObject({ date: "2026-10-01T10:00:00Z", date_complet: "2026-10-01T10:00:00Z", adresses: null });
    expect([...datesParAdresse(r, list).values()]).toEqual(Array(4).fill("2026-10-01T10:00:00Z"));
    expect(partialColor(r, list, now)).toBeNull();
  });

  test("passage partiel : seules les adresses cochées sont rafraîchies", () => {
    let r = applyPassage(undefined, tout("2026-06-01T10:00:00Z"));
    r = applyPassage(r, partiel("2026-10-07T10:00:00Z", [a12, a14]));
    expect(r.date).toBe("2026-10-07T10:00:00Z");
    expect(r.date_complet).toBe("2026-06-01T10:00:00Z");
    const d = datesParAdresse(r, list);
    expect(d.get(a12)).toBe("2026-10-07T10:00:00Z");
    expect(d.get(a3)).toBe("2026-06-01T10:00:00Z");
    expect(oldestDate(r, list)).toBe("2026-06-01T10:00:00Z");
    expect(partialColor(r, list, now)).toBe(AGE_STEPS[4].color);
  });

  test("jamais complet : les adresses non cochées n'ont jamais été faites", () => {
    const r = applyPassage(undefined, partiel("2026-10-07T10:00:00Z", [a14b]));
    expect(r.date_complet).toBeNull();
    expect(oldestDate(r, list)).toBeNull();
    expect(partialColor(r, list, now)).toBe(NEVER_COLOR);
  });

  test("adresses faites à quelques jours d'écart : pas de hachures", () => {
    let r = applyPassage(undefined, partiel("2026-10-05T10:00:00Z", [a12, a14]));
    r = applyPassage(r, partiel("2026-10-07T10:00:00Z", [a14b, a3]));
    expect(partialColor(r, list, now)).toBeNull();
  });

  test("un passage complet efface les passages partiels plus anciens, pas les plus récents", () => {
    let r = applyPassage(undefined, partiel("2026-10-01T10:00:00Z", [a12]));
    r = applyPassage(r, partiel("2026-10-06T10:00:00Z", [a14]));
    r = applyPassage(r, tout("2026-10-03T10:00:00Z")); // daté après coup
    expect(r.date_complet).toBe("2026-10-03T10:00:00Z");
    expect(r.adresses).toEqual({ [a14]: "2026-10-06T10:00:00Z" });
    expect(r.date).toBe("2026-10-06T10:00:00Z");
  });

  test("passage partiel plus ancien que le dernier complet : sans effet", () => {
    const r = applyPassage(applyPassage(undefined, tout("2026-10-05T10:00:00Z")), partiel("2026-10-01T10:00:00Z", [a12]));
    expect(r.adresses).toBeNull();
  });

  test("fiche enregistrée avant le suivi par adresse (sans date_complet)", () => {
    const ancienne = { id_batiment: "way/1", date: "2026-10-01T10:00:00Z" };
    expect(oldestDate(ancienne, list)).toBe("2026-10-01T10:00:00Z");
    const r = applyPassage(ancienne, partiel("2026-10-07T10:00:00Z", [a12]));
    expect(r.date_complet).toBe("2026-10-01T10:00:00Z");
  });

  test("sans adresse connue, la date est celle du dernier passage", () => {
    expect(oldestDate({ date: "2026-10-01T10:00:00Z" }, [])).toBe("2026-10-01T10:00:00Z");
    expect(partialColor({ date: "2026-10-01T10:00:00Z" }, list.slice(0, 1), now)).toBeNull();
  });

  test("le passage n'envoie les adresses que s'il est partiel", () => {
    expect(passagePayload({ id_batiment: "way/1", typeId: 1 })).not.toHaveProperty("adresses");
    expect(passagePayload({ id_batiment: "way/1", typeId: 1, adresses: [] })).not.toHaveProperty("adresses");
    expect(passagePayload({ id_batiment: "way/1", typeId: 1, adresses: [a12] }).adresses).toEqual([a12]);
  });
});
