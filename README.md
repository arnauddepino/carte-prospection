# Carte de prospection

Suivi des prospections terrain (dépôt de flyers) bâtiment par bâtiment, sur le 15e arrondissement.
React + Leaflet, données dans Supabase, déployé sur Vercel à chaque push.

## Utilisation

Barre du bas : mode **Prospecter / Éditer**, type de prospection en cours,
localisation, légende et filtres. Recherche d'adresse en haut.

- **Mode Prospecter** : un tap enregistre un passage aujourd'hui avec le type en cours
  (sans toucher aux BAL, code d'entrée et infos). Une notification permet d'**annuler**.
- **Mode Éditer** : un tap ouvre la fiche du bâtiment (adresse, date, type, BAL, code,
  infos, suppression). Le clic droit / appui long ouvre aussi la fiche dans les deux modes.
- **Couleurs** : du bleu le plus foncé (passage de moins de 7 jours) au plus clair
  (plus de 90 jours) ; gris discret = jamais prospecté. Légende dans « Légende et filtres ».

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
  App.jsx                  assemblage : carte, modes, fiches, notifications
  components/              BuildingsLayer, BottomBar, BuildingSheet, SettingsSheet,
                           SearchBar, Toasts, Icon
  hooks/                   useProspections, useProspectTypes, useStoredState, useNow,
                           useToasts, useLocate
  lib/                     logique pure et testée : couleurs, dates, données, adresses
supabase/migrations/       historique des modifications de la base
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
