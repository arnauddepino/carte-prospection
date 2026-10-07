import { BAL_SOURCES } from "./bal";
import { accesLabel } from "./prospections";

// CSV pour Excel en français : séparateur « ; », BOM UTF-8 pour les accents.
function toCsv(columns, rows) {
  const cell = (value) => {
    const text = value == null ? "" : String(value);
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((c) => cell(c.label)).join(";")];
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(";"));
  return "﻿" + lines.join("\r\n");
}

const dateFr = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "");

// infoOf(id) → { value, source } : boîtes aux lettres retenues et provenance.
export function fichesCsv(records, types, centers = new Map(), infoOf = (id) => ({ value: records.get(id)?.bal ?? null, source: records.get(id)?.bal != null ? "saisie" : null })) {
  const typeName = (id) => types.find((t) => t.id === id)?.name ?? "";
  const rows = [...records.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return toCsv(
    [
      { label: "Bâtiment", value: (r) => r.id_batiment },
      { label: "Dernier passage", value: (r) => dateFr(r.date) },
      { label: "Type", value: (r) => typeName(r.prospection_type_id) },
      { label: "Par", value: (r) => r.dernier_auteur },
      { label: "Boîtes aux lettres", value: (r) => infoOf(r.id_batiment).value },
      { label: "Source BAL", value: (r) => BAL_SOURCES[infoOf(r.id_batiment).source]?.long ?? "" },
      { label: "Accès", value: (r) => accesLabel(r.acces) },
      { label: "Code d'entrée", value: (r) => r.code_entree },
      { label: "Logement social", value: (r) => (r.logement_social ? "oui" : "") },
      { label: "Infos", value: (r) => r.infos },
      { label: "Latitude", value: (r) => centers.get(r.id_batiment)?.[0]?.toFixed(6) },
      { label: "Longitude", value: (r) => centers.get(r.id_batiment)?.[1]?.toFixed(6) },
    ],
    rows
  );
}

export function passagesCsv(passages, types) {
  const typeName = (id) => types.find((t) => t.id === id)?.name ?? "";
  return toCsv(
    [
      { label: "Date", value: (p) => dateFr(p.date) },
      { label: "Bâtiment", value: (p) => p.id_batiment },
      { label: "Type", value: (p) => typeName(p.prospection_type_id) },
      { label: "Par", value: (p) => p.auteur },
    ],
    passages
  );
}

// Fait télécharger un fichier texte par le navigateur.
export function downloadText(filename, text, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
