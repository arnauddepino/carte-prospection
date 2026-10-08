import { describe, expect, test } from "vitest";
import { applyQueue, enqueue, enqueueUndo, ficheOp, isRetryable, passageOp, removeFicheOp } from "./outbox";
import { passagePayload } from "./prospections";

const server = new Map([
  ["way/1", { id_batiment: "way/1", date: "2026-09-01T10:00:00Z", prospection_type_id: 1, code_entree: "A1" }],
]);

describe("file d'envoi", () => {
  test("un passage en attente s'affiche tout de suite, sans perdre le code", () => {
    const p = passagePayload({ id_batiment: "way/1", typeId: 2, auteur: "Léa" });
    const vue = applyQueue(server, [passageOp(p)]);
    expect(vue.get("way/1")).toMatchObject({ prospection_type_id: 2, dernier_auteur: "Léa", code_entree: "A1" });
    expect(server.get("way/1").prospection_type_id).toBe(1); // l'état serveur n'est pas modifié
  });

  test("chaque passage a son propre identifiant", () => {
    const a = passagePayload({ id_batiment: "way/1", typeId: 1 });
    const b = passagePayload({ id_batiment: "way/1", typeId: 1 });
    expect(a.client_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.client_id).not.toBe(b.client_id);
  });

  test("annuler un passage pas encore envoyé : retiré de la file", () => {
    const p = passagePayload({ id_batiment: "way/2", typeId: 1 });
    const q = enqueueUndo([passageOp(p)], p, undefined);
    expect(q).toEqual([]);
    expect(applyQueue(server, q).has("way/2")).toBe(false);
  });

  test("annuler un passage déjà envoyé : suppression programmée, fiche d'avant affichée", () => {
    const p = passagePayload({ id_batiment: "way/1", typeId: 2 });
    const apresEnvoi = new Map(server).set("way/1", { ...server.get("way/1"), prospection_type_id: 2 });
    const q = enqueueUndo([], p, server.get("way/1"));
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ type: "deletePassage", client_id: p.client_id });
    expect(applyQueue(apresEnvoi, q).get("way/1").prospection_type_id).toBe(1);
  });

  test("seule la dernière version d'une fiche en attente est gardée", () => {
    let q = enqueue([], ficheOp({ id_batiment: "way/1", code_entree: "B2" }));
    q = enqueue(q, passageOp(passagePayload({ id_batiment: "way/1", typeId: 1 })));
    q = enqueue(q, ficheOp({ id_batiment: "way/1", code_entree: "C3" }));
    expect(q.filter((o) => o.type === "fiche")).toHaveLength(1);
    expect(applyQueue(server, q).get("way/1").code_entree).toBe("C3");
  });

  test("suppression de fiche en attente : bâtiment retiré de l'affichage", () => {
    expect(applyQueue(server, [removeFicheOp("way/1")]).has("way/1")).toBe(false);
  });
});

describe("isRetryable", () => {
  test.each([
    [{ message: "TypeError: Failed to fetch" }, 0, true],
    [{ message: "Service Unavailable" }, 503, true],
    [{ message: "timeout" }, 408, true],
    [{ message: "AbortError: signal is aborted without reason" }, 0, true],
    [{ message: "JWT expired" }, 401, true],
    [{ message: "new row violates row-level security policy" }, 403, false],
    [{ message: "violates foreign key constraint" }, 409, false],
    [{ message: "new row violates check constraint" }, 400, false],
  ])("%o (HTTP %i) → %s", (error, status, attendu) => {
    expect(isRetryable(error, status)).toBe(attendu);
  });
});
