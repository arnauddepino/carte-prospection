# Carte de prospection

Suivi des prospections terrain (dépôt de flyers) bâtiment par bâtiment, sur le 15e arrondissement.
React + Leaflet, données dans Supabase, déployé sur Vercel à chaque push.

## Utilisation

- **Tap sur un bâtiment** : enregistre un passage aujourd'hui avec le type sélectionné
  (ne modifie pas les BAL, code d'entrée et infos déjà saisis).
- **Clic droit / appui long** : ouvre la fiche du bâtiment (date, BAL, code, infos, suppression).
- **Couleurs** : gris = jamais prospecté · vert < 7 j · jaune < 14 j · orange < 30 j · rouge < 90 j · noir ≥ 90 j.

## Développement

```bash
cp .env.example .env.local   # puis renseigner l'URL et la clé anon Supabase
npm install
npm run dev                  # http://localhost:3000
npm test                     # tests unitaires (src/lib)
npm run build                # build de production dans build/
```

## Organisation du code

```
src/
  App.jsx                  assemblage : carte, panneau, fiche, gestion des erreurs
  components/              BuildingsLayer, ControlPanel, EditPopup, MapControls
  hooks/                   useProspections, useProspectTypes, useStoredState, useNow
  lib/                     logique pure et testée : couleurs, dates, préparation des données
public/
  batiments-15e.geojson    bâtiments OSM du 15e (allégé : identifiant, nom, adresse)
  zones-jaune.geojson      zone non utilisée pour l'instant (future notion de secteur)
```

## Données

- Tables Supabase : `prospections` (une ligne par bâtiment) et `prospection_types`.
- Les bâtiments proviennent d'OpenStreetMap via https://overpass-turbo.eu/.
  Les prospections sont rattachées à l'identifiant OSM (`way/…`, `relation/…`) :
  en cas de régénération du fichier, conserver ces identifiants.
- `_archive/` (local, non publié) contient l'ancienne version Create React App et les données d'origine.

## Idées d'amélioration (liste d'origine)

- Un fond de carte avec tous les numéros de rue
- Se localiser en direct
- Sélectionner un type de prospection pour savoir quel flyer a été mis à quel endroit, et filtrer par type
- Un mode prospection et un mode édition
- Choisir un secteur et limiter les clics à ce secteur
- Indiquer clairement les bâtiments sociaux
- Afficher les bâtiments inaccessibles (code uniquement, badge, pas accessible)
- Filtres par ancienneté de prospection, nombre de boîtes aux lettres
- Afficher les codes d'accès sur la carte (option en mode prospection)
- Authentification pour sécuriser l'accès et historique des actions de chacun
- Mode édition de géométrie pour redécouper certains bâtiments
