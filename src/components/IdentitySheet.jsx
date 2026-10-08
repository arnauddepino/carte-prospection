import { useState } from "react";
import { isAdminName } from "../hooks/useAuth";

// Prénom de la personne qui utilise ce téléphone, enregistré avec chaque
// passage. Pour « Arnaud », choix du rôle : l'accès administrateur demande le
// mot de passe.
export default function IdentitySheet({ current, isAdmin, onSave, onSignInAdmin, onBecomeUser, onCancel }) {
  const [name, setName] = useState(current ?? "");
  const [role, setRole] = useState(isAdmin ? "admin" : "user");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const askRole = isAdminName(name);
  const wantsAdmin = askRole && role === "admin";

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    if (wantsAdmin && !isAdmin) {
      const message = await onSignInAdmin(password);
      if (message) {
        setError(message);
        setBusy(false);
        return;
      }
    } else if (!wantsAdmin && isAdmin) {
      await onBecomeUser();
    }
    setBusy(false);
    onSave(name.trim());
  };

  return (
    <div className="overlay">
      <form className="dialog" aria-labelledby="identity-title" onSubmit={submit}>
        <h2 id="identity-title">Qui prospecte ?</h2>
        <p className="hint">Votre prénom sera associé à chacun de vos passages, pour que l’équipe sache qui est passé où.</p>
        <div className="field">
          <label htmlFor="identity-name">Prénom</label>
          <input
            id="identity-name"
            type="text"
            autoComplete="given-name"
            autoCapitalize="words"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {askRole && (
          <>
            <div className="segmented" role="group" aria-label="Accès">
              <button type="button" aria-pressed={role === "user"} onClick={() => setRole("user")}>
                Utilisateur
              </button>
              <button type="button" aria-pressed={role === "admin"} onClick={() => setRole("admin")}>
                Administrateur
              </button>
            </div>
            {wantsAdmin && !isAdmin && (
              <div className="field">
                <label htmlFor="identity-password">Mot de passe administrateur</label>
                <input
                  id="identity-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
            {wantsAdmin && isAdmin && <p className="hint">Vous êtes connecté en administrateur.</p>}
          </>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button primary" disabled={busy || !name.trim() || (wantsAdmin && !isAdmin && !password)}>
          {busy ? "Connexion…" : "Valider"}
        </button>
        {onCancel && (
          <button type="button" className="button text" onClick={onCancel}>
            Annuler
          </button>
        )}
      </form>
    </div>
  );
}
