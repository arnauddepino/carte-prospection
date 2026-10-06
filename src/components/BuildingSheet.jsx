import { useCallback, useEffect, useState } from "react";
import { fetchPassages } from "../hooks/useProspections";
import { reverseAddress } from "../lib/adresse";
import { relativeDay, toDateInputValue } from "../lib/dates";
import { ACCES, recordToForm } from "../lib/prospections";
import Icon from "./Icon";

const osmLabel = (p = {}) =>
  p.name || (p["addr:housenumber"] && p["addr:street"] ? `${p["addr:housenumber"]} ${p["addr:street"]}` : null);

const longDate = (iso) =>
  new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

// Fiche d'un bâtiment, qui monte du bas de l'écran : accès et infos du
// bâtiment, puis historique des passages.
export default function BuildingSheet({
  building,
  record,
  types,
  selectedType,
  sectorName,
  pendingPassages = [],
  onSaveFiche,
  onAddPassage,
  onDeletePassage,
  onDeleteFiche,
  onClose,
}) {
  const [form, setForm] = useState(() => recordToForm(building.id, record));
  const [address, setAddress] = useState(osmLabel(building.properties));
  const [passages, setPassages] = useState(null); // null = chargement
  const [historyError, setHistoryError] = useState(false);
  const [newPassage, setNewPassage] = useState(() => ({
    date: toDateInputValue(new Date().toISOString()),
    typeId: selectedType,
  }));
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // id du passage ou "fiche" à confirmer

  const typeName = (id) => types.find((t) => t.id === id)?.name;

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
              <input id="f-bal" type="number" min="0" inputMode="numeric" {...field("bal")} />
            </div>
          </div>

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

          <button type="submit" className="button primary" disabled={busy}>
            Enregistrer la fiche
          </button>
        </form>

        {/* ─── Passages ─── */}
        <section className="sheet-section" aria-labelledby="passages-title">
          <h3 id="passages-title">Passages</h3>

          <form
            className="passage-add"
            onSubmit={async (e) => {
              e.preventDefault();
              await run(() => onAddPassage(newPassage));
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
            <button type="submit" className="button secondary" disabled={busy || !newPassage.date || !newPassage.typeId}>
              Ajouter
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
                  </div>
                  {confirm === p.id ? (
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
