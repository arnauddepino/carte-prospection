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
export function SectorsSheet({ secteurs, stats, visible, onToggleVisible, onDraw, onEdit, onTour, onClose }) {
  return (
    <section className="sheet compact" aria-label="Secteurs">
      <SheetHeader
        title="Secteurs"
        subtitle="Avancement : bâtiments prospectés depuis moins de 30 jours"
        onClose={onClose}
      />
      <div className="sheet-body">
        {secteurs.length === 0 ? (
          <p className="hint">Aucun secteur. Dessinez le premier en touchant les carrefours des rues à couvrir.</p>
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
          Pour choisir les côtés de rue couverts ou supprimer un tronçon, touchez une ligne sur la carte pendant que
          ce panneau est ouvert.
        </p>
        <label className="checkbox">
          <input type="checkbox" checked={visible} onChange={(e) => onToggleVisible(e.target.checked)} />
          Afficher les secteurs sur la carte
        </label>
        <div className="field-inline">
          <button type="button" className="button secondary grow" onClick={onDraw}>
            Dessiner un secteur
          </button>
          {secteurs.length > 0 && (
            <button type="button" className="button primary grow" onClick={onTour}>
              Préparer une tournée
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// Création / modification d'un secteur (nom, couleur, responsable).
export function SectorEditSheet({ sector, auteurs, onSave, onDelete, onZoom, onExtend, onClose }) {
  const [form, setForm] = useState({ nom: sector.nom, couleur: sector.couleur, responsable: sector.responsable ?? "" });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const isNew = !sector.id;

  return (
    <section className="sheet" aria-label={isNew ? "Nouveau secteur" : "Secteur"}>
      <SheetHeader
        title={isNew ? "Nouveau secteur" : sector.nom}
        subtitle={`${sector.troncons.length} tronçon${sector.troncons.length > 1 ? "s" : ""} de rue`}
        onClose={onClose}
      />
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
          <div className="field-inline">
            <button type="button" className="button secondary grow" onClick={() => onZoom(sector)}>
              Voir sur la carte
            </button>
            <button type="button" className="button secondary grow" onClick={() => onExtend(sector)}>
              Compléter le tracé
            </button>
          </div>
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

// Un tronçon touché sur la carte : côtés de rue couverts, rue partagée avec un
// secteur voisin, suppression.
export function LegSheet({ sector, troncon, streetName, neighbors, onSetCote, onShare, onSwap, onDelete, onClose }) {
  const [confirm, setConfirm] = useState(false);
  const single = troncon.cote !== "deux";
  return (
    <section className="sheet compact" aria-label="Tronçon de secteur">
      <SheetHeader
        title={streetName ?? "Tronçon"}
        subtitle={`${sector.nom} · ${single ? "un seul côté de la rue" : "les deux côtés de la rue"}`}
        onClose={onClose}
      />
      <div className="sheet-body">
        <div className="segmented" role="group" aria-label="Côtés de la rue couverts">
          <button type="button" aria-pressed={!single} onClick={() => onSetCote("deux")}>
            Les deux côtés
          </button>
          <button type="button" aria-pressed={single} onClick={() => !single && onSetCote("gauche")}>
            Un seul côté
          </button>
        </div>
        {single && (
          <button type="button" className="button secondary" onClick={() => onSetCote(troncon.cote === "gauche" ? "droite" : "gauche")}>
            Passer la ligne de l’autre côté de la rue
          </button>
        )}
        <p className="hint">
          {single
            ? "La ligne longe la rangée d’immeubles couverte par le secteur."
            : "Ligne au milieu de la rue : les immeubles des deux côtés appartiennent au secteur."}
        </p>
        {neighbors.map((n) =>
          n.opposite ? (
            <button key={n.sector.id} type="button" className="button primary" onClick={() => onSwap(n)}>
              Intervertir les côtés avec « {n.sector.nom} »
            </button>
          ) : (
            <button key={n.sector.id} type="button" className="button primary" onClick={() => onShare(n)}>
              Partager la rue avec « {n.sector.nom} » (un côté chacun)
            </button>
          )
        )}
        {confirm ? (
          <button type="button" className="button danger" onClick={onDelete}>
            Confirmer la suppression du tronçon
          </button>
        ) : (
          <button type="button" className="button text-danger" onClick={() => setConfirm(true)}>
            Supprimer ce tronçon
          </button>
        )}
      </div>
    </section>
  );
}

// Barre de dessin, à la place de la barre du bas.
export function DrawBar({ color, legs, penDown, onUndo, onLiftPen, onFinish, onCancel }) {
  return (
    <nav className="bottom-bar draw-bar" aria-label="Dessin du secteur">
      <p className="draw-hint">
        <span className="sector-swatch" style={{ background: color }} aria-hidden="true" />
        {!penDown
          ? "Touchez le carrefour où commence le trait."
          : "Touchez le carrefour suivant : le trait suit les rues."}
      </p>
      <div className="bar-row">
        <button type="button" className="button secondary grow" disabled={!penDown && legs === 0} onClick={onUndo}>
          Annuler le point
        </button>
        <button type="button" className="button secondary grow" disabled={!penDown} onClick={onLiftPen}>
          Lever le crayon
        </button>
      </div>
      <div className="bar-row">
        <button type="button" className="button secondary grow" onClick={onCancel}>
          Abandonner
        </button>
        <button type="button" className="button primary grow" disabled={legs === 0} onClick={onFinish}>
          Terminer ({legs} tronçon{legs > 1 ? "s" : ""})
        </button>
      </div>
    </nav>
  );
}
