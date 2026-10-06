// Service worker : permet d'ouvrir la carte sans réseau.
//   • page d'accueil : réseau d'abord (pour recevoir les mises à jour),
//     copie locale si le réseau ne répond pas dans les 4 s ;
//   • fichiers de l'appli (/assets/, noms uniques) : copie locale d'abord ;
//   • bâtiments et icônes : copie locale, rafraîchie en arrière-plan ;
//   • tuiles OpenStreetMap déjà affichées : copie locale, rafraîchie en
//     arrière-plan (aucun téléchargement en masse, conformément aux règles OSM).
// Les données Supabase ne passent pas par ici : l'appli gère elle-même sa
// copie locale et sa file d'envoi.

const APP_CACHE = "carte-app-v1";
const TILE_CACHE = "carte-tuiles-v1";
const MAX_TILES = 3000; // ~40 Mo

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [APP_CACHE, TILE_CACHE];
      for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.hostname === "tile.openstreetmap.org") {
    event.respondWith(staleWhileRevalidate(TILE_CACHE, request, trimTiles));
  } else if (url.origin !== self.location.origin) {
    return; // Supabase, API Adresse… : réseau direct
  } else if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  } else if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(APP_CACHE, request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("délai dépassé")), 4000)),
    ]);
    if (response.ok) await cache.put("/", response.clone());
    return response;
  } catch {
    return (await cache.match("/")) ?? Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await pruneOldAssets(cache, request.url);
  }
  return response;
}

async function staleWhileRevalidate(cacheName, request, afterPut) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const update = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        await cache.put(request, response.clone());
        if (afterPut) await afterPut(cache);
      }
      return response;
    })
    .catch(() => cached ?? Response.error());
  return cached ?? update;
}

// Après une mise à jour, les anciens fichiers (index-ANCIEN.js) ne servent plus :
// on ne garde que la dernière version de chaque fichier.
async function pruneOldAssets(cache, newUrl) {
  const base = (u) => new URL(u).pathname.replace(/-[\w-]{6,}(\.\w+)$/, "$1");
  for (const req of await cache.keys()) {
    if (req.url !== newUrl && req.url.includes("/assets/") && base(req.url) === base(newUrl)) await cache.delete(req);
  }
}

// Limite le nombre de tuiles gardées (les plus anciennes partent d'abord).
let trimming = false;
async function trimTiles(cache) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
  } finally {
    trimming = false;
  }
}
