import { useState } from "react";
import { SECTOR_COLORS } from "../lib/secteurs";
import Icon from "./Icon";

function SheetHeader({ title, subtitle, onClose }) {
  return (
    <header className="sheet-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p className="sheet-subtitle">{subtitle}</p>}
      </div>
      <button className="icon-button" aria-label="Fermer" onClick={onClose}>
        <Icon name="close" />
      </button>
    </header>
  );
}

// Liste des secteurs avec leur avancement.
export function SectorsSheet({ secteurs, stats, visible, onToggleVisible, onDraw, onEdit, onClose }) {
  return (
    <section className="sheet compact" aria-label="Secteurs">
      <SheetHeader
        title="Secteurs"
        subtitle="Avancement : bâtiments prospectés depuis moins de 30 jours"
        onClose={onClose}
      />
      <div className="sheet-body">
        {secteurs.length === 0 ? (
          <p className="hint">Aucun secteur. Dessinez le premier en suivant les rues.</p>
        ) : (
          <ul className="sectors">
            {secteurs.map((s) => {
              const st = stats.get(s.id) ?? { total: 0, aJour: 0, pct: 0, bal: 0, balConnus: 0 };
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => onEdit(s)}>
                    <span className="sector-swatch" style={{ background: s.couleur }} aria-hidden="true" />
                    <span className="sector-main">
                      <strong>{s.nom}</strong>
                      <span>
                        {[s.responsable, `${st.aJour} / ${st.total} bâtiments à jour`].filter(Boolean).join(" · ")}
                      </span>
                      <span className="progress" aria-hidden="true">
                        <span style={{ width: `${st.pct}%`, background: s.couleur }} />
                      </span>
                      <span>
                        {st.balConnus ? `${st.bal} boîtes aux lettres connues (${st.balConnus} bâtiments)` : "Boîtes aux lettres non renseignées"}
                      </span>
                    </span>
                    <span className="sector-pct">{st.pct} %</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="hint">
          Pour choisir le côté de rue d’un secteur, touchez sa ligne sur la carte pendant que ce panneau est ouvert.
        </p>
        <label className="checkbox">
          <input type="checkbox" checked={visible} onChange={(e) => onToggleVisible(e.target.checked)} />
          Afficher les secteurs sur la carte
        </label>
        <button type="button" className="button primary" onClick={onDraw}>
          Dessiner un secteur
        </button>
      </div>
    </section>
  );
}

// Création / modification d'un secteur (nom, couleur, responsable).
export function SectorEditSheet({ sector, auteurs, onSave, onDelete, onZoom, onClose }) {
  const [form, setForm] = useState({ nom: sector.nom, couleur: sector.couleur, responsable: sector.responsable ?? "" });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const isNew = !sector.id;

  return (
    <section className="sheet" aria-label={isNew ? "Nouveau secteur" : "Secteur"}>
      <SheetHeader title={isNew ? "Nouveau secteur" : sector.nom} onClose={onClose} />
      <form
        className="sheet-body"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onSave({ ...form, nom: form.nom.trim(), responsable: form.responsable.trim() || null });
          setBusy(false);
        }}
      >
        <div className="field">
          <label htmlFor="sec-nom">Nom</label>
          <input id="sec-nom" type="text" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
        </div>

        <div className="field">
          <span className="field-label" id="sec-couleur">Couleur</span>
          <div className="color-choices" role="radiogroup" aria-labelledby="sec-couleur">
            {SECTOR_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={form.couleur === c.value}
                aria-label={c.label}
                title={c.label}
                style={{ background: c.value }}
                onClick={() => setForm({ ...form, couleur: c.value })}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="sec-resp">Responsable</label>
          <input
            id="sec-resp"
            type="text"
            list="sec-resp-list"
            placeholder="Prénom (facultatif)"
            value={form.responsable}
            onChange={(e) => setForm({ ...form, responsable: e.target.value })}
          />
          <datalist id="sec-resp-list">
            {auteurs.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>

        <button type="submit" className="button primary" disabled={busy || !form.nom.trim()}>
          {isNew ? "Créer le secteur" : "Enregistrer"}
        </button>
        {!isNew && (
          <button type="button" className="button secondary" onClick={() => onZoom(sector)}>
            Voir le secteur sur la carte
          </button>
        )}
        {!isNew &&
          (confirm ? (
            <button type="button" className="button danger" disabled={busy} onClick={() => onDelete(sector)}>
              Confirmer la suppression du secteur
            </button>
          ) : (
            <button type="button" className="button text-danger" onClick={() => setConfirm(true)}>
              Supprimer le secteur
            </button>
          ))}
      </form>
    </section>
  );
}

// Un tronçon touché sur la carte : changer de côté, ou intervertir avec le
// secteur voisin qui partage la même rue.
export function LegSheet({ sector, streetName, inverted, neighbors, onFlip, onSwap, onClose }) {
  return (
    <section className="sheet compact" aria-label="Tronçon de secteur">
      <SheetHeader
        title={streetName ?? "Tronçon"}
        subtitle={`${sector.nom} · ligne ${inverted ? "de l’autre côté de la rue" : "côté intérieur"}`}
        onClose={onClose}
      />
      <div className="sheet-body">
        <p className="hint">
          La rangée d’immeubles longée par la ligne colorée appartient au secteur.
        </p>
        {neighbors.map((n) => (
          <button key={n.sector.id} type="button" className="button primary" onClick={() => onSwap(n)}>
            Intervertir avec « {n.sector.nom} »
          </button>
        ))}
        <button type="button" className={`button ${neighbors.length ? "secondary" : "primary"}`} onClick={onFlip}>
          {inverted ? "Remettre la ligne côté intérieur" : "Passer la ligne de l’autre côté"}
        </button>
      </div>
    </section>
  );
}

// Barre de dessin, à la place de la barre du bas.
export function DrawBar({ color, points, onUndo, onFinish, onCancel }) {
  return (
    <nav className="bottom-bar draw-bar" aria-label="Dessin du secteur">
      <p className="draw-hint">
        <span className="sector-swatch" style={{ background: color }} aria-hidden="true" />
        {points === 0
          ? "Touchez un premier carrefour."
          : points < 3
            ? "Touchez le carrefour suivant : le trait suit les rues."
            : "Continuez, ou touchez le premier point pour fermer le secteur."}
      </p>
      <div className="bar-row">
        <button type="button" className="button secondary grow" onClick={onCancel}>
          Abandonner
        </button>
        <button type="button" className="button secondary grow" disabled={points === 0} onClick={onUndo}>
          Annuler le point
        </button>
        <button type="button" className="button primary grow" disabled={points < 3} onClick={onFinish}>
          Fermer
        </button>
      </div>
    </nav>
  );
}
