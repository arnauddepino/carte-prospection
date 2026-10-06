import { useState } from "react";

// Prénom de la personne qui utilise ce téléphone, enregistré avec chaque
// passage. Ce n'est pas une connexion sécurisée (prévue plus tard).
export default function IdentitySheet({ current, onSave, onCancel }) {
  const [name, setName] = useState(current ?? "");

  return (
    <div className="overlay">
      <form
        className="dialog"
        aria-labelledby="identity-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(name.trim());
        }}
      >
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
        <button type="submit" className="button primary" disabled={!name.trim()}>
          Valider
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
