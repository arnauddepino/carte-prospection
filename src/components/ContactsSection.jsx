import { useCallback, useEffect, useState } from "react";
import { CATEGORIES, categorieLabel, deleteContact, fetchContacts, saveContact, telHref } from "../lib/contacts";

// Gardien et commerçants d'un bâtiment, dans sa fiche. Les coordonnées ne
// sont visibles et modifiables que par les membres de l'équipe.
export default function ContactsSection({ idBatiment, estMembre, onAccount, onError }) {
  const [contacts, setContacts] = useState(null); // null = chargement
  const [indisponible, setIndisponible] = useState(false);
  const [edition, setEdition] = useState(null); // contact modifié, ou { categorie } pour un nouveau
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await fetchContacts(idBatiment, estMembre);
    setContacts(data ?? []);
    setIndisponible(Boolean(error));
  }, [idBatiment, estMembre]);

  useEffect(() => {
    load();
  }, [load]);

  const enregistrer = async (e) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await saveContact({ ...edition, id_batiment: idBatiment });
    setBusy(false);
    if (error) {
      onError?.(error);
      return;
    }
    setEdition(null);
    load();
  };

  const supprimer = async () => {
    setBusy(true);
    const { error } = await deleteContact(edition.id);
    setBusy(false);
    if (error) {
      onError?.(error);
      return;
    }
    setEdition(null);
    load();
  };

  const champ = (name) => ({
    value: edition?.[name] ?? "",
    onChange: (e) => setEdition({ ...edition, [name]: e.target.value }),
  });

  return (
    <section className="sheet-section" aria-labelledby="contacts-title">
      <h3 id="contacts-title">Gardien et commerçants</h3>

      {contacts === null ? (
        <p className="hint">Chargement…</p>
      ) : indisponible ? (
        <p className="hint">Contacts indisponibles sans réseau.</p>
      ) : contacts.length === 0 && !edition ? (
        <p className="hint">Aucun contact enregistré.</p>
      ) : (
        <ul className="contacts">
          {contacts.map((c) => (
            <li key={c.id}>
              <div>
                <strong>
                  {categorieLabel(c.categorie)}
                  {c.enseigne ? ` · ${c.enseigne}` : ""}
                  {estMembre && c.nom ? ` · ${c.nom}` : ""}
                </strong>
                {estMembre ? (
                  <>
                    {c.telephone && (
                      <a className="contact-tel" href={telHref(c.telephone)}>
                        {c.telephone}
                      </a>
                    )}
                    {c.notes && <span className="contact-notes">{c.notes}</span>}
                  </>
                ) : (
                  <span className="contact-reserve">Nom, téléphone et notes réservés à l’équipe</span>
                )}
              </div>
              {estMembre && (
                <button type="button" className="button text small" onClick={() => setEdition(c)}>
                  Modifier
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {edition ? (
        <form className="contact-form" onSubmit={enregistrer}>
          <p className="field-label">{edition.id ? "Modifier" : "Nouveau"} : {categorieLabel(edition.categorie).toLowerCase()}</p>
          {edition.categorie === "commercant" && (
            <div className="field">
              <label htmlFor="c-enseigne">Commerce (enseigne, activité)</label>
              <input id="c-enseigne" type="text" maxLength={80} {...champ("enseigne")} />
            </div>
          )}
          <div className="field-pair">
            <div className="field">
              <label htmlFor="c-nom">Nom</label>
              <input id="c-nom" type="text" maxLength={80} autoCapitalize="words" {...champ("nom")} />
            </div>
            <div className="field">
              <label htmlFor="c-tel">Téléphone</label>
              <input id="c-tel" type="tel" inputMode="tel" maxLength={30} {...champ("telephone")} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="c-notes">Notes</label>
            <textarea id="c-notes" rows="2" maxLength={2000} {...champ("notes")} />
          </div>
          <div className="field-inline">
            <button type="submit" className="button primary grow" disabled={busy}>
              Enregistrer le contact
            </button>
            <button type="button" className="button secondary" onClick={() => setEdition(null)}>
              Annuler
            </button>
          </div>
          {edition.id && (
            <button type="button" className="button text-danger" disabled={busy} onClick={supprimer}>
              Supprimer ce contact
            </button>
          )}
        </form>
      ) : estMembre ? (
        <div className="field-inline">
          {CATEGORIES.map((c) => (
            <button key={c.value} type="button" className="button secondary grow" onClick={() => setEdition({ categorie: c.value })}>
              {c.ajout}
            </button>
          ))}
        </div>
      ) : (
        <p className="hint">
          Les contacts sont gérés par les membres de l’équipe.{" "}
          <button type="button" className="link-button" onClick={onAccount}>
            Se connecter
          </button>
        </p>
      )}
    </section>
  );
}
