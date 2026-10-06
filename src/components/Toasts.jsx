// Notifications en bas de l'écran, au-dessus de la barre d'outils.
export default function Toasts({ toasts, onDismiss }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span>{t.text}</span>
          {t.action && (
            <button
              onClick={() => {
                onDismiss(t.id);
                t.action.run();
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
