import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, TileLayer, useMapEvents } from "react-leaflet";

import { supabase } from "./supabaseClient";
import { fetchPassages, useProspections } from "./hooks/useProspections";
import { useProspectTypes } from "./hooks/useProspectTypes";
import { useStoredState } from "./hooks/useStoredState";
import { useNow } from "./hooks/useNow";
import { useToasts } from "./hooks/useToasts";
import { useLocate } from "./hooks/useLocate";
import { loadStreets, useSecteurs } from "./hooks/useSecteurs";
import { useSectorDraft } from "./hooks/useSectorDraft";
import { assignBuildings, nextSectorColor, sectorRing, sectorStats } from "./lib/secteurs";
import { nearestSegment, segmentKey } from "./lib/streets";
import { downloadText, fichesCsv, passagesCsv } from "./lib/csv";
import { featureId, formToPayload, hasFilters, NO_FILTERS, passagePayload } from "./lib/prospections";

import BuildingsLayer from "./components/BuildingsLayer";
import BottomBar from "./components/BottomBar";
import BuildingSheet from "./components/BuildingSheet";
import IdentitySheet from "./components/IdentitySheet";
import SearchBar from "./components/SearchBar";
import SectorsLayer from "./components/SectorsLayer";
import { DrawBar, LegSheet, SectorEditSheet, SectorsSheet } from "./components/SectorSheets";
import SettingsSheet from "./components/SettingsSheet";
import SyncStatus from "./components/SyncStatus";
import Toasts from "./components/Toasts";

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

// Clés des tronçons de rue d'une ligne (pour repérer une rue partagée).
const legKeys = (leg) => new Set(leg.slice(1).map((q, i) => segmentKey(leg[i], q)));

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
  // | { kind: "sector", sector } | { kind: "leg", sectorId, k, neighbors, streetName }
  const [sheet, setSheet] = useState(null);
  const { secteurs, save: saveSecteur, remove: removeSecteur } = useSecteurs();
  const [sectorsVisible, setSectorsVisible] = useStoredState("prospection.secteurs.visibles", true);
  const [graph, setGraph] = useState(null);
  const draft = useSectorDraft();
  const [searchPoint, setSearchPoint] = useState(null);
  const locate = useLocate(map);
  const typeSelectRef = useRef(null);
  const now = useNow();

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
  const needsStreets = draft.active || secteurs.some((s) => s.inverses?.length) || sheet?.kind === "leg";
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
    const onKey = (e) => e.key === "Escape" && setSheet(null);
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
  const startDrawing = () => {
    setSheet(null);
    draft.start(nextSectorColor(secteurs));
    show({ kind: "info", text: "Touchez les carrefours dans l’ordre : le trait suit les rues." });
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
    if (result.closed) finishDrawing();
  };

  const finishDrawing = () => {
    const contour = draft.close(graph);
    if (!contour) {
      show({ kind: "error", text: "Impossible de refermer le secteur par les rues." });
      return;
    }
    setSheet({
      kind: "sector",
      sector: {
        nom: `Secteur ${secteurs.length + 1}`,
        couleur: draft.view(graph).couleur,
        responsable: auteur,
        inverses: [],
        ...contour,
      },
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
    map?.fitBounds(sectorRing(sector), { paddingTopLeft: [24, 80], paddingBottomRight: [24, map.getSize().y * 0.5] });
  };

  // Ligne d'un secteur touchée : nom de la rue et secteurs qui la partagent.
  const handleLegTap = async (sector, k) => {
    const g = graph ?? (await loadStreets().catch(() => null));
    const leg = sector.legs[k];
    const keys = legKeys(leg);
    const neighbors = [];
    for (const other of secteurs) {
      if (other.id === sector.id) continue;
      other.legs.forEach((l, k2) => {
        if ([...legKeys(l)].some((key) => keys.has(key))) neighbors.push({ sectorId: other.id, k: k2 });
      });
    }
    const mid = leg[Math.floor(leg.length / 2)];
    const streetName = g ? nearestSegment(g, mid)?.name : null;
    setSheet({ kind: "leg", sectorId: sector.id, k, neighbors, streetName });
  };

  const setInverted = (sector, k, inverted) => {
    const inverses = new Set(sector.inverses ?? []);
    if (inverted) inverses.add(k);
    else inverses.delete(k);
    return saveSecteur({ ...sector, inverses: [...inverses].sort((a, b) => a - b) });
  };

  const handleFlip = async (sector, k) => {
    const { error } = await setInverted(sector, k, !sector.inverses?.includes(k));
    show(error ? { kind: "error", text: `Modification impossible. ${NETWORK_HINT}` } : { kind: "success", text: "✓ Côté de rue modifié" });
  };

  // Intervertir : les deux secteurs échangent les rangées de part et d'autre de la rue.
  const handleSwap = async (sector, k, neighbor) => {
    const other = secteurs.find((s) => s.id === neighbor.sectorId);
    const inverted = !sector.inverses?.includes(k);
    const results = await Promise.all([setInverted(sector, k, inverted), setInverted(other, neighbor.k, inverted)]);
    show(
      results.some((r) => r.error)
        ? { kind: "error", text: `Modification impossible. ${NETWORK_HINT}` }
        : { kind: "success", text: `✓ Côtés intervertis avec « ${other.nom} »` }
    );
  };

  const handleExport = async (what) => {
    if (what === "fiches") {
      downloadText(`prospection-fiches-${today()}.csv`, fichesCsv(records, types, centers));
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
    <div className={`app mode-${mode}${sheet ? " has-sheet" : ""}`}>
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
            now={now}
            selectedId={selectedId}
            onTap={handleTap}
            onEdit={openBuilding}
          />
        )}
        {(sectorsVisible || draft.active || SECTOR_SHEETS.includes(sheet?.kind)) && (
          <SectorsLayer
            secteurs={secteurs}
            interactive={SECTOR_SHEETS.includes(sheet?.kind)}
            onLegTap={handleLegTap}
            draft={draft.view(graph)}
          />
        )}
        {draft.active && <MapClicks onClick={handleDrawClick} />}
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
          onDraw={startDrawing}
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
          onClose={() => {
            if (!sheet.sector.id) draft.cancel();
            setSheet({ kind: "sectors" });
          }}
        />
      )}
      {legSector && (
        <LegSheet
          sector={legSector}
          streetName={sheet.streetName}
          inverted={Boolean(legSector.inverses?.includes(sheet.k))}
          neighbors={sheet.neighbors
            .map((n) => ({ ...n, sector: secteurs.find((s) => s.id === n.sectorId) }))
            .filter((n) => n.sector)}
          onFlip={() => handleFlip(legSector, sheet.k)}
          onSwap={(n) => handleSwap(legSector, sheet.k, n)}
          onClose={() => setSheet({ kind: "sectors" })}
        />
      )}

      {draft.active && !sheet ? (
        <DrawBar
          color={draft.view(graph)?.couleur}
          points={draft.count}
          onUndo={draft.undo}
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
      />
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
