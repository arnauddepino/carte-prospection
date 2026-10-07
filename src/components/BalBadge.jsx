import { BAL_SOURCES } from "../lib/bal";

// Nombre de boîtes aux lettres avec sa provenance, lisible sans la couleur :
// « 21 · Registre », « ≈ 14 · Estimation », « 18 · Saisie ».
export default function BalBadge({ info, compact = false }) {
  if (!info?.source) return <span className="bal-badge none">BAL inconnues</span>;
  const estimated = info.source === "estimation";
  return (
    <span className={`bal-badge ${info.source}`} title={BAL_SOURCES[info.source].long}>
      <strong>
        {estimated ? "≈ " : ""}
        {info.value}
      </strong>
      {compact ? "" : " BAL"} · {BAL_SOURCES[info.source].label}
    </span>
  );
}
