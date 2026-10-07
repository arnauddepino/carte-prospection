import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, useMapEvents } from "react-leaflet";

import { supabase } from "./supabaseClient";
import { fetchPassages, useProspections } from "./hooks/useProspections";
import { useProspectTypes } from "./hooks/useProspectTypes";
import { useStoredState } from "./hooks/useStoredState";
import { useNow } from "./hooks/useNow";
import { useToasts } from "./hooks/useToasts";
import { useLocate } from "./hooks/useLocate";
import { loadStreets, useSecteurs } from "./hooks/useSecteurs";
import { useSectorDraft } from "./hooks/useSectorDraft";
import { useBalData } from "./hooks/useBalData";
import { balInfo, flyersPlan } from "./lib/bal";
import { planTour, tourCandidates } from "./lib/tournee";
import { reverseAddress } from "./lib/adresse";
import {
  assignBuildings,
  nextSectorColor,
  oppositeCote,
  otherSide,
  sectorPoints,
  sectorStats,
  sharedStreet,
} from "./lib/secteurs";
import { nearestSegment } from "./lib/streets";
import { downloadText, fichesCsv, passagesCsv } from "./lib/csv";
import { featureId, formToPayload, hasFilters, NO_FILTERS, passagePayload } from "./lib/prospections";

import BuildingsLayer from "./components/BuildingsLayer";
import BottomBar from "./components/BottomBar";
import BuildingSheet from "./components/BuildingSheet";
import Dashboard from "./components/Dashboard";
import ErrorBoundary from "./components/ErrorBoundary";
import IdentitySheet from "./components/IdentitySheet";
import SearchBar from "./components/SearchBar";
import SectorsLayer from "./components/SectorsLayer";
import { DrawBar, LegSheet, SectorEditSheet, SectorsSheet } from "./components/SectorSheets";
import SettingsSheet from "./components/SettingsSheet";
import SyncStatus from "./components/SyncStatus";
import Toasts from "./components/Toasts";
import { PrintTour, TourBar, TourListSheet, TourSetupSheet, TourSummary } from "./components/TourSheets";

const BUILDINGS_URL = `${import.meta.env.BASE_URL}batiments-15e.geojson`;
const NETWORK_HINT = "Vérifiez le réseau et réessayez.";

export default function App() {
  if (!supabase) {
    return (
      <div className="status-banner error">
        Configuration Supabase manquante : renseignez REACT_APP_SUPABASE_URL et
        REACT_APP_SUPABASE_ANON_KEY (voir .env.example).
      </div>
    );
  }
  return <ProspectionMap />;
}

// Fait remonter le bâtiment touché dans la partie visible au-dessus de la fiche.
function revealAboveSheet(map, latlng) {
  if (!map) return;
  const point = map.latLngToContainerPoint(latlng);
  const target = map.getSize().y * 0.25;
  if (point.y > target * 1.6) map.panBy([0, point.y - target]);
}

// Centre approximatif de chaque bâtiment (pour l'export).
function buildingCenters(buildings) {
  const centers = new Map();
  for (const feature of buildings?.features ?? []) {
    let ring = feature.geometry.coordinates;
    while (Array.isArray(ring[0][0])) ring = ring[0];
    const lng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    centers.set(featureId(feature), [lat, lng]);
  }
  return centers;
}

const today = () => new Date().toISOString().slice(0, 10);

const SECTOR_SHEETS = ["sectors", "sector", "leg"];

// Clics sur la carte pendant le dessin d'un secteur.
function MapClicks({ onClick }) {
  useMapEvents({ click: (e) => onClick(e.latlng) });
  return null;
}

function ProspectionMap() {
  const [map, setMap] = useState(null);
  const [buildings, setBuildings] = useState(null);
  const [buildingsError, setBuildingsError] = useState(false);
  const { toasts, show, dismiss } = useToasts();
  const {
    records,
    status,
    offline,
    syncing,
    pending,
    reload,
    flush,
    addPassage,
    undoPassage,
    saveFiche,
    removeFiche,
    deletePassage,
  } = useProspections({
    onFatal: () => show({ kind: "error", text: "Une modification a été refusée par le serveur et annulée." }),
  });
  const { types, create: createType } = useProspectTypes();
  const [mode, setMode] = useStoredState("prospection.mode", "prospect");
  const [storedType, setSelectedType] = useStoredState("prospection.type", null);
  const [storedFilters, setFilters] = useStoredState("prospection.filtres", NO_FILTERS);
  const [auteur, setAuteur] = useStoredState("prospection.auteur", null);
  const [editingAuteur, setEditingAuteur] = useState(false);
  // null | { kind: "building", building } | { kind: "settings" } | { kind: "sectors" }
  // | { kind: "sector", sector } | { kind: "leg", sectorId, i, neighbors, streetName }
  const [sheet, setSheet] = useState(null);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const { secteurs, save: saveSecteur, remove: removeSecteur } = useSecteurs();
  const [sectorsVisible, setSectorsVisible] = useStoredState("prospection.secteurs.visibles", true);
  const [graph, setGraph] = useState(null);
  const draft = useSectorDraft();
  const [searchPoint, setSearchPoint] = useState(null);
  const locate = useLocate(map);
  const typeSelectRef = useRef(null);
  const now = useNow();
  const balData = useBalData();
  const [tour, setTour] = useStoredState("prospection.tournee", null);
  const [tourSummary, setTourSummary] = useState(null);
  const [adresses, setAdresses] = useStoredState("prospection.cache.adresses", {});

  // Un type mémorisé peut avoir été supprimé entre-temps.
  const selectedType = types.some((t) => t.id === storedType) ? storedType : null;
  const filters = useMemo(() => {
    const f = { ...NO_FILTERS, ...storedFilters };
    if (types.length && f.typeId && !types.some((t) => t.id === f.typeId)) f.typeId = null;
    if (f.secteurId && !secteurs.some((s) => s.id === f.secteurId)) f.secteurId = null;
    return f;
  }, [storedFilters, types, secteurs]);

  // ─── Secteurs : rattachement des bâtiments et avancement ───
  const centers = useMemo(() => buildingCenters(buildings), [buildings]);
  const needsStreets = draft.active || secteurs.length > 0;
  useEffect(() => {
    if (needsStreets && !graph) loadStreets().then(setGraph).catch((e) => console.error("Plan des rues :", e));
  }, [needsStreets, graph]);
  const sectorOf = useMemo(() => assignBuildings(secteurs, centers, graph), [secteurs, centers, graph]);
  const stats = useMemo(
    () => new Map(secteurs.map((s) => [s.id, sectorStats(s.id, sectorOf, records, now)])),
    [secteurs, sectorOf, records, now]
  );

  // Prénoms connus, pour le filtre « Dernier passage par ».
  const auteurs = useMemo(() => {
    const names = new Set([...records.values()].map((r) => r.dernier_auteur).filter(Boolean));
    if (auteur) names.add(auteur);
    return [...names].sort((a, b) => a.localeCompare(b, "fr"));
  }, [records, auteur]);

  const loadBuildings = useCallback(async () => {
    setBuildingsError(false);
    try {
      const response = await fetch(BUILDINGS_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setBuildings(await response.json());
    } catch (error) {
      console.error("Chargement bâtiments :", error);
      setBuildingsError(true);
    }
  }, []);

  useEffect(() => {
    loadBuildings();
  }, [loadBuildings]);

  // Échap ferme la fiche ouverte.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setSheet(null);
      setDashboardOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const openBuilding = useCallback(
    (building) => {
      setSheet({ kind: "building", building });
      revealAboveSheet(map, building.latlng);
    },
    [map]
  );

  // Hors ligne, les modifications partent dès le retour du réseau.
  const later = offline ? " (envoi au retour du réseau)" : "";

  const handleTap = useCallback(
    async (building) => {
      // Pendant le dessin ou la gestion des secteurs, les bâtiments ne réagissent pas.
      if (draft.active || SECTOR_SHEETS.includes(sheet?.kind)) return;
      if (mode === "edit") {
        openBuilding(building);
        return;
      }
      if (!selectedType) {
        show({ kind: "info", text: "Choisissez d’abord le type de prospection." });
        const select = typeSelectRef.current;
        try {
          select?.showPicker();
        } catch {
          select?.focus();
        }
        return;
      }

      // Le bâtiment se colore tout de suite ; l'envoi se fait en arrière-plan.
      const handle = addPassage(passagePayload({ id_batiment: building.id, typeId: selectedType, auteur }));
      navigator.vibrate?.(20);
      show({
        kind: "success",
        text: `✓ Prospecté · ${types.find((t) => t.id === selectedType)?.name}`,
        action: {
          label: "Annuler",
          run: () => {
            undoPassage(handle);
            show({ kind: "info", text: "Passage annulé" });
          },
        },
      });
    },
    [draft.active, sheet?.kind, mode, selectedType, auteur, types, addPassage, undoPassage, show, openBuilding]
  );

  const handleSaveFiche = (form) => {
    saveFiche(formToPayload(form));
    show({ kind: "success", text: `✓ Fiche enregistrée${later}` });
  };

  const handleAddPassage = (id_batiment, { date, typeId }) => {
    addPassage(passagePayload({ id_batiment, date, typeId, auteur }));
    show({ kind: "success", text: `✓ Passage ajouté${later}` });
  };

  const handleDeletePassage = async (passage) => {
    const { error } = await deletePassage(passage);
    show(error ? { kind: "error", text: `Suppression impossible sans réseau. ${NETWORK_HINT}` } : { kind: "info", text: "Passage supprimé" });
  };

  const handleDeleteFiche = (id_batiment) => {
    removeFiche(id_batiment);
    show({ kind: "info", text: `Fiche et historique supprimés${later}` });
    setSheet(null);
  };

  const handleCreateType = async (name) => {
    const result = await createType(name);
    show(
      result.error
        ? { kind: "error", text: `Type non créé (existe-t-il déjà ?). ${NETWORK_HINT}` }
        : { kind: "success", text: `✓ Type « ${name} » créé` }
    );
    return result;
  };

  // ─── Secteurs : dessin, enregistrement, côtés de rue ───
  // existing : secteur que l'on complète (sinon nouveau secteur).
  const startDrawing = (existing = null) => {
    setSheet(null);
    draft.start(existing?.couleur ?? nextSectorColor(secteurs), existing?.id ?? null);
    show({ kind: "info", text: "Touchez les carrefours : le trait suit les rues. « Lever le crayon » pour un trait séparé." });
  };

  const handleDrawClick = async (latlng) => {
    const g = graph ?? (await loadStreets().catch(() => null));
    if (!g) {
      show({ kind: "error", text: `Plan des rues indisponible. ${NETWORK_HINT}` });
      return;
    }
    const result = draft.addPoint(g, latlng);
    if (result.error === "far") show({ kind: "info", text: "Touchez plus près d’une rue ou d’un carrefour." });
    if (result.error === "unreachable") show({ kind: "error", text: "Aucun chemin par les rues jusqu’à ce point." });
  };

  const finishDrawing = async () => {
    const nouveaux = draft.troncons(graph);
    const existing = secteurs.find((s) => s.id === draft.sectorId);
    if (existing) {
      const { error } = await saveSecteur({ ...existing, troncons: [...existing.troncons, ...nouveaux] });
      if (error) {
        show({ kind: "error", text: `Tracé non enregistré. ${NETWORK_HINT}` });
        return;
      }
      show({ kind: "success", text: `✓ ${nouveaux.length} tronçon${nouveaux.length > 1 ? "s" : ""} ajouté${nouveaux.length > 1 ? "s" : ""} à « ${existing.nom} »` });
      draft.cancel();
      setSheet({ kind: "sectors" });
      return;
    }
    setSheet({
      kind: "sector",
      sector: { nom: `Secteur ${secteurs.length + 1}`, couleur: draft.couleur, responsable: auteur, troncons: nouveaux },
    });
  };

  const handleSaveSector = async (sector, fields) => {
    const { error } = await saveSecteur({ ...sector, ...fields });
    if (error) {
      show({ kind: "error", text: `Secteur non enregistré. ${NETWORK_HINT}` });
      return;
    }
    show({ kind: "success", text: `✓ Secteur « ${fields.nom} » enregistré` });
    draft.cancel();
    setSheet({ kind: "sectors" });
  };

  const handleDeleteSector = async (sector) => {
    const { error } = await removeSecteur(sector.id);
    if (error) {
      show({ kind: "error", text: `Suppression impossible. ${NETWORK_HINT}` });
      return;
    }
    show({ kind: "info", text: `Secteur « ${sector.nom} » supprimé` });
    setSheet({ kind: "sectors" });
  };

  const zoomToSector = (sector) => {
    const points = sectorPoints(sector);
    if (points.length) map?.fitBounds(points, { paddingTopLeft: [24, 80], paddingBottomRight: [24, map.getSize().y * 0.5] });
  };

  // Ligne d'un secteur touchée : nom de la rue et secteurs qui la partagent.
  const handleLegTap = async (sector, i) => {
    const g = graph ?? (await loadStreets().catch(() => null));
    const troncon = sector.troncons[i];
    const neighbors = [];
    for (const other of secteurs) {
      if (other.id === sector.id) continue;
      other.troncons.forEach((t, i2) => {
        const shared = sharedStreet(troncon, t);
        if (shared) neighbors.push({ sectorId: other.id, i: i2, shared });
      });
    }
    const mid = troncon.coords[Math.floor(troncon.coords.length / 2)];
    setSheet({ kind: "leg", sectorId: sector.id, i, neighbors, streetName: g ? nearestSegment(g, mid)?.name : null });
  };

  const withCote = (sector, i, cote) => ({
    ...sector,
    troncons: sector.troncons.map((t, k) => (k === i ? { ...t, cote } : t)),
  });

  const saveSectors = async (list, success) => {
    const results = await Promise.all(list.map((sec) => saveSecteur(sec)));
    show(
      results.some((r) => r.error)
        ? { kind: "error", text: `Modification impossible. ${NETWORK_HINT}` }
        : { kind: "success", text: success }
    );
  };

  const handleSetCote = (sector, i, cote) =>
    saveSectors([withCote(sector, i, cote)], cote === "deux" ? "✓ Les deux côtés de la rue" : "✓ Un seul côté de la rue");

  // Partager une rue : chaque secteur prend un côté.
  const handleShare = (sector, i, n) => {
    const other = secteurs.find((s) => s.id === n.sectorId);
    const cote = sector.troncons[i].cote === "deux" ? "gauche" : sector.troncons[i].cote;
    saveSectors(
      [withCote(sector, i, cote), withCote(other, n.i, oppositeCote(cote, n.shared))],
      `✓ Rue partagée avec « ${other.nom} »`
    );
  };

  // Intervertir : les deux secteurs échangent les rangées de part et d'autre de la rue.
  const handleSwap = (sector, i, n) => {
    const other = secteurs.find((s) => s.id === n.sectorId);
    saveSectors(
      [withCote(sector, i, otherSide(sector.troncons[i].cote)), withCote(other, n.i, otherSide(other.troncons[n.i].cote))],
      `✓ Côtés intervertis avec « ${other.nom} »`
    );
  };

  const handleDeleteLeg = async (sector, i) => {
    const { error } = await saveSecteur({ ...sector, troncons: sector.troncons.filter((_, k) => k !== i) });
    if (error) {
      show({ kind: "error", text: `Suppression impossible. ${NETWORK_HINT}` });
      return;
    }
    show({ kind: "info", text: "Tronçon supprimé" });
    setSheet({ kind: "sectors" });
  };

  // ─── Boîtes aux lettres (saisie > registre > estimation) et tournée ───
  const infoOf = useCallback((id) => balInfo(id, records.get(id), balData), [records, balData]);

  const tourInfo = useMemo(() => {
    if (!tour) return null;
    const since = new Date(tour.createdAt);
    const isDone = (id) => {
      const r = records.get(id);
      return Boolean(r?.date && new Date(r.date) >= since);
    };
    const remaining = tour.ids.filter((id) => !isDone(id));
    return {
      isDone,
      done: tour.ids.length - remaining.length,
      nextId: remaining[0] ?? null,
      remainingFlyers: remaining.reduce((sum, id) => sum + (infoOf(id).value ?? 0), 0),
      focus: { ids: new Set(tour.ids), nextId: remaining[0] ?? null },
    };
  }, [tour, records, infoOf]);

  // Adresse d'un bâtiment : API Adresse (mise en cache), sinon adresse du registre.
  const addressOf = useCallback(
    (id) => {
      if (adresses[id]) return adresses[id];
      const reg = balData?.registre?.[id]?.[3];
      return reg ? reg.charAt(0).toUpperCase() + reg.slice(1) : null;
    },
    [adresses, balData]
  );

  // Recherche des adresses de la tournée en arrière-plan (4 à la fois).
  useEffect(() => {
    if (!tour || offline) return;
    let cancelled = false;
    const todo = tour.ids.filter((id) => !adresses[id] && centers.has(id));
    (async () => {
      for (let i = 0; i < todo.length && !cancelled; i += 4) {
        const batch = todo.slice(i, i + 4);
        const found = await Promise.all(
          batch.map((id) => reverseAddress({ lat: centers.get(id)[0], lng: centers.get(id)[1] }).catch(() => null))
        );
        if (cancelled) return;
        setAdresses((a) => ({ ...a, ...Object.fromEntries(batch.map((id, k) => [id, found[k]]).filter(([, v]) => v)) }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // Relancé seulement pour une nouvelle tournée ou au retour du réseau.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour?.createdAt, offline, centers]);

  const tourCandidatesFor = useCallback(
    (p) => tourCandidates({ secteurId: p.secteurId, sectorOf, records, now, days: p.days, includeInaccessible: p.includeInaccessible }),
    [sectorOf, records, now]
  );
  const planOf = useCallback((ids) => flyersPlan(ids, infoOf), [infoOf]);

  const myPosition = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve([p.coords.latitude, p.coords.longitude]),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });

  const startTour = async (params, ids) => {
    const g = graph ?? (await loadStreets().catch(() => null));
    if (!g) {
      show({ kind: "error", text: `Plan des rues indisponible. ${NETWORK_HINT}` });
      return;
    }
    const start = params.fromMyPosition ? await myPosition() : null;
    const plan = planTour(g, ids.map((id) => ({ id, center: centers.get(id) })), start);
    setTour({
      ...params,
      secteurNom: secteurs.find((s) => s.id === params.secteurId)?.nom ?? "",
      createdAt: new Date().toISOString(),
      ids: plan.ids,
      distance: plan.distance,
      route: plan.route,
      plan: flyersPlan(plan.ids, infoOf),
    });
    setSelectedType(params.typeId);
    setMode("prospect");
    setSheet(null);
    if (plan.route.length > 1) map?.fitBounds(plan.route, { paddingTopLeft: [24, 140], paddingBottomRight: [24, 170] });
    const kmText = (plan.distance / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
    show({
      kind: "success",
      text: `Tournée prête : ${plan.ids.length} bâtiments, ${kmText} km à pied${
        params.fromMyPosition && !start ? " (position indisponible : meilleur point de départ)" : ""
      }.`,
    });
  };

  const focusBuilding = (id) => {
    setSheet(null);
    const c = centers.get(id);
    if (c) map?.flyTo(c, 19);
  };

  const finishTour = () => {
    const done = tour.ids.filter(tourInfo.isDone);
    setTourSummary({ done: done.length, total: tour.ids.length, flyers: done.reduce((s, id) => s + (infoOf(id).value ?? 0), 0) });
    setTour(null);
    setSheet(null);
  };

  const handleExport = async (what) => {
    if (what === "fiches") {
      downloadText(`prospection-fiches-${today()}.csv`, fichesCsv(records, types, centers, infoOf));
      return;
    }
    const { data, error } = await fetchPassages();
    if (error) show({ kind: "error", text: `Export impossible. ${NETWORK_HINT}` });
    else downloadText(`prospection-historique-${today()}.csv`, passagesCsv(data, types));
  };

  const changeMode = (next) => {
    setMode(next);
    setSheet(null);
  };

  // Panneau d'un tronçon touché.
  const legSector = sheet?.kind === "leg" ? secteurs.find((s) => s.id === sheet.sectorId) : null;

  const ready = buildings && !status.loading && !status.error;
  const selectedId = sheet?.kind === "building" ? sheet.building.id : null;

  return (
    <div className={`app mode-${mode}${sheet ? " has-sheet" : ""}${draft.active ? " is-drawing" : ""}${tour ? " has-tour" : ""}`}>
      <MapContainer
        ref={setMap}
        center={[48.845, 2.29]}
        zoom={17}
        minZoom={13}
        maxZoom={19}
        zoomControl={false}
        preferCanvas
        className="map"
      >
        {/* Zoom 19 : le fond OSM y affiche les numéros de rue. crossOrigin : tuiles
            gardables hors ligne par le service worker. */}
        <TileLayer
          attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>"
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          crossOrigin="anonymous"
        />
        {ready && (
          <BuildingsLayer
            buildings={buildings}
            records={records}
            sectorOf={sectorOf}
            filters={filters}
            focus={tourInfo?.focus}
            now={now}
            selectedId={selectedId}
            onTap={handleTap}
            onEdit={openBuilding}
          />
        )}
        {/* Pendant une tournée, l'itinéraire passe devant : lignes de secteur masquées. */}
        {((sectorsVisible && !tour) || draft.active || SECTOR_SHEETS.includes(sheet?.kind)) && (
          <SectorsLayer
            secteurs={secteurs}
            interactive={SECTOR_SHEETS.includes(sheet?.kind)}
            onLegTap={handleLegTap}
            draft={draft.view(graph)}
          />
        )}
        {draft.active && <MapClicks onClick={handleDrawClick} />}
        {tour?.route?.length > 1 && (
          <Polyline
            positions={tour.route}
            interactive={false}
            pathOptions={{ color: "#111111", weight: 3, opacity: 0.55, dashArray: "1 8", lineCap: "round" }}
          />
        )}
        {searchPoint && (
          <CircleMarker
            center={searchPoint}
            radius={9}
            pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#111111", fillOpacity: 1 }}
            interactive={false}
          />
        )}
      </MapContainer>

      <SearchBar
        map={map}
        onSelect={(r) => {
          setSearchPoint([r.lat, r.lng]);
          map?.flyTo([r.lat, r.lng], 19);
        }}
        onClear={() => setSearchPoint(null)}
      />

      {(buildingsError || status.error) && (
        <div className="status-banner error">
          Impossible de charger les données. {NETWORK_HINT}
          <button
            className="button secondary"
            onClick={() => {
              if (buildingsError) loadBuildings();
              if (status.error) reload();
            }}
          >
            Réessayer
          </button>
        </div>
      )}
      {!ready && !buildingsError && !status.error && <div className="status-banner">Chargement des données…</div>}

      <SyncStatus offline={offline} syncing={syncing} pending={pending.length} onRetry={flush} />
      <Toasts toasts={toasts} onDismiss={dismiss} />

      {sheet?.kind === "building" && (
        <BuildingSheet
          key={sheet.building.id}
          building={sheet.building}
          record={records.get(sheet.building.id)}
          types={types}
          selectedType={selectedType}
          sectorName={secteurs.find((s) => s.id === sectorOf.get(sheet.building.id))?.nom}
          balData={balData}
          pendingPassages={pending
            .filter((op) => op.type === "passage" && op.payload.id_batiment === sheet.building.id)
            .map((op) => op.payload)}
          onSaveFiche={handleSaveFiche}
          onAddPassage={(p) => handleAddPassage(sheet.building.id, p)}
          onDeletePassage={handleDeletePassage}
          onDeleteFiche={() => handleDeleteFiche(sheet.building.id)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "settings" && (
        <SettingsSheet
          types={types}
          secteurs={secteurs}
          auteurs={auteurs}
          filters={filters}
          onFilters={setFilters}
          onCreateType={handleCreateType}
          onExport={handleExport}
          auteur={auteur}
          onChangeAuteur={() => setEditingAuteur(true)}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === "sectors" && (
        <SectorsSheet
          secteurs={secteurs}
          stats={stats}
          visible={sectorsVisible}
          onToggleVisible={setSectorsVisible}
          onDraw={() => startDrawing()}
          onTour={() => setSheet({ kind: "tour-setup" })}
          onEdit={(sector) => setSheet({ kind: "sector", sector })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "sector" && (
        <SectorEditSheet
          key={sheet.sector.id ?? "nouveau"}
          sector={sheet.sector}
          auteurs={auteurs}
          onSave={(fields) => handleSaveSector(sheet.sector, fields)}
          onDelete={handleDeleteSector}
          onZoom={zoomToSector}
          onExtend={startDrawing}
          onClose={() => {
            if (!sheet.sector.id) draft.cancel();
            setSheet({ kind: "sectors" });
          }}
        />
      )}
      {legSector && legSector.troncons[sheet.i] && (
        <LegSheet
          key={`${legSector.id}-${sheet.i}`}
          sector={legSector}
          troncon={legSector.troncons[sheet.i]}
          streetName={sheet.streetName}
          neighbors={sheet.neighbors
            .map((n) => {
              const other = secteurs.find((s) => s.id === n.sectorId);
              const mine = legSector.troncons[sheet.i];
              const theirs = other?.troncons[n.i];
              const opposite =
                mine.cote !== "deux" && theirs && theirs.cote === oppositeCote(mine.cote, n.shared);
              return { ...n, sector: other, opposite };
            })
            .filter((n) => n.sector?.troncons[n.i])}
          onSetCote={(cote) => handleSetCote(legSector, sheet.i, cote)}
          onShare={(n) => handleShare(legSector, sheet.i, n)}
          onSwap={(n) => handleSwap(legSector, sheet.i, n)}
          onDelete={() => handleDeleteLeg(legSector, sheet.i)}
          onClose={() => setSheet({ kind: "sectors" })}
        />
      )}

      {draft.active && !sheet ? (
        <DrawBar
          color={draft.couleur}
          legs={draft.legs}
          penDown={draft.penDown}
          onUndo={draft.undo}
          onLiftPen={draft.liftPen}
          onFinish={finishDrawing}
          onCancel={() => {
            draft.cancel();
            setSheet({ kind: "sectors" });
          }}
        />
      ) : (
        <BottomBar
        mode={mode}
        onMode={changeMode}
        types={types}
        selectedType={selectedType}
        onSelectType={setSelectedType}
        typeSelectRef={typeSelectRef}
        locating={locate.active}
        onLocate={locate.toggle}
        filterActive={hasFilters(filters)}
        onOpenSettings={() => setSheet({ kind: "settings" })}
        onOpenSectors={() => setSheet({ kind: "sectors" })}
        onOpenDashboard={() => {
          setSheet(null);
          setDashboardOpen(true);
        }}
      />
      )}

      {tour && tourInfo && !draft.active && (
        <TourBar
          tour={tour}
          done={tourInfo.done}
          remainingFlyers={tourInfo.remainingFlyers}
          nextLabel={tourInfo.nextId ? addressOf(tourInfo.nextId) ?? `n° ${tour.ids.indexOf(tourInfo.nextId) + 1}` : ""}
          onNext={() => tourInfo.nextId && focusBuilding(tourInfo.nextId)}
          onList={() => setSheet({ kind: "tour-list" })}
        />
      )}
      {sheet?.kind === "tour-setup" && (
        <TourSetupSheet
          secteurs={secteurs}
          defaultSecteurId={(secteurs.find((s) => s.responsable && s.responsable === auteur) ?? secteurs[0])?.id ?? null}
          types={types}
          defaultTypeId={selectedType}
          candidates={tourCandidatesFor}
          planOf={planOf}
          onStart={startTour}
          onClose={() => setSheet({ kind: "sectors" })}
        />
      )}
      {sheet?.kind === "tour-list" && tour && (
        <TourListSheet
          tour={tour}
          records={records}
          infoOf={infoOf}
          isDone={tourInfo.isDone}
          addressOf={addressOf}
          typeName={types.find((t) => t.id === tour.typeId)?.name ?? ""}
          onFocus={focusBuilding}
          onPrint={() => window.print()}
          onFinish={finishTour}
          onClose={() => setSheet(null)}
        />
      )}
      {tourSummary && <TourSummary summary={tourSummary} onClose={() => setTourSummary(null)} />}
      {tour && (
        <PrintTour
          tour={tour}
          records={records}
          infoOf={infoOf}
          addressOf={addressOf}
          typeName={types.find((t) => t.id === tour.typeId)?.name ?? ""}
        />
      )}

      {dashboardOpen && (
        <ErrorBoundary onClose={() => setDashboardOpen(false)}>
          <Dashboard
            records={records}
            types={types}
            secteurs={secteurs}
            sectorOf={sectorOf}
            balData={balData}
            now={now}
            onClose={() => setDashboardOpen(false)}
          />
        </ErrorBoundary>
      )}

      {(!auteur || editingAuteur) && (
        <IdentitySheet
          current={auteur}
          onSave={(name) => {
            setAuteur(name);
            setEditingAuteur(false);
          }}
          onCancel={auteur ? () => setEditingAuteur(false) : null}
        />
      )}
    </div>
  );
}
