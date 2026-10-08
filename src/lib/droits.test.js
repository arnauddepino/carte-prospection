import { describe, expect, test } from "vitest";
import { canDeleteFiche, canDeletePassage, canEditFiche, canEditSectors } from "./droits";
import { applyPassage } from "./prospections";

const lea = { uid: "lea", isAdmin: false };
const owen = { uid: "owen", isAdmin: false };
const admin = { uid: "arnaud", isAdmin: true };

describe("droits", () => {
  test("fiche : auteur du dernier passage, fiche sans auteur identifié, ou admin", () => {
    const fiche = { dernier_auteur_id: "lea" };
    expect(canEditFiche(fiche, lea)).toBe(true);
    expect(canEditFiche(fiche, owen)).toBe(false);
    expect(canEditFiche(fiche, admin)).toBe(true);
    expect(canEditFiche({ dernier_auteur_id: null }, owen)).toBe(true);
    expect(canEditFiche(undefined, owen)).toBe(true);
  });

  test("passage : son auteur ou l'admin ; un passage sans auteur identifié, l'admin seul", () => {
    expect(canDeletePassage({ auteur_id: "lea" }, lea)).toBe(true);
    expect(canDeletePassage({ auteur_id: "lea" }, owen)).toBe(false);
    expect(canDeletePassage({ auteur_id: "lea" }, admin)).toBe(true);
    expect(canDeletePassage({ auteur_id: null }, lea)).toBe(false);
  });

  test("suppression de fiche et secteurs : admin seulement", () => {
    expect(canDeleteFiche(lea)).toBe(false);
    expect(canEditSectors(lea)).toBe(false);
    expect(canDeleteFiche(admin)).toBe(true);
    expect(canEditSectors(admin)).toBe(true);
  });

  test("après mon passage, je deviens l'auteur du dernier passage (même hors ligne)", () => {
    const fiche = { id_batiment: "way/1", date: "2026-09-01T10:00:00Z", dernier_auteur_id: "lea" };
    const apres = applyPassage(fiche, { id_batiment: "way/1", date: "2026-10-08T10:00:00Z", prospection_type_id: 1, auteur: "Owen", auteur_id: "owen" });
    expect(canEditFiche(apres, owen)).toBe(true);
    expect(canEditFiche(apres, lea)).toBe(false);
  });
});
