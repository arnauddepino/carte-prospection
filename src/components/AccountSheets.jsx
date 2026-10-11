import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Icon from "./Icon";

// Connexion ou création d'un compte de l'équipe (e-mail + mot de passe).
// Un nouveau compte attend la validation de l'administrateur.
export function AccountDialog({ prenom: prenomActuel, onSignIn, onSignUp, onDone, onCancel }) {
  const [tab, setTab] = useState("connexion");
  const [prenom, setPrenom] = useState(prenomActuel ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const creation = tab === "creation";

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (creation) {
      const message = await onSignUp({ prenom: prenom.trim(), email: email.trim(), password });
      setBusy(false);
      if (message) setError(message);
      else setEnvoye(true);
      return;
    }
    const { error: message, membre } = await onSignIn({ email: email.trim(), password });
    setBusy(false);
    if (message) setError(message);
    else onDone(membre);
  };

  if (envoye) {
    return (
      <div className="overlay">
        <div className="dialog" role="dialog" aria-labelledby="account-title">
          <h2 id="account-title">Demande envoyée</h2>
          <p>
            Votre compte est créé. L’administrateur doit maintenant le valider : vous verrez alors les coordonnées des
            gardiens et commerçants. En attendant, l’appli fonctionne comme avant.
          </p>
          <button type="button" className="button primary" onClick={() => onDone({ prenom: prenom.trim(), statut: "en_attente" })}>
            Compris
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay">
      <form className="dialog" aria-labelledby="account-title" onSubmit={submit}>
        <h2 id="account-title">Compte de l’équipe</h2>
        <div className="segmented" role="group" aria-label="Compte">
          <button type="button" aria-pressed={!creation} onClick={() => setTab("connexion")}>
            Se connecter
          </button>
          <button type="button" aria-pressed={creation} onClick={() => setTab("creation")}>
            Créer un compte
          </button>
        </div>
        {creation && (
          <>
            <p className="hint">L’administrateur validera votre compte. Vos passages déjà faits sur ce téléphone resteront à votre nom.</p>
            <div className="field">
              <label htmlFor="account-prenom">Prénom</label>
              <input id="account-prenom" type="text" autoComplete="given-name" autoCapitalize="words" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
            </div>
          </>
        )}
        <div className="field">
          <label htmlFor="account-email">E-mail</label>
          <input id="account-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="account-password">Mot de passe{creation ? " (6 caractères au moins)" : ""}</label>
          <input
            id="account-password"
            type="password"
            autoComplete={creation ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {!creation && <p className="hint">Mot de passe oublié : demandez à l’administrateur.</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="button primary"
          disabled={busy || !email.trim() || !password || (creation && (!prenom.trim() || password.length < 6))}
        >
          {busy ? "Un instant…" : creation ? "Créer mon compte" : "Se connecter"}
        </button>
        <button type="button" className="button text" onClick={onCancel}>
          Annuler
        </button>
      </form>
    </div>
  );
}

const STATUTS = { en_attente: "En attente", actif: "Membre", refuse: "Sans accès" };

// Équipe (administrateur) : valider, refuser ou retirer les comptes.
export function TeamSheet({ onChanged, onClose }) {
  const [membres, setMembres] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from("membres").select("*").order("demande_le", { ascending: false });
    setError(e ? "Liste indisponible sans réseau." : null);
    setMembres(data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (m, statut) => {
    setBusy(m.user_id);
    const { error: e } = await supabase.rpc("valider_membre", { p_user: m.user_id, p_statut: statut });
    setBusy(null);
    if (e) setError(`Action impossible : ${e.message}`);
    await load();
    onChanged?.();
  };

  const attente = (membres ?? []).filter((m) => m.statut === "en_attente");
  const autres = (membres ?? []).filter((m) => m.statut !== "en_attente");
  const ligne = (m) => (
    <li key={m.user_id}>
      <div>
        <strong>{m.prenom}</strong>
        <span>
          {m.email} · {STATUTS[m.statut]}
        </span>
      </div>
      <div className="team-actions">
        {m.statut !== "actif" && (
          <button type="button" className="button primary small" disabled={busy === m.user_id} onClick={() => decide(m, "actif")}>
            Valider
          </button>
        )}
        {m.statut !== "refuse" && (
          <button type="button" className="button secondary small" disabled={busy === m.user_id} onClick={() => decide(m, "refuse")}>
            {m.statut === "actif" ? "Retirer" : "Refuser"}
          </button>
        )}
      </div>
    </li>
  );

  return (
    <section className="sheet" aria-label="Équipe">
      <header className="sheet-header">
        <div>
          <h2>Équipe</h2>
          <p className="sheet-subtitle">Comptes avec accès aux coordonnées des gardiens et commerçants</p>
        </div>
        <button className="icon-button" aria-label="Fermer" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <div className="sheet-body">
        {error && <p className="form-error">{error}</p>}
        {membres === null ? (
          <p className="hint">Chargement…</p>
        ) : membres.length === 0 ? (
          <p className="hint">Aucun compte pour l’instant. Chaque collègue crée le sien depuis « Légende et filtres » → « Vous ».</p>
        ) : (
          <>
            {attente.length > 0 && (
              <>
                <h3>À valider</h3>
                <ul className="passages team">{attente.map(ligne)}</ul>
              </>
            )}
            {autres.length > 0 && (
              <>
                <h3>Comptes</h3>
                <ul className="passages team">{autres.map(ligne)}</ul>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
