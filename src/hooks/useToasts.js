import { useCallback, useRef, useState } from "react";

const DURATION = 5000;

// Notifications discrètes en bas de l'écran (remplacent les alert()).
// show({ kind: "success" | "error" | "info", text, action?: { label, run } })
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (toast) => {
      const id = nextId.current++;
      // Une seule notification à la fois : la nouvelle remplace l'ancienne.
      setToasts([{ ...toast, id }]);
      setTimeout(() => dismiss(id), toast.duration ?? DURATION);
      return id;
    },
    [dismiss]
  );

  return { toasts, show, dismiss };
}
