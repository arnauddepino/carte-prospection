import { useCallback, useEffect, useState } from "react";
import { fetchPassages } from "../hooks/useProspections";
import { reverseAddress } from "../lib/adresse";
import { relativeDay, toDateInputValue } from "../lib/dates";
import { ACCES, recordToForm } from "../lib/prospections";
import { balInfo } from "../lib/bal";
import { datesParAdresse, formatAdresses, titreAdresses } from "../lib/adresses";
import { colorFor } from "../lib/colors";
import { canDeleteFiche, canDeletePassage, canEditFiche } from "../lib/droits";
import Icon from "./Icon";

const osmLabel = (p = {}) =>
  p.name || (p["addr:housenumber"] && p["addr:street"] ? `${p["addr:housenumber"]} ${p["addr:street"]}` : null);

const longDate = (iso) =>
  new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

// Fiche d'un bâtiment, qui monte du bas de l'écran : accès et infos du
// bâtiment, adresses (s'il en a plusieurs), puis historique des passages.
export default function BuildingSheet({
  building,
  record,
  types,
  selectedType,
  sectorName,
  balData,
  adresses = [],
  pendingPassages = [],
  moi = { uid: null, isAdmin: false },
  onSaveFiche,
  onAddPassage,
  onDeletePassage,
  onDeleteFiche,
  onClose,
}) {
  const [form, setForm] = useState(() => recordToForm(building.id, record));
  const [address, setAddress] = useState(() => osmLabel(building.properties) ?? titreAdresses(adresses));
  const [coches, setCoches] = useState(() => new Set(adresses.map((a) => a.id))); // adresses du prochain passage
  const [passages, setPassages] = useState(null); // null = chargement
  const [historyError, setHistoryError] = useState(false);
  const [newPassage, setNewPassage] = useState(() => ({
    date: toDateInputValue(new Date().toISOString()),
    typeId: selectedType,
  }));
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // id du passage ou "fiche" à confirmer

  const typeName = (id) => types.find((t) => t.id === id)?.name;
  const reference = balInfo(building.id, null, balData); // registre ou estimation, hors saisie
  const editable = canEditFiche(record, moi);

  // Sans adresse connue : adresse la plus proche de l'endroit touché.
  useEffect(() => {
    if (address) return;
    let cancelled = false;
    reverseAddress(building.latlng)
      .then((label) => !cancelled && label && setAddress((current) => current ?? label))
      .catch(() => {}); // sans réseau, on garde le titre par défaut
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building]);

  const loadPassages = useCallback(async () => {
    const { data, error } = await fetchPassages(building.id);
    setPassages(data);
    setHistoryError(Boolean(error));
  }, [building.id]);

  // Historique, rechargé quand la fiche change (passage d'un collègue compris).
  useEffect(() => {
    loadPassages();
  }, [loadPassages, record?.date]);

  const run = async (action) => {
    setBusy(true);
    await action();
    setBusy(false);
  };

  // Plusieurs adresses : le passage ajouté couvre celles cochées.
  const multi = adresses.length > 1;
  const dates = datesParAdresse(record, adresses);
  const partiel = multi && coches.size < adresses.length;
  const couvertes = (p) => p.adresses?.length && formatAdresses(adresses.filter((a) => p.adresses.includes(a.id)));
  const toggle = (id) =>
    setCoches((c) => {
      const next = new Set(c);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const field = (name) => ({
    value: form[name],
    onChange: (e) => setForm({ ...form, [name]: e.target.value }),
  });

  return (
    <section className="sheet" aria-label="Fiche du bâtiment">
      <header className="sheet-header">
        <div>
          <h2>{address ?? "Bâtiment"}</h2>
          {sectorName && <p className="sheet-sector">{sectorName}</p>}
          <p className="sheet-subtitle">
            {record?.date
              ? [
                  `Dernier passage ${relativeDay(record.date)}`,
                  typeName(record.prospection_type_id),
                  record.dernier_auteur && `par ${record.dernier_auteur}`,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Jamais prospecté"}
          </p>
        </div>
        <button className="icon-button" aria-label="Fermer la fiche" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>

      <div className="sheet-body">
        {/* ─── Le bâtiment ─── */}
        <form
          className="sheet-section"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => onSaveFiche(form));
          }}
        >
          {!editable && (
            <p className="hint lock-hint">
              Fiche modifiable par {record?.dernier_auteur ?? "l’auteur du dernier passage"} (dernier passage) ou par
              l’administrateur. Prospectez ce bâtiment pour pouvoir la compléter.
            </p>
          )}
          <fieldset className="plain" disabled={!editable}>
          <div className="field">
            <span className="field-label" id="acces-label">Accès</span>
            <div className="chips" role="group" aria-labelledby="acces-label">
              {ACCES.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  className={`chip${a.value === "inaccessible" ? " chip-warning" : ""}`}
                  aria-pressed={form.acces === a.value}
                  onClick={() => setForm({ ...form, acces: form.acces === a.value ? null : a.value })}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field-pair">
            <div className="field">
              <label htmlFor="f-code">Code d’entrée</label>
              <input id="f-code" type="text" autoComplete="off" autoCapitalize="characters" {...field("code_entree")} />
            </div>
            <div className="field">
              <label htmlFor="f-bal">Boîtes aux lettres</label>
              <input
                id="f-bal"
                type="number"
                min="0"
                inputMode="numeric"
                placeholder={reference.value != null ? `${reference.source === "estimation" ? "≈ " : ""}${reference.value}` : ""}
                {...field("bal")}
              />
            </div>
          </div>
          <p className={`bal-source ${form.bal !== "" && form.bal != null ? "saisie" : reference.source ?? "none"}`}>
            {form.bal !== "" && form.bal != null
              ? `Saisie dans l’appli${reference.source ? ` (${reference.source === "registre" ? "registre" : "estimation"} : ${reference.source === "estimation" ? "≈ " : ""}${reference.value})` : ""}.`
              : reference.source === "registre"
                ? `Registre des copropriétés : ${reference.value} logements${reference.nom ? ` (${reference.nom})` : ""}. Saisissez un nombre pour le corriger.`
                : reference.source === "estimation"
                  ? `≈ ${reference.value} estimé d’après la surface et les étages : à vérifier sur place.`
                  : "Nombre inconnu : à compter sur place."}
          </p>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.logement_social}
              onChange={(e) => setForm({ ...form, logement_social: e.target.checked })}
            />
            Logement social
          </label>

          <div className="field">
            <label htmlFor="f-infos">Infos</label>
            <textarea id="f-infos" rows="2" {...field("infos")} />
          </div>

          {editable && (
            <button type="submit" className="button primary" disabled={busy}>
              Enregistrer la fiche
            </button>
          )}
          </fieldset>
        </form>

        {/* ─── Adresses d'un bâtiment dessiné d'un seul bloc ─── */}
        {multi && (
          <section className="sheet-section" aria-labelledby="adresses-title">
            <div className="section-title">
              <h3 id="adresses-title">Adresses ({adresses.length})</h3>
              <button
                type="button"
                className="button text small"
                onClick={() => setCoches(new Set(coches.size === adresses.length ? [] : adresses.map((a) => a.id)))}
              >
                {coches.size === adresses.length ? "Tout décocher" : "Tout cocher"}
              </button>
            </div>
            <p className="hint">Cochez les adresses faites, puis ajoutez le passage ci-dessous.</p>
            <ul className="adresses">
              {adresses.map((a) => {
                const d = dates.get(a.id);
                return (
                  <li key={a.id}>
                    <label className="checkbox">
                      <input type="checkbox" checked={coches.has(a.id)} onChange={() => toggle(a.id)} />
                      {a.label}
                    </label>
                    <span className="adresse-date">
                      <span className="dot" style={{ background: colorFor(d) }} aria-hidden="true" />
                      {d ? relativeDay(d) : "jamais"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* ─── Passages ─── */}
        <section className="sheet-section" aria-labelledby="passages-title">
          <h3 id="passages-title">Passages</h3>

          <form
            className="passage-add"
            onSubmit={async (e) => {
              e.preventDefault();
              await run(() => onAddPassage({ ...newPassage, adresses: partiel ? adresses.filter((a) => coches.has(a.id)).map((a) => a.id) : null }));
              loadPassages();
            }}
          >
            <input
              type="date"
              aria-label="Date du passage"
              value={newPassage.date}
              onChange={(e) => setNewPassage({ ...newPassage, date: e.target.value })}
            />
            <select
              aria-label="Type du passage"
              value={newPassage.typeId ?? ""}
              onChange={(e) => setNewPassage({ ...newPassage, typeId: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="" disabled>
                Type…
              </option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="button secondary"
              disabled={busy || !newPassage.date || !newPassage.typeId || (multi && coches.size === 0)}
            >
              {partiel ? `Ajouter (${coches.size}/${adresses.length})` : "Ajouter"}
            </button>
          </form>

          {pendingPassages.length > 0 && (
            <ul className="passages">
              {pendingPassages.map((p) => (
                <li key={p.client_id}>
                  <div>
                    <strong>{longDate(p.date)}</strong>
                    <span>
                      {[typeName(p.prospection_type_id) ?? "Sans type", p.auteur && `par ${p.auteur}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {couvertes(p) && <span>Seulement : {couvertes(p)}</span>}
                  </div>
                  <span className="badge">En attente d’envoi</span>
                </li>
              ))}
            </ul>
          )}

          {passages === null ? (
            <p className="hint">Chargement de l’historique…</p>
          ) : historyError ? (
            <p className="hint">Historique indisponible sans réseau.</p>
          ) : passages.length === 0 && pendingPassages.length === 0 ? (
            <p className="hint">Aucun passage enregistré.</p>
          ) : (
            <ul className="passages">
              {passages
                .filter((p) => !pendingPassages.some((q) => q.client_id === p.client_id))
                .map((p) => (
                <li key={p.id}>
                  <div>
                    <strong>{longDate(p.date)}</strong>
                    <span>
                      {[typeName(p.prospection_type_id) ?? "Sans type", p.auteur && `par ${p.auteur}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {couvertes(p) && <span>Seulement : {couvertes(p)}</span>}
                  </div>
                  {!canDeletePassage(p, moi) ? null : confirm === p.id ? (
                    <button
                      className="button danger small"
                      disabled={busy}
                      onClick={async () => {
                        await run(() => onDeletePassage(p));
                        setConfirm(null);
                        loadPassages();
                      }}
                    >
                      Supprimer
                    </button>
                  ) : (
                    <button
                      className="icon-button small"
                      aria-label={`Supprimer le passage du ${longDate(p.date)}`}
                      onClick={() => setConfirm(p.id)}
                    >
                      <Icon name="close" size={18} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {record &&
          canDeleteFiche(moi) &&
          (confirm === "fiche" ? (
            <button type="button" className="button danger" disabled={busy} onClick={() => run(onDeleteFiche)}>
              Confirmer : supprimer la fiche et tout l’historique
            </button>
          ) : (
            <button type="button" className="button text-danger" onClick={() => setConfirm("fiche")}>
              Supprimer la fiche
            </button>
          ))}
      </div>
    </section>
  );
}
