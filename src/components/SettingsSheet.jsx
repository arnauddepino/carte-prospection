import { useState } from "react";
import { AGE_STEPS, NEVER_COLOR, SOCIAL_COLOR, styleFor } from "../lib/colors";
import { hasFilters, NO_FILTERS } from "../lib/prospections";
import Icon from "./Icon";

const LEGEND = [...AGE_STEPS, { color: NEVER_COLOR, label: "Jamais prospecté" }];

// partial : couleur de l'adresse la plus ancienne (hachures, comme sur la carte) ;
// social : gris barré de croisillons.
const CROISILLONS = `repeating-linear-gradient(45deg, ${SOCIAL_COLOR} 0 1px, transparent 1px 6px), repeating-linear-gradient(-45deg, ${SOCIAL_COLOR} 0 1px, #d4d4d4 1px 6px)`;
function Swatch({ color, inaccessible = false, partial = null, social = false }) {
  const { fillColor, fillOpacity, color: stroke, dashArray } = styleFor(color, { inaccessible, social });
  const background = social
    ? CROISILLONS
    : partial
      ? `repeating-linear-gradient(-45deg, ${color} 0 3px, ${partial} 3px 7px)`
      : fillColor;
  return (
    <span className={`swatch${dashArray ? " dashed" : ""}`} style={{ borderColor: stroke }} aria-hidden="true">
      <span style={{ background, opacity: fillOpacity }} />
    </span>
  );
}

// Légende, filtres d'affichage, types de prospection, export et prénom.
export default function SettingsSheet({
  types,
  secteurs = [],
  auteurs,
  filters,
  onFilters,
  onCreateType,
  onExport,
  auteur,
  isAdmin = false,
  onChangeAuteur,
  onClose,
}) {
  const [newTypeName, setNewTypeName] = useState("");
  const set = (patch) => onFilters({ ...filters, ...patch });
  const toId = (value) => (value ? Number(value) : null);

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
          <li>
            <Swatch color={AGE_STEPS[2].color} inaccessible />
            Contour en pointillés : inaccessible
          </li>
          <li>
            <Swatch color={AGE_STEPS[0].color} partial={AGE_STEPS[4].color} />
            Hachures : fait en partie (certaines adresses seulement)
          </li>
          <li>
            <Swatch color={NEVER_COLOR} social />
            Gris barré : logement social, hors cible
          </li>
        </ul>

        <h3>Filtres</h3>
        {secteurs.length > 0 && (
          <div className="field">
            <label htmlFor="flt-secteur">Secteur</label>
            <select id="flt-secteur" value={filters.secteurId ?? ""} onChange={(e) => set({ secteurId: toId(e.target.value) })}>
              <option value="">Tous les secteurs</option>
              {secteurs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="flt-type">Type de prospection</label>
          <select id="flt-type" value={filters.typeId ?? ""} onChange={(e) => set({ typeId: toId(e.target.value) })}>
            <option value="">Tous les types</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field-pair">
          <div className="field">
            <label htmlFor="flt-auteur">Dernier passage par</label>
            <select id="flt-auteur" value={filters.auteur ?? ""} onChange={(e) => set({ auteur: e.target.value || null })}>
              <option value="">Tout le monde</option>
              {auteurs.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="flt-age">Ancienneté</label>
            <select id="flt-age" value={filters.age ?? ""} onChange={(e) => set({ age: e.target.value || null })}>
              <option value="">Toutes</option>
              <option value="recent">Moins de 30 jours</option>
              <option value="a-refaire">À refaire (30 jours et +)</option>
            </select>
          </div>
        </div>
        <div className="checkboxes">
          <label className="checkbox">
            <input type="checkbox" checked={filters.avecCode} onChange={(e) => set({ avecCode: e.target.checked })} />
            Avec code connu
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={filters.inaccessible} onChange={(e) => set({ inaccessible: e.target.checked })} />
            Inaccessibles
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={filters.social} onChange={(e) => set({ social: e.target.checked })} />
            Logements sociaux
          </label>
        </div>
        {hasFilters(filters) && (
          <>
            <p className="hint">Les bâtiments qui ne correspondent pas aux filtres sont estompés.</p>
            <button type="button" className="button secondary" onClick={() => onFilters(NO_FILTERS)}>
              Effacer les filtres
            </button>
          </>
        )}

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

        <h3>Exporter (Excel / CSV)</h3>
        <div className="field-inline">
          <button type="button" className="button secondary grow" onClick={() => onExport("fiches")}>
            Fiches
          </button>
          <button type="button" className="button secondary grow" onClick={() => onExport("passages")}>
            Historique
          </button>
        </div>

        <h3>Vous</h3>
        <div className="field-inline identity-row">
          <span>
            {auteur}
            <span className="role-label">{isAdmin ? "Administrateur" : "Utilisateur"}</span>
          </span>
          <button type="button" className="button secondary" onClick={onChangeAuteur}>
            Changer de prénom
          </button>
        </div>
      </div>
    </section>
  );
}
