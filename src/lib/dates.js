const pad = (n) => String(n).padStart(2, "0");

// <input type="date"> attend « AAAA-MM-JJ » en heure locale (et non en UTC,
// sinon un passage fait après minuit s'affiche à la veille).
export function toDateInputValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// « AAAA-MM-JJ » → ISO, à midi heure locale pour rester sur le bon jour
// quel que soit le fuseau.
export function fromDateInputValue(value) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toISOString();
}

// « aujourd'hui », « hier », « il y a 12 jours » (en jours calendaires).
export function relativeDay(iso, now = new Date()) {
  const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((start(now) - start(new Date(iso))) / 86400000);
  if (days <= 0) return "aujourd’hui";
  if (days === 1) return "hier";
  return `il y a ${days} jours`;
}
