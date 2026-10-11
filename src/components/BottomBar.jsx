import { choixFrom, choixValue, MODES } from "../lib/modes";
import Icon from "./Icon";

// Barre du bas, à portée de pouce : prospecter / éditer, prospection en cours
// (série de flyers pour le boîtage, ou porte-à-porte, gardiens, commerçants),
// localisation, tableau de bord, secteurs, légende et filtres.
export default function BottomBar({
  mode,
  onMode,
  types,
  selectedType,
  terrain = "boitage",
  onChoix,
  typeSelectRef,
  locating,
  onLocate,
  filterActive,
  onOpenSettings,
  onOpenSectors,
  onOpenDashboard,
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
          <label className={`type-chip${terrain !== "boitage" || selectedType ? "" : " is-empty"}`}>
            <span className="type-chip-label">Prospection</span>
            <select
              ref={typeSelectRef}
              aria-label="Prospection en cours"
              value={choixValue({ mode: terrain, typeId: selectedType })}
              onChange={(e) => onChoix(choixFrom(e.target.value))}
            >
              <option value="" disabled>
                Choisir…
              </option>
              <optgroup label="Boîtage : série de flyers">
                {types.map((t) => (
                  <option key={t.id} value={`t:${t.id}`}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Autres prospections">
                {MODES.filter((m) => m.value !== "boitage").map((m) => (
                  <option key={m.value} value={`m:${m.value}`}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
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
        <button className="icon-button" aria-label="Tableau de bord" onClick={onOpenDashboard}>
          <Icon name="chart" />
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
