import { useEffect, useRef, useState } from "react";

// Petits graphiques du tableau de bord, en SVG/HTML simple :
// colonnes fines à bout arrondi, ligne de 2 px, quadrillage discret, info-bulle
// au survol / toucher, et pour chaque graphique une vue en tableau.

export const ACCENT = "#2a78d6";
const fmt = (n) => Math.round(n).toLocaleString("fr-FR");

// Largeur disponible d'un élément (le SVG est dessiné à la taille réelle).
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// Graduation « ronde » au-dessus du maximum (0, 5, 10, 20, 50, 100…).
function niceMax(max) {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 5, 10].find((m) => m * pow >= max);
  return step * pow;
}

// Carte d'un graphique, avec bascule vers le tableau des valeurs.
export function ChartCard({ title, subtitle, table, children }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <figure className="chart-card">
      <figcaption>
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {table && (
          <button type="button" className="link-button" onClick={() => setAsTable(!asTable)}>
            {asTable ? "Voir le graphique" : "Voir les chiffres"}
          </button>
        )}
      </figcaption>
      {asTable && table ? (
        <table className="chart-table">
          <thead>
            <tr>
              {table.columns.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        children
      )}
    </figure>
  );
}

// Tuile chiffre clé : libellé, valeur, écart par rapport à la période précédente.
export function StatTile({ label, value, delta, deltaLabel, note, hero = false }) {
  return (
    <div className={`stat-tile${hero ? " hero" : ""}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {delta != null && (
        <span className={`stat-delta ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "="} {delta > 0 ? "+" : ""}
          {delta} % {deltaLabel}
        </span>
      )}
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}

const PAD = { top: 18, right: 8, bottom: 24, left: 34 };

// Colonnes (une par semaine). data = [{ label, value, detail }]
export function ColumnChart({ data, height = 170, color = ACCENT, unit = "" }) {
  const [ref, width] = useWidth();
  const [hovered, setActive] = useState(null);
  // Les données peuvent changer (période) : on ignore un repère devenu hors limites.
  const active = hovered !== null && hovered < data.length ? hovered : null;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.min(24, band * 0.6);
  const y = (v) => PAD.top + plotH - (v / max) * plotH;
  const peak = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0);
  const labelEvery = Math.ceil(data.length / 6);

  return (
    <div className="chart" ref={ref} onPointerLeave={() => setActive(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Graphique en colonnes">
          {[0, max / 2, max].map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="grid" />
              <text x={PAD.left - 6} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
                {fmt(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = PAD.left + band * i + (band - barW) / 2;
            const h = Math.max(0, y(0) - y(d.value));
            const r = Math.min(4, h, barW / 2);
            const top = y(d.value);
            return (
              <g key={i}>
                {h > 0 && (
                  <path
                    d={`M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${y(0)} Z`}
                    fill={color}
                    opacity={active === null || active === i ? 1 : 0.55}
                  />
                )}
                {(i === peak || i === data.length - 1) && d.value > 0 && (
                  <text x={x + barW / 2} y={top - 5} className="value" textAnchor="middle">
                    {fmt(d.value)}
                  </text>
                )}
                {i % labelEvery === (data.length - 1) % labelEvery && (
                  <text x={x + barW / 2} y={height - 6} className="tick" textAnchor="middle">
                    {d.label}
                  </text>
                )}
                {/* Zone de survol / toucher : toute la hauteur de la colonne */}
                <rect
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${d.label} : ${fmt(d.value)}${unit}`}
                  onPointerEnter={() => setActive(i)}
                  onPointerDown={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                />
              </g>
            );
          })}
          <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} className="axis" />
        </svg>
      )}
      {active !== null && (
        <div
          className="chart-tooltip"
          style={{ left: Math.min(Math.max(PAD.left + band * (active + 0.5), 70), width - 70), top: 0 }}
        >
          <strong>
            {fmt(data[active].value)}
            {unit}
          </strong>
          <span>{data[active].label}</span>
          {data[active].detail && <span>{data[active].detail}</span>}
        </div>
      )}
    </div>
  );
}

// Ligne (couverture en %). data = [{ label, value, detail }]
export function LineChart({ data, height = 170, color = ACCENT, max = 100, unit = " %" }) {
  const [ref, width] = useWidth();
  const [hovered, setActive] = useState(null);
  // Les données peuvent changer (période) : on ignore un repère devenu hors limites.
  const active = hovered !== null && hovered < data.length ? hovered : null;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const step = data.length > 1 ? plotW / (data.length - 1) : 0;
  const x = (i) => PAD.left + step * i;
  const y = (v) => PAD.top + plotH - (v / max) * plotH;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const last = data.length - 1;
  const labelEvery = Math.ceil(data.length / 6);

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round((e.clientX - rect.left - PAD.left) / (step || 1));
    setActive(Math.max(0, Math.min(last, i)));
  };

  return (
    <div className="chart" ref={ref} onPointerLeave={() => setActive(null)}>
      {width > 0 && data.length > 0 && (
        <svg width={width} height={height} role="img" aria-label="Graphique en ligne" onPointerMove={onMove} onPointerDown={onMove}>
          {[0, max / 2, max].map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="grid" />
              <text x={PAD.left - 6} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
                {fmt(t)}
                {unit.trim() === "%" ? " %" : ""}
              </text>
            </g>
          ))}
          <path d={area} fill={color} opacity={0.1} />
          <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {data.map(
            (d, i) =>
              i % labelEvery === last % labelEvery && (
                <text key={i} x={x(i)} y={height - 6} className="tick" textAnchor="middle">
                  {d.label}
                </text>
              )
          )}
          {active !== null && <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={y(0)} className="crosshair" />}
          {[active ?? last].map((i) => (
            <circle key={i} cx={x(i)} cy={y(data[i].value)} r={4} fill={color} stroke="#ffffff" strokeWidth={2} />
          ))}
          <text x={x(last)} y={y(data[last].value) - 9} className="value" textAnchor="end">
            {fmt(data[last].value)}
            {unit}
          </text>
        </svg>
      )}
      {active !== null && (
        <div className="chart-tooltip" style={{ left: Math.min(Math.max(x(active), 70), width - 70), top: 0 }}>
          <strong>
            {fmt(data[active].value)}
            {unit}
          </strong>
          <span>{data[active].label}</span>
          {data[active].detail && <span>{data[active].detail}</span>}
        </div>
      )}
    </div>
  );
}

// Barres horizontales, valeur au bout. items = [{ label, value, valueLabel, color }]
// track : fond gris jusqu'au maximum (pour des pourcentages, où 100 % a un sens).
export function BarList({ items, max, color = ACCENT, track = false }) {
  const top = max ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className={`bar-list${track ? " with-track" : ""}`}>
      {items.map((item) => (
        <li key={item.label}>
          <span className="bar-label">{item.label}</span>
          <span className="bar-row">
            <span className="bar-track">
              <span
                className="bar-fill"
                style={{ width: `${Math.max(item.value > 0 ? 2 : 0, (100 * item.value) / top)}%`, background: item.color ?? color }}
              />
            </span>
            <span className="bar-value">{item.valueLabel ?? fmt(item.value)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
