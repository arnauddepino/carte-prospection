// API Adresse de l'IGN (Base Adresse Nationale) : gratuite, sans clé,
// précise au numéro près pour la France.
const API = "https://data.geopf.fr/geocodage";

// Recherche d'adresses, en favorisant les résultats proches du point donné.
export async function searchAddress(query, near) {
  const params = new URLSearchParams({ q: query, limit: "5", autocomplete: "1" });
  if (near) {
    params.set("lat", near.lat.toFixed(5));
    params.set("lon", near.lng.toFixed(5));
  }
  const response = await fetch(`${API}/search?${params}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const { features } = await response.json();
  return features.map((f) => ({
    label: f.properties.label,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
  }));
}

// Adresse la plus proche d'un point (« 69 Rue des Entrepreneurs »), ou null.
export async function reverseAddress({ lat, lng }) {
  const params = new URLSearchParams({ lat: lat.toFixed(6), lon: lng.toFixed(6), limit: "1" });
  const response = await fetch(`${API}/reverse?${params}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const { features } = await response.json();
  return features[0]?.properties.name ?? null;
}
