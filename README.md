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
- **Prénom et connexion** : seul le prénom est demandé ; chaque téléphone reçoit en arrière-plan
  une identité anonyme sécurisée (Supabase). Avec le prénom « Arnaud », l'appli propose
  « Utilisateur » ou « Administrateur » (mot de passe).
- **Droits** (appliqués par la base) : chacun prospecte et annule ses propres passages ; la fiche
  d'un bâtiment est modifiable par l'auteur du dernier passage ou l'administrateur ; secteurs et
  suppression de fiche réservés à l'administrateur ; tout le monde peut créer un type.
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
- **Tableau de bord** (bouton de la barre du bas) : couverture actuelle, passages et flyers
  estimés (d'après les boîtes aux lettres renseignées) avec l'écart par rapport à la
  période précédente, collègues actifs, passages par semaine, couverture dans le temps,
  répartition par collègue, par type et par secteur. Filtres : période et secteur.
  Chaque graphique a une vue « Voir les chiffres ». Nécessite le réseau.
- **Boîtes aux lettres (BAL)** : saisie dans la fiche (prioritaire), sinon nombre de lots
  d'habitation du **registre des copropriétés**, sinon **estimation** (surface au sol × étages,
  à vérifier). La provenance est toujours affichée : « Saisie », « Registre », « ≈ Estimation ».
- **Tournée** (panneau Secteurs → « Préparer une tournée ») : bâtiments du secteur sans passage
  depuis N jours, flyers à prévoir par provenance, **ordre de passage le plus court à pied**,
  itinéraire sur la carte, barre de suivi avec « Suivant », liste (adresses, codes, BAL),
  fiche imprimable et bilan. La tournée est gardée sur le téléphone et fonctionne hors ligne.

## Développement

```bash
cp .env.example .env.local   # puis renseigner l'URL, la clé anon Supabase et l'e-mail admin
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
                           SyncStatus, Toasts, Icon, Dashboard, Charts, ErrorBoundary
  hooks/                   useProspections (fiches, temps réel, file d'envoi hors ligne),
                           useProspectTypes, useStoredState, useNow, useToasts, useLocate
  lib/                     logique pure et testée : couleurs, dates, données, filtres,
                           file d'envoi (outbox), plan des rues et itinéraires (streets),
                           secteurs et rattachement des bâtiments, statistiques du
                           tableau de bord (stats), adresses, export CSV
scripts/donnees-bal.py     met à jour public/bal-15e.json depuis le registre (data.gouv.fr)
scripts/donnees-adresses.py met à jour public/adresses-15e.json (Base Adresse Nationale + cadastre)
scripts/donnees-social.py  met à jour public/social-15e.json (répertoire RPLS + Ville de Paris)
public/sw.js               service worker : appli, bâtiments et tuiles disponibles hors ligne
supabase/migrations/       historique des modifications de la base
public/
  batiments-15e.geojson    bâtiments OSM du 15e (allégé : identifiant, nom, adresse, type, étages)
  bal-15e.json             boîtes aux lettres : registre des copropriétés + estimations
                           (généré par scripts/donnees-bal.py)
  adresses-15e.json        adresses de chaque bâtiment, suivies une à une quand
                           un bâtiment en a plusieurs (scripts/donnees-adresses.py)
  social-15e.json          logements sociaux par bâtiment : immeubles sociaux (hors
                           cible) et copropriétés mixtes (scripts/donnees-social.py)
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
