// Lecture / écriture JSON dans le stockage du navigateur. Le stockage peut être
// indisponible ou plein (navigation privée) : on ignore alors l'erreur, l'appli
// continue de fonctionner sans copie locale.
export function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // stockage indisponible
  }
}
