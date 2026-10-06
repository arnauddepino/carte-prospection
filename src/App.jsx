import { useCallback, useEffect, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";

import { supabase } from "./supabaseClient";
import { useProspections } from "./hooks/useProspections";
import { useProspectTypes } from "./hooks/useProspectTypes";
import { useStoredState } from "./hooks/useStoredState";
import { useNow } from "./hooks/useNow";
import { formToPayload, recordToForm } from "./lib/prospections";

import BuildingsLayer from "./components/BuildingsLayer";
import ControlPanel from "./components/ControlPanel";
import EditPopup from "./components/EditPopup";
import { LocateButton, SearchBox } from "./components/MapControls";

const BUILDINGS_URL = `${import.meta.env.BASE_URL}batiments-15e.geojson`;
const NETWORK_ERROR = "(problème de réseau ?). Réessayez.";

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

function ProspectionMap() {
  const [buildings, setBuildings] = useState(null);
  const [buildingsError, setBuildingsError] = useState(false);
  const { records, status, reload, save, remove } = useProspections();
  const { types, create: createType } = useProspectTypes();
  const [storedType, setSelectedType] = useStoredState("prospection.type", null);
  const [storedFilter, setFilterType] = useStoredState("prospection.filtre", null);
  const [editing, setEditing] = useState(null); // { form, latlng }
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

  // Tap : enregistre un passage aujourd'hui, sans toucher aux BAL / code / infos.
  const handleTap = useCallback(
    async (id_batiment) => {
      if (!selectedType) {
        alert("➡️ Veuillez sélectionner un type de prospection avant.");
        return;
      }
      setEditing(null);
      const { error } = await save({
        id_batiment,
        date: new Date().toISOString(),
        prospection_type_id: selectedType,
      });
      if (error) alert(`❌ La prospection n’a pas été enregistrée ${NETWORK_ERROR}`);
    },
    [selectedType, save]
  );

  const handleEdit = useCallback(
    (id_batiment, latlng) => {
      setEditing({ form: recordToForm(id_batiment, records.get(id_batiment)), latlng });
    },
    [records]
  );

  const handleSave = async () => {
    const payload = formToPayload(editing.form, selectedType);
    if (!payload) {
      alert("➡️ Veuillez sélectionner un type de prospection avant.");
      return;
    }
    const { error } = await save(payload);
    if (error) alert(`❌ La prospection n’a pas été enregistrée ${NETWORK_ERROR}`);
    else setEditing(null);
  };

  const handleDelete = async () => {
    if (!window.confirm("Supprimer la prospection de ce bâtiment ?")) return;
    const { error } = await remove(editing.form.id_batiment);
    if (error) alert(`❌ La prospection n’a pas été supprimée ${NETWORK_ERROR}`);
    else setEditing(null);
  };

  const handleCreateType = async (name) => {
    const result = await createType(name);
    if (result.error) alert(`❌ Le type n’a pas été créé ${NETWORK_ERROR}`);
    return result;
  };

  const ready = buildings && !status.loading && !status.error;
  const editingTypeId = editing && (editing.form.typeId ?? selectedType);

  return (
    <div className="app">
      {(buildingsError || status.error) && (
        <div className="status-banner error">
          Impossible de charger les données {NETWORK_ERROR}{" "}
          <button
            onClick={() => {
              if (buildingsError) loadBuildings();
              if (status.error) reload();
            }}
          >
            Réessayer
          </button>
        </div>
      )}
      {!ready && !buildingsError && !status.error && (
        <div className="status-banner">Chargement des données…</div>
      )}

      <ControlPanel
        types={types}
        selectedType={selectedType}
        onSelectType={setSelectedType}
        filterType={filterType}
        onFilterType={setFilterType}
        onCreateType={handleCreateType}
      />

      <MapContainer center={[48.845, 2.29]} zoom={17} minZoom={13} maxZoom={19} preferCanvas className="map">
        {/* Zoom 19 : le fond OSM y affiche les numéros de rue. */}
        <TileLayer
          attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <SearchBox />
        <LocateButton />

        {ready && (
          <BuildingsLayer
            buildings={buildings}
            records={records}
            filterType={filterType}
            now={now}
            onTap={handleTap}
            onEdit={handleEdit}
          />
        )}

        {editing && (
          <EditPopup
            form={editing.form}
            latlng={editing.latlng}
            typeName={types.find((t) => t.id === editingTypeId)?.name}
            onChange={(form) => setEditing({ ...editing, form })}
            onSave={handleSave}
            onDelete={handleDelete}
            onClose={() => setEditing(null)}
          />
        )}
      </MapContainer>
    </div>
  );
}
