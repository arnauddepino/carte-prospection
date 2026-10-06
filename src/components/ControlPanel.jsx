import { useState } from "react";

// Panneau en haut à droite : type de prospection en cours, création d'un
// type, filtre d'affichage.
export default function ControlPanel({ types, selectedType, onSelectType, filterType, onFilterType, onCreateType }) {
  const [newTypeName, setNewTypeName] = useState("");
  const toId = (value) => (value ? Number(value) : null);

  const create = async () => {
    const name = newTypeName.trim();
    if (!name) return;
    const { error } = await onCreateType(name);
    if (!error) setNewTypeName("");
  };

  return (
    <div className="control-panel">
      <div>
        <label htmlFor="type-select">Type :</label>
        <select id="type-select" value={selectedType ?? ""} onChange={(e) => onSelectType(toId(e.target.value))}>
          <option value="">-- Sélectionner --</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Nouveau type…"
          value={newTypeName}
          onChange={(e) => setNewTypeName(e.target.value)}
        />
        <button disabled={!newTypeName.trim()} onClick={create} title="Créer ce type">➕</button>
      </div>

      <div>
        <label htmlFor="filter-select">Filtrer :</label>
        <select id="filter-select" value={filterType ?? ""} onChange={(e) => onFilterType(toId(e.target.value))}>
          <option value="">-- Tous --</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
