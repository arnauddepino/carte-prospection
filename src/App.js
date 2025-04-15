import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, Popup } from "react-leaflet";
import { supabase } from "./supabaseClient";
import "leaflet/dist/leaflet.css";
import "./App.css";

function App() {
  const [buildings, setBuildings] = useState(null);
  const [prospected, setProspected] = useState([]);
  const [popupInfo, setPopupInfo] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const layerRefs = useRef({});

  const refresh = async () => {
    const { data, error } = await supabase.from("prospections").select("*");
    if (!error) {
      setProspected(data);
      setDataReady(true);
    }
  };

  const updateColor = (id, customProspected = null) => {
    const layer = layerRefs.current[id];
    if (!layer) return;

    const data = customProspected || prospected;
    const record = data.find((p) => p.id_batiment === id);
    const lastDate = record?.date ? new Date(record.date) : null;

    let color = "#888";
    if (lastDate) {
      const now = new Date();
      const diffDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
      if (diffDays < 7) color = "green";
      else if (diffDays < 14) color = "yellow";
      else if (diffDays < 30) color = "orange";
      else if (diffDays < 90) color = "red";
      else color = "black";
    }
    
    if (typeof layer.setStyle === "function") {
      layer.setStyle({ color, weight: 1, fillOpacity: 0.4 });
    }
  };

  useEffect(() => {
    const loadBuildings = async () => {
      try {
        const response = await fetch("buildings15e-full-v3.geojson");
        const data = await response.json();
        setBuildings(data);
        await refresh();
      } catch (error) {
        console.error("❌ Erreur chargement bâtiments :", error);
      }
    };

    loadBuildings();
  }, []);

  const saveProspection = async (data) => {
    const exists = prospected.find((p) => p.id_batiment === data.id_batiment);
    const cleaned = {
      id_batiment: data.id_batiment,
      date: new Date(data.date).toISOString(),
      bal: data.bal || null,
      code_entree: data.code_entree || null,
      infos: data.infos || null,
    };

    if (exists) {
      await supabase.from("prospections").update(cleaned).eq("id_batiment", cleaned.id_batiment);
    } else {
      await supabase.from("prospections").insert([cleaned]);
    }
    const updated = prospected.filter((p) => p.id_batiment !== cleaned.id_batiment);
    const newProspected = [...updated, cleaned];
    setProspected(newProspected);
    updateColor(cleaned.id_batiment, newProspected);
    setPopupInfo(null);
  };

  const deleteProspection = async (id_batiment) => {
    await supabase.from("prospections").delete().eq("id_batiment", id_batiment);
    const updated = prospected.filter((p) => p.id_batiment !== id_batiment);
    setProspected(updated);
    updateColor(id_batiment, updated);
    setPopupInfo(null);
  };

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      {!dataReady && <div style={{ position: "absolute", top: 10, left: 10, background: "white", padding: "0.5rem" }}>Chargement des données...</div>}
      <MapContainer center={[48.845, 2.29]} 
      zoom={17}            // 🔍 Zoom plus proche (15 par défaut) 
      minZoom={13} maxZoom={20}         // 🧭 Permet de zoomer encore plus 
      style={{ height: "100%", width: "100%" }}>

        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {buildings && dataReady && (
          <GeoJSON
            data={buildings}
            onEachFeature={(feature, layer) => {
              const id = feature.id || feature.properties["@id"];
              layerRefs.current[id] = layer;
              updateColor(id);

              layer.on("click", async () => {
                const today = new Date().toISOString();
                await saveProspection({
                  id_batiment: id,
                  date: today,
                  bal: null,
                  code_entree: null,
                  infos: null,
                });
              });

              layer.on("contextmenu", (e) => {
                const found = prospected.find((p) => p.id_batiment === id);
                setPopupInfo({
                  id_batiment: id,
                  latlng: e.latlng,
                  date: found?.date || new Date().toISOString(),
                  bal: found?.bal || "",
                  code_entree: found?.code_entree || "",
                  infos: found?.infos || "",
                });
              });
            }}
          />
        )}

        {popupInfo && (
          <Popup position={popupInfo.latlng} onClose={() => setPopupInfo(null)}>
            <div style={{ fontSize: "0.9rem", minWidth: "200px" }}>
              <strong>{popupInfo.id_batiment}</strong>
              <br />
              <label>
                Date :
                <input
                  type="date"
                  value={popupInfo.date?.slice(0, 10)}
                  onChange={(e) => setPopupInfo({ ...popupInfo, date: e.target.value })}
                  style={{ width: "100%" }}
                />
              </label>
              <br />
              <label>
                BAL :
                <input
                  type="number"
                  value={popupInfo.bal}
                  onChange={(e) => setPopupInfo({ ...popupInfo, bal: e.target.value })}
                  style={{ width: "100%" }}
                />
              </label>
              <br />
              <label>
                Code entrée :
                <input
                  type="text"
                  value={popupInfo.code_entree}
                  onChange={(e) => setPopupInfo({ ...popupInfo, code_entree: e.target.value })}
                  style={{ width: "100%" }}
                />
              </label>
              <br />
              <label>
                Infos :
                <textarea
                  rows="2"
                  value={popupInfo.infos}
                  onChange={(e) => setPopupInfo({ ...popupInfo, infos: e.target.value })}
                  style={{ width: "100%" }}
                />
              </label>
              <br />
              <button onClick={() => saveProspection(popupInfo)} style={{ marginTop: "0.5rem" }}>
                📂 Sauvegarder
              </button>
              <button
                onClick={() => deleteProspection(popupInfo.id_batiment)}
                style={{ marginLeft: "0.5rem", color: "red" }}
              >
                🗑️ Supprimer
              </button>
            </div>
          </Popup>
        )}
      </MapContainer>
    </div>
  );
}

export default App;