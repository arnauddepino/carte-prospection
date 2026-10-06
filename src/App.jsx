import { useCallback, useEffect, useRef, useState } from "react";
import { CircleMarker, MapContainer, TileLayer } from "react-leaflet";

import { supabase } from "./supabaseClient";
import { useProspections } from "./hooks/useProspections";
import { useProspectTypes } from "./hooks/useProspectTypes";
import { useStoredState } from "./hooks/useStoredState";
import { useNow } from "./hooks/useNow";
import { useToasts } from "./hooks/useToasts";
import { useLocate } from "./hooks/useLocate";
import { formToPayload } from "./lib/prospections";

import BuildingsLayer from "./components/BuildingsLayer";
import BottomBar from "./components/BottomBar";
import BuildingSheet from "./components/BuildingSheet";
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

function ProspectionMap() {
  const [map, setMap] = useState(null);
  const [buildings, setBuildings] = useState(null);
  const [buildingsError, setBuildingsError] = useState(false);
  const { records, status, reload, save, remove } = useProspections();
  const { types, create: createType } = useProspectTypes();
  const [mode, setMode] = useStoredState("prospection.mode", "prospect");
  const [storedType, setSelectedType] = useStoredState("prospection.type", null);
  const [storedFilter, setFilterType] = useStoredState("prospection.filtre", null);
  const [sheet, setSheet] = useState(null); // null | { kind: "building", building } | { kind: "settings" }
  const [searchPoint, setSearchPoint] = useState(null);
  const { toasts, show, dismiss } = useToasts();
  const locate = useLocate(map);
  const typeSelectRef = useRef(null);
  const now = useNow();

  // Un type mémorisé peut avoir été supprimé entre-temps.
  const selectedType = types.some((t) => t.id === storedType) ? storedType : null;
  const filterType = types.some((t) => t.id === storedFilter) ? storedFilter : null;

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

  // Annule un tap : remet la date et le type d'avant, ou supprime la ligne
  // si le bâtiment n'avait jamais été prospecté.
  const undoTap = useCallback(
    async (id_batiment, previous) => {
      const { error } = previous
        ? await save({ id_batiment, date: previous.date, prospection_type_id: previous.prospection_type_id })
        : await remove(id_batiment);
      show(error ? { kind: "error", text: `Annulation impossible. ${NETWORK_HINT}` } : { kind: "info", text: "Passage annulé" });
    },
    [save, remove, show]
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

      const previous = records.get(building.id);
      const { error } = await save({
        id_batiment: building.id,
        date: new Date().toISOString(),
        prospection_type_id: selectedType,
      });
      if (error) {
        show({ kind: "error", text: `Passage non enregistré. ${NETWORK_HINT}` });
        return;
      }
      navigator.vibrate?.(20);
      show({
        kind: "success",
        text: `✓ Prospecté · ${types.find((t) => t.id === selectedType)?.name}`,
        action: { label: "Annuler", run: () => undoTap(building.id, previous) },
      });
    },
    [mode, selectedType, records, save, show, openBuilding, undoTap, types]
  );

  const handleSave = async (form) => {
    const payload = formToPayload(form, null);
    if (!payload) {
      show({ kind: "info", text: "Choisissez le type de prospection." });
      return;
    }
    const { error } = await save(payload);
    if (error) {
      show({ kind: "error", text: `Fiche non enregistrée. ${NETWORK_HINT}` });
      return;
    }
    show({ kind: "success", text: "✓ Fiche enregistrée" });
    setSheet(null);
  };

  const handleDelete = async (id_batiment) => {
    const { error } = await remove(id_batiment);
    if (error) {
      show({ kind: "error", text: `Suppression impossible. ${NETWORK_HINT}` });
      return;
    }
    show({ kind: "info", text: "Prospection supprimée" });
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
            filterType={filterType}
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
          onSave={handleSave}
          onDelete={() => handleDelete(sheet.building.id)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "settings" && (
        <SettingsSheet
          types={types}
          filterType={filterType}
          onFilterType={setFilterType}
          onCreateType={handleCreateType}
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
        filterActive={Boolean(filterType)}
        onOpenSettings={() => setSheet({ kind: "settings" })}
      />
    </div>
  );
}
