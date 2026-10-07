import { useMemo, useState } from "react";
import { accesLabel } from "../lib/prospections";
import BalBadge from "./BalBadge";
import Icon from "./Icon";

const DELAIS = [15, 30, 60, 90];
const fmt = (n) => Math.round(n).toLocaleString("fr-FR");
const km = (m) => `${(m / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;

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

// Flyers à prévoir, détaillés par provenance (pour savoir ce qui est fiable).
export function FlyersPlan({ plan }) {
  return (
    <div className="flyers-plan">
      <p className="flyers-total">
        Prévoir <strong>≈ {fmt(plan.total)} flyers</strong>
      </p>
      <ul>
        {plan.registre.n > 0 && (
          <li>
            <BalBadge info={{ value: plan.registre.bal, source: "registre" }} compact /> pour {plan.registre.n} bâtiment
            {plan.registre.n > 1 ? "s" : ""}
          </li>
        )}
        {plan.saisie.n > 0 && (
          <li>
            <BalBadge info={{ value: plan.saisie.bal, source: "saisie" }} compact /> pour {plan.saisie.n} bâtiment
            {plan.saisie.n > 1 ? "s" : ""}
          </li>
        )}
        {plan.estimation.n > 0 && (
          <li>
            <BalBadge info={{ value: plan.estimation.bal, source: "estimation" }} compact /> pour {plan.estimation.n} bâtiment
            {plan.estimation.n > 1 ? "s" : ""}
          </li>
        )}
        {plan.inconnu > 0 && (
          <li className="hint">
            {plan.inconnu} bâtiment{plan.inconnu > 1 ? "s" : ""} sans donnée (commerces, bureaux…)
          </li>
        )}
        {plan.marge > 0 && <li className="hint">+ {fmt(plan.marge)} de marge (10 %)</li>}
      </ul>
    </div>
  );
}

// Préparer une tournée : secteur, type, bâtiments à faire, flyers à prévoir.
export function TourSetupSheet({ secteurs, defaultSecteurId, types, defaultTypeId, candidates, planOf, onStart, onClose }) {
  const [params, setParams] = useState({
    secteurId: defaultSecteurId,
    typeId: defaultTypeId,
    days: 30,
    includeInaccessible: false,
    fromMyPosition: true,
  });
  const [busy, setBusy] = useState(false);
  const set = (patch) => setParams({ ...params, ...patch });
  const ids = useMemo(() => (params.secteurId ? candidates(params) : []), [params, candidates]);
  const plan = useMemo(() => planOf(ids), [ids, planOf]);

  return (
    <section className="sheet" aria-label="Préparer une tournée">
      <SheetHeader title="Préparer une tournée" onClose={onClose} />
      <form
        className="sheet-body"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onStart(params, ids);
          setBusy(false);
        }}
      >
        <div className="field-pair">
          <div className="field">
            <label htmlFor="t-secteur">Secteur</label>
            <select id="t-secteur" value={params.secteurId ?? ""} onChange={(e) => set({ secteurId: Number(e.target.value) || null })}>
              <option value="" disabled>
                Choisir…
              </option>
              {secteurs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="t-type">Flyer distribué</label>
            <select id="t-type" value={params.typeId ?? ""} onChange={(e) => set({ typeId: Number(e.target.value) || null })}>
              <option value="" disabled>
                Choisir…
              </option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <span className="field-label" id="t-delai">Bâtiments sans passage depuis</span>
          <div className="segmented four" role="group" aria-labelledby="t-delai">
            {DELAIS.map((d) => (
              <button key={d} type="button" aria-pressed={params.days === d} onClick={() => set({ days: d })}>
                {d} j
              </button>
            ))}
          </div>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={params.includeInaccessible} onChange={(e) => set({ includeInaccessible: e.target.checked })} />
          Inclure les bâtiments inaccessibles
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={params.fromMyPosition} onChange={(e) => set({ fromMyPosition: e.target.checked })} />
          Partir de ma position (sinon, du meilleur point de départ)
        </label>

        <div className="tour-summary">
          <p>
            <strong>{fmt(ids.length)} bâtiment{ids.length > 1 ? "s" : ""}</strong> à faire
            {params.days ? ` (sans passage depuis ${params.days} jours)` : ""}
          </p>
          {ids.length > 0 && <FlyersPlan plan={plan} />}
        </div>

        <button type="submit" className="button primary" disabled={busy || ids.length === 0 || !params.typeId}>
          {busy ? "Calcul de l’itinéraire…" : "Calculer l’itinéraire et démarrer"}
        </button>
      </form>
    </section>
  );
}

// Barre de suivi en haut de l'écran pendant la tournée.
export function TourBar({ tour, done, remainingFlyers, nextLabel, onNext, onList }) {
  return (
    <div className="tour-bar" role="status">
      <div className="tour-bar-text">
        <strong>
          Tournée {tour.secteurNom} · {done} / {tour.ids.length}
        </strong>
        <span>
          {done === tour.ids.length ? "Tous les bâtiments sont faits" : `Suivant : ${nextLabel} · ≈ ${fmt(remainingFlyers)} BAL restantes`}
        </span>
      </div>
      <button type="button" className="button primary small" onClick={onNext} disabled={done === tour.ids.length}>
        Suivant
      </button>
      <button type="button" className="button secondary small" onClick={onList}>
        Liste
      </button>
    </div>
  );
}

// Ligne d'un bâtiment de la tournée (liste à l'écran et fiche imprimée).
const accessDetails = (r) => [r?.acces && accesLabel(r.acces), r?.code_entree && `code ${r.code_entree}`].filter(Boolean).join(" · ");

// Liste ordonnée des bâtiments de la tournée.
export function TourListSheet({ tour, records, infoOf, isDone, addressOf, typeName, onFocus, onPrint, onFinish, onClose }) {
  const [confirm, setConfirm] = useState(false);
  const done = tour.ids.filter(isDone).length;
  return (
    <section className="sheet" aria-label="Liste de la tournée">
      <SheetHeader
        title={`Tournée ${tour.secteurNom}`}
        subtitle={`${tour.ids.length} bâtiments · ${km(tour.distance)} à pied · ${typeName} · ${done} faits`}
        onClose={onClose}
      />
      <div className="sheet-body">
        <FlyersPlan plan={tour.plan} />
        <ol className="tour-list">
          {tour.ids.map((id, i) => {
            const r = records.get(id);
            const fait = isDone(id);
            return (
              <li key={id} className={fait ? "done" : ""}>
                <button type="button" onClick={() => onFocus(id)}>
                  <span className="tour-index" aria-hidden="true">
                    {fait ? "✓" : i + 1}
                  </span>
                  <span className="tour-main">
                    <strong>{addressOf(id) ?? "Adresse en cours de recherche…"}</strong>
                    <span>{accessDetails(r) || "Accès non renseigné"}</span>
                  </span>
                  <BalBadge info={infoOf(id)} compact />
                </button>
              </li>
            );
          })}
        </ol>
        <div className="field-inline">
          <button type="button" className="button secondary grow" onClick={onPrint}>
            Imprimer
          </button>
          {confirm ? (
            <button type="button" className="button danger grow" onClick={onFinish}>
              Confirmer la fin
            </button>
          ) : (
            <button type="button" className="button secondary grow" onClick={() => setConfirm(true)}>
              Terminer la tournée
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// Bilan en fin de tournée.
export function TourSummary({ summary, onClose }) {
  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-labelledby="bilan-titre">
        <h2 id="bilan-titre">Tournée terminée</h2>
        <ul className="tour-bilan">
          <li>
            <strong>{summary.done}</strong> / {summary.total} bâtiments faits
          </li>
          <li>
            <strong>≈ {fmt(summary.flyers)}</strong> flyers distribués
          </li>
          {summary.total - summary.done > 0 && (
            <li>
              <strong>{summary.total - summary.done}</strong> bâtiment{summary.total - summary.done > 1 ? "s" : ""} restant
              {summary.total - summary.done > 1 ? "s" : ""} pour une prochaine tournée
            </li>
          )}
        </ul>
        <button type="button" className="button primary" onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  );
}

// Fiche imprimable (n'apparaît qu'à l'impression).
export function PrintTour({ tour, records, infoOf, addressOf, typeName }) {
  const plan = tour.plan;
  return (
    <div className="print-sheet">
      <h1>Tournée {tour.secteurNom}</h1>
      <p>
        {new Date(tour.createdAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} ·{" "}
        {typeName} · {tour.ids.length} bâtiments · {km(tour.distance)} à pied · prévoir ≈ {fmt(plan.total)} flyers (registre{" "}
        {fmt(plan.registre.bal)}, saisie {fmt(plan.saisie.bal)}, estimation ≈ {fmt(plan.estimation.bal)}, marge {fmt(plan.marge)})
      </p>
      <table>
        <thead>
          <tr>
            <th>N°</th>
            <th>Adresse</th>
            <th>Accès</th>
            <th>BAL</th>
            <th>Source</th>
            <th>Fait</th>
          </tr>
        </thead>
        <tbody>
          {tour.ids.map((id, i) => {
            const info = infoOf(id);
            return (
              <tr key={id}>
                <td>{i + 1}</td>
                <td>{addressOf(id) ?? "—"}</td>
                <td>{accessDetails(records.get(id))}</td>
                <td>{info.value == null ? "?" : `${info.source === "estimation" ? "≈ " : ""}${info.value}`}</td>
                <td>{info.source === "registre" ? "Registre" : info.source === "saisie" ? "Saisie" : info.source === "estimation" ? "Estimation" : "—"}</td>
                <td className="check-box" />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
