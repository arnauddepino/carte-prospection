import { useState } from "react";
import { AGE_STEPS, NEVER_COLOR, styleFor } from "../lib/colors";
import Icon from "./Icon";

const LEGEND = [...AGE_STEPS, { color: NEVER_COLOR, label: "Jamais prospecté" }];

function Swatch({ color }) {
  const { fillColor, fillOpacity, color: stroke } = styleFor(color);
  return (
    <span className="swatch" style={{ borderColor: stroke }} aria-hidden="true">
      <span style={{ background: fillColor, opacity: fillOpacity }} />
    </span>
  );
}

// Légende des couleurs, filtre par type et création de types.
export default function SettingsSheet({ types, filterType, onFilterType, onCreateType, onClose }) {
  const [newTypeName, setNewTypeName] = useState("");

  const create = async (e) => {
    e.preventDefault();
    const name = newTypeName.trim();
    if (!name) return;
    const { error } = await onCreateType(name);
    if (!error) setNewTypeName("");
  };

  return (
    <section className="sheet" aria-label="Légende et filtres">
      <header className="sheet-header">
        <h2>Légende et filtres</h2>
        <button className="icon-button" aria-label="Fermer" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>

      <div className="sheet-body">
        <h3>Dernier passage</h3>
        <ul className="legend">
          {LEGEND.map((step) => (
            <li key={step.label}>
              <Swatch color={step.color} />
              {step.label}
            </li>
          ))}
        </ul>

        <h3>Afficher</h3>
        <div className="field">
          <select
            aria-label="Filtrer par type de prospection"
            value={filterType ?? ""}
            onChange={(e) => onFilterType(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Tous les types</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} uniquement
              </option>
            ))}
          </select>
          {filterType && <p className="hint">Les bâtiments d’un autre type apparaissent en gris.</p>}
        </div>

        <h3>Nouveau type de prospection</h3>
        <form className="field-inline" onSubmit={create}>
          <input
            type="text"
            placeholder="Ex. : Flyer estimation octobre"
            aria-label="Nom du nouveau type"
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.target.value)}
          />
          <button type="submit" className="button secondary" disabled={!newTypeName.trim()}>
            Créer
          </button>
        </form>
      </div>
    </section>
  );
}
