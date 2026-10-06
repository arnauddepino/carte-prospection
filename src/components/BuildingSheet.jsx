import { useEffect, useState } from "react";
import { reverseAddress } from "../lib/adresse";
import { relativeDay, toDateInputValue } from "../lib/dates";
import { recordToForm } from "../lib/prospections";
import Icon from "./Icon";

const osmLabel = (p = {}) =>
  p.name || (p["addr:housenumber"] && p["addr:street"] ? `${p["addr:housenumber"]} ${p["addr:street"]}` : null);

// Fiche d'un bâtiment, qui monte du bas de l'écran.
export default function BuildingSheet({ building, record, types, selectedType, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(() => ({
    ...recordToForm(building.id, record),
    typeId: record?.prospection_type_id ?? selectedType,
  }));
  const [address, setAddress] = useState(osmLabel(building.properties));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Adresse la plus proche de l'endroit touché.
  useEffect(() => {
    let cancelled = false;
    reverseAddress(building.latlng)
      .then((label) => !cancelled && label && setAddress((current) => current ?? label))
      .catch(() => {}); // sans réseau, on garde le titre par défaut
    return () => {
      cancelled = true;
    };
  }, [building]);

  const field = (name) => ({
    value: form[name],
    onChange: (e) => setForm({ ...form, [name]: e.target.value }),
  });

  const run = async (action) => {
    setBusy(true);
    await action();
    setBusy(false);
  };

  const typeName = (id) => types.find((t) => t.id === id)?.name;

  return (
    <section className="sheet" aria-label="Fiche du bâtiment">
      <header className="sheet-header">
        <div>
          <h2>{address ?? "Bâtiment"}</h2>
          <p className="sheet-subtitle">
            {record
              ? `Dernier passage ${relativeDay(record.date)}${typeName(record.prospection_type_id) ? ` · ${typeName(record.prospection_type_id)}` : ""}`
              : "Jamais prospecté"}
          </p>
        </div>
        <button className="icon-button" aria-label="Fermer la fiche" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>

      <form
        className="sheet-body"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => onSave(form));
        }}
      >
        <div className="field">
          <label htmlFor="f-date">Date du passage</label>
          <div className="field-inline">
            <input id="f-date" type="date" {...field("date")} />
            <button
              type="button"
              className="button secondary"
              onClick={() => setForm({ ...form, date: toDateInputValue(new Date().toISOString()) })}
            >
              Aujourd’hui
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="f-type">Type de prospection</label>
          <select
            id="f-type"
            value={form.typeId ?? ""}
            onChange={(e) => setForm({ ...form, typeId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="" disabled>
              Choisir un type…
            </option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field-pair">
          <div className="field">
            <label htmlFor="f-bal">Boîtes aux lettres</label>
            <input id="f-bal" type="number" min="0" inputMode="numeric" {...field("bal")} />
          </div>
          <div className="field">
            <label htmlFor="f-code">Code d’entrée</label>
            <input id="f-code" type="text" autoComplete="off" autoCapitalize="characters" {...field("code_entree")} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="f-infos">Infos</label>
          <textarea id="f-infos" rows="2" {...field("infos")} />
        </div>

        <div className="sheet-actions">
          <button type="submit" className="button primary" disabled={busy}>
            Enregistrer
          </button>
          {record &&
            (confirmDelete ? (
              <button type="button" className="button danger" disabled={busy} onClick={() => run(onDelete)}>
                Confirmer la suppression
              </button>
            ) : (
              <button type="button" className="button text-danger" onClick={() => setConfirmDelete(true)}>
                Supprimer
              </button>
            ))}
        </div>
      </form>
    </section>
  );
}
