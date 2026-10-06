// Pastille d'état de la connexion et de la file d'envoi (en haut à gauche).
export default function SyncStatus({ offline, syncing, pending, onRetry }) {
  if (!offline && pending === 0) return null;
  const waiting = `${pending} modification${pending > 1 ? "s" : ""} en attente`;

  let text;
  if (syncing && pending > 0) text = `Envoi de ${waiting.replace(" en attente", "")}…`;
  else if (offline && pending > 0) text = `Hors ligne · ${waiting}`;
  else if (offline) text = "Hors ligne";
  else text = waiting;

  return (
    <div className={`sync-pill${offline ? " is-offline" : ""}`} role="status">
      <span className="sync-dot" aria-hidden="true" />
      <span>{text}</span>
      {pending > 0 && !syncing && (
        <button type="button" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  );
}
