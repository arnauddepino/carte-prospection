import Icon from "./Icon";

const toId = (value) => (value ? Number(value) : null);

// Barre du bas, à portée de pouce : mode, type en cours, localisation,
// légende et filtres.
export default function BottomBar({
  mode,
  onMode,
  types,
  selectedType,
  onSelectType,
  typeSelectRef,
  locating,
  onLocate,
  filterActive,
  onOpenSettings,
  onOpenSectors,
}) {
  return (
    <nav className="bottom-bar" aria-label="Outils">
      <div className="segmented" role="group" aria-label="Mode">
        <button aria-pressed={mode === "prospect"} onClick={() => onMode("prospect")}>
          Prospecter
        </button>
        <button aria-pressed={mode === "edit"} onClick={() => onMode("edit")}>
          Éditer
        </button>
      </div>

      <div className="bar-row">
        {mode === "prospect" ? (
          <label className={`type-chip${selectedType ? "" : " is-empty"}`}>
            <span className="type-chip-label">Type</span>
            <select
              ref={typeSelectRef}
              value={selectedType ?? ""}
              onChange={(e) => onSelectType(toId(e.target.value))}
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
          </label>
        ) : (
          <p className="bar-hint">Touchez un bâtiment pour ouvrir sa fiche</p>
        )}

        <button
          className="icon-button"
          aria-label="Me localiser"
          aria-pressed={locating}
          onClick={onLocate}
        >
          <Icon name="locate" />
        </button>
        <button className="icon-button" aria-label="Secteurs" onClick={onOpenSectors}>
          <Icon name="sectors" />
        </button>
        <button
          className={`icon-button${filterActive ? " has-dot" : ""}`}
          aria-label={filterActive ? "Légende et filtres (filtre actif)" : "Légende et filtres"}
          onClick={onOpenSettings}
        >
          <Icon name="layers" />
        </button>
      </div>
    </nav>
  );
}
