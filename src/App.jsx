import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, TileLayer } from "react-leaflet";

import { supabase } from "./supabaseClient";
import { fetchPassages, useProspections } from "./hooks/useProspections";
import { useProspectTypes } from "./hooks/useProspectTypes";
import { useStoredState } from "./hooks/useStoredState";
import { useNow } from "./hooks/useNow";
import { useToasts } from "./hooks/useToasts";
import { useLocate } from "./hooks/useLocate";
import { downloadText, fichesCsv, passagesCsv } from "./lib/csv";
import { featureId, formToPayload, hasFilters, NO_FILTERS, passagePayload } from "./lib/prospections";

import BuildingsLayer from "./components/BuildingsLayer";
import BottomBar from "./components/BottomBar";
import BuildingSheet from "./components/BuildingSheet";
import IdentitySheet from "./components/IdentitySheet";
import SearchBar from "./components/SearchBar";
import SettingsSheet from "./components/SettingsSheet";
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

function ProspectionMap() {
  const [map, setMap] = useState(null);
  const [buildings, setBuildings] = useState(null);
  const [buildingsError, setBuildingsError] = useState(false);
  const { records, status, reload, addPassage, deletePassage, saveFiche, removeFiche } = useProspections();
  const { types, create: createType } = useProspectTypes();
  const [mode, setMode] = useStoredState("prospection.mode", "prospect");
  const [storedType, setSelectedType] = useStoredState("prospection.type", null);
  const [storedFilters, setFilters] = useStoredState("prospection.filtres", NO_FILTERS);
  const [auteur, setAuteur] = useStoredState("prospection.auteur", null);
  const [editingAuteur, setEditingAuteur] = useState(false);
  const [sheet, setSheet] = useState(null); // null | { kind: "building", building } | { kind: "settings" }
  const [searchPoint, setSearchPoint] = useState(null);
  const { toasts, show, dismiss } = useToasts();
  const locate = useLocate(map);
  const typeSelectRef = useRef(null);
  const now = useNow();

  // Un type mémorisé peut avoir été supprimé entre-temps.
  const selectedType = types.some((t) => t.id === storedType) ? storedType : null;
  const filters = useMemo(() => {
    const f = { ...NO_FILTERS, ...storedFilters };
    return types.length && f.typeId && !types.some((t) => t.id === f.typeId) ? { ...f, typeId: null } : f;
  }, [storedFilters, types]);

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

  // Annuler un tap = supprimer le passage ; la fiche revient au précédent.
  const undoPassage = useCallback(
    async (passage) => {
      const { error } = await deletePassage(passage);
      show(error ? { kind: "error", text: `Annulation impossible. ${NETWORK_HINT}` } : { kind: "info", text: "Passage annulé" });
    },
    [deletePassage, show]
  );

  const handleTap = useCallback(
    async (building) => {
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

      const { error, passage } = await addPassage(
        passagePayload({ id_batiment: building.id, typeId: selectedType, auteur })
      );
      if (error) {
        show({ kind: "error", text: `Passage non enregistré. ${NETWORK_HINT}` });
        return;
      }
      navigator.vibrate?.(20);
      show({
        kind: "success",
        text: `✓ Prospecté · ${types.find((t) => t.id === selectedType)?.name}`,
        action: { label: "Annuler", run: () => undoPassage(passage) },
      });
    },
    [mode, selectedType, auteur, types, addPassage, show, openBuilding, undoPassage]
  );

  const handleSaveFiche = async (form) => {
    const { error } = await saveFiche(formToPayload(form));
    show(error ? { kind: "error", text: `Fiche non enregistrée. ${NETWORK_HINT}` } : { kind: "success", text: "✓ Fiche enregistrée" });
  };

  const handleAddPassage = async (id_batiment, { date, typeId }) => {
    const { error } = await addPassage(passagePayload({ id_batiment, date, typeId, auteur }));
    show(error ? { kind: "error", text: `Passage non enregistré. ${NETWORK_HINT}` } : { kind: "success", text: "✓ Passage ajouté" });
  };

  const handleDeletePassage = async (passage) => {
    const { error } = await deletePassage(passage);
    show(error ? { kind: "error", text: `Suppression impossible. ${NETWORK_HINT}` } : { kind: "info", text: "Passage supprimé" });
  };

  const handleDeleteFiche = async (id_batiment) => {
    const { error } = await removeFiche(id_batiment);
    if (error) {
      show({ kind: "error", text: `Suppression impossible. ${NETWORK_HINT}` });
      return;
    }
    show({ kind: "info", text: "Fiche et historique supprimés" });
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

  const handleExport = async (what) => {
    if (what === "fiches") {
      downloadText(`prospection-fiches-${today()}.csv`, fichesCsv(records, types, buildingCenters(buildings)));
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
        {/* Zoom 19 : le fond OSM y affiche les numéros de rue. */}
        <TileLayer
          attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>"
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        {ready && (
          <BuildingsLayer
            buildings={buildings}
            records={records}
            filters={filters}
            now={now}
            selectedId={selectedId}
            onTap={handleTap}
            onEdit={openBuilding}
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

      <Toasts toasts={toasts} onDismiss={dismiss} />

      {sheet?.kind === "building" && (
        <BuildingSheet
          key={sheet.building.id}
          building={sheet.building}
          record={records.get(sheet.building.id)}
          types={types}
          selectedType={selectedType}
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
      />

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
