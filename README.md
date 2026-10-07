# Carte de prospection

Suivi des prospections terrain (dépôt de flyers) bâtiment par bâtiment, sur le 15e arrondissement.
React + Leaflet, données dans Supabase, déployé sur Vercel à chaque push.

## Utilisation

Barre du bas : mode **Prospecter / Éditer**, type de prospection en cours,
localisation, légende et filtres. Recherche d'adresse en haut.

- **Mode Prospecter** : un tap enregistre un passage aujourd'hui avec le type en cours
  (sans toucher aux BAL, code d'entrée et infos). Une notification permet d'**annuler**.
- **Mode Éditer** : un tap ouvre la fiche du bâtiment : accès (libre, code, badge,
  interphone, inaccessible), code d'entrée, BAL, logement social, infos, et l'historique
  des passages (ajout d'un passage daté, suppression). Le clic droit / appui long ouvre
  aussi la fiche dans les deux modes.
- **Prénom** : demandé à la première ouverture et enregistré avec chaque passage
  (ce n'est pas une connexion sécurisée).
- **Légende et filtres** : filtres par type, collègue, ancienneté, code connu,
  inaccessibles, logements sociaux ; export CSV (fiches et historique) pour Excel.
- **Temps réel** : les passages des collègues apparaissent sans recharger la page.
- **Hors ligne** : après une première ouverture avec réseau, la carte s'ouvre sans réseau.
  Taps et fiches sont enregistrés sur le téléphone puis envoyés automatiquement au
  retour du réseau (pastille « Hors ligne · N modifications en attente » en haut à gauche).
  L'historique d'une fiche, la recherche d'adresse et l'export nécessitent le réseau.
- **Secteurs** (bouton du milieu de la barre) : un secteur est une suite de tronçons de rue.
  « Dessiner un secteur », puis toucher les carrefours : le trait suit les rues ; « Lever le
  crayon » commence un trait séparé ; « Terminer » enregistre. Un tronçon couvre les deux
  côtés de la rue (ligne au milieu) ou un seul (ligne décalée vers la rangée concernée).
  Panneau Secteurs ouvert, toucher une ligne permet de choisir les côtés, de partager la rue
  avec un secteur voisin puis d'intervertir, ou de supprimer le tronçon ; « Compléter le
  tracé » ajoute des traits à un secteur. Chaque secteur indique son avancement (bâtiments
  prospectés depuis moins de 30 jours) et ses boîtes aux lettres.

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
                           IdentitySheet, SectorsLayer, SectorSheets, SearchBar,
                           SyncStatus, Toasts, Icon
  hooks/                   useProspections (fiches, temps réel, file d'envoi hors ligne),
                           useProspectTypes, useStoredState, useNow, useToasts, useLocate
  lib/                     logique pure et testée : couleurs, dates, données, filtres,
                           file d'envoi (outbox), plan des rues et itinéraires (streets),
                           secteurs et rattachement des bâtiments, adresses, export CSV
public/sw.js               service worker : appli, bâtiments et tuiles disponibles hors ligne
supabase/migrations/       historique des modifications de la base
public/
  batiments-15e.geojson    bâtiments OSM du 15e (allégé : identifiant, nom, adresse)
  rues-15e.json            plan des rues du 15e (OSM, sans trottoirs ni passages piétons)
                           pour tracer les secteurs en suivant les rues
  zones-jaune.geojson      ancienne zone, non utilisée
```

## Données

- Tables Supabase :
  - `passages` : l'historique, une ligne par passage (date, type, prénom) ;
  - `prospections` : la fiche de chaque bâtiment (BAL, code, accès, logement social,
    infos) et le résumé de son dernier passage, **tenu à jour par la base**
    (déclencheurs de la migration 03) : l'appli n'écrit jamais la date dans cette table ;
  - `prospection_types` : les types de prospection ;
  - `secteurs` : nom, couleur, responsable et tronçons de rue
    (`troncons` : coordonnées + côté couvert : `deux`, `gauche` ou `droite` par rapport
    au sens de tracé).
- Chaque modification de la base est un fichier de `supabase/migrations/`, à exécuter
  dans l'éditeur SQL de Supabase avant de publier le code qui en dépend.
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
