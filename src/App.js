import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

function App() {
  const [buildings, setBuildings] = useState(null);
  const [prospected, setProspected] = useState([]);
  const [popupInfo, setPopupInfo] = useState(null);
  const layerRefs = useRef({});

  const refresh = () => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith("way/"));
    const data = keys.map((k) => ({
      id: k,
      date: localStorage.getItem(k),
    }));
    setProspected(data);
  };

  const updateColor = (id) => {
    const layer = layerRefs.current[id];
    if (!layer) return;

    const saved = localStorage.getItem(id);
    const lastDate = saved ? new Date(saved) : null;

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

    layer.setStyle({ color, weight: 1, fillOpacity: 0.4 });
  };

  useEffect(() => {
    const loadBuildings = async () => {
      try {
        const response = await fetch("buildings15e-full.json");
        const data = await response.json();
        setBuildings(data);

        const keys = Object.keys(localStorage).filter(k => k.startsWith("way/"));
        const dataProspected = keys.map((k) => ({
          id: k,
          date: localStorage.getItem(k),
        }));
        setProspected(dataProspected);
      } catch (error) {
        console.error("❌ Erreur chargement bâtiments :", error);
      }
    };

    loadBuildings();
  }, []);

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      <MapContainer center={[48.845, 2.29]} zoom={15} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {buildings && (
          <GeoJSON
            data={buildings}
            onEachFeature={(feature, layer) => {
              const id = feature.id || feature.properties["@id"];
              const saved = localStorage.getItem(id);
              const lastDate = saved ? new Date(saved) : null;

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

              layer.setStyle({
                color,
                weight: 1,
                fillOpacity: 0.4,
              });

              layerRefs.current[id] = layer;

              layer.on("click", () => {
                const existing = localStorage.getItem(id);
                if (existing) {
                  localStorage.removeItem(id);
                  layer.setStyle({ color: "#888", weight: 1, fillOpacity: 0.2 });
                } else {
                  const today = new Date().toISOString();
                  localStorage.setItem(id, today);
                  layer.setStyle({ color: "green", weight: 2, fillOpacity: 0.6 });
                }

                const keys = Object.keys(localStorage).filter(k => k.startsWith("way/"));
                const data = keys.map((k) => ({
                  id: k,
                  date: localStorage.getItem(k),
                }));
                setProspected(data);
              });

              layer.on("contextmenu", (e) => {
                setPopupInfo({
                  id,
                  latlng: e.latlng,
                  date: saved,
                });
              });
            }}
          />
        )}

        {popupInfo && (
          <Popup
            position={popupInfo.latlng}
            onClose={() => setPopupInfo(null)}
          >
            <div style={{ fontSize: "0.9rem" }}>
              <strong>Bâtiment :</strong><br />{popupInfo.id}<br />
              <strong>Date :</strong><br />
              {popupInfo.date ? new Date(popupInfo.date).toLocaleDateString("fr-FR") : "Non prospecté"}
              <br /><br />
              <button
                onClick={() => {
                  const newDate = prompt("Nouvelle date (AAAA-MM-JJ) :", popupInfo.date?.slice(0, 10) || "");
                  if (newDate) {
                    const iso = new Date(newDate).toISOString();
                    localStorage.setItem(popupInfo.id, iso);
                    setPopupInfo(null);
                    updateColor(popupInfo.id);
                    refresh();
                  }
                }}
              >
                ✏️ Modifier la date
              </button>
              <br />
              <button
                onClick={() => {
                  localStorage.removeItem(popupInfo.id);
                  setPopupInfo(null);
                  updateColor(popupInfo.id);
                  refresh();
                }}
                style={{ marginTop: "0.5rem", color: "red" }}
              >
                🗑️ Supprimer la prospection
              </button>
            </div>
          </Popup>
        )}
      </MapContainer>

      <ProspectionList items={prospected} hidden />
    </div>
  );
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("fr-FR");
}

function ProspectionList({ items, hidden }) {
  if (hidden) return null;

  return (
    <div style={{
      position: "absolute",
      bottom: 0,
      left: 0,
      background: "white",
      padding: "1rem",
      maxHeight: "40vh",
      overflowY: "auto",
      width: "100%",
      fontSize: "0.9rem",
      boxShadow: "0 -2px 6px rgba(0,0,0,0.2)",
      zIndex: 1000,
    }}>
      <h3 style={{ marginTop: 0 }}>📋 Bâtiments prospectés</h3>
      {items.length === 0 && <p>Aucune prospection enregistrée.</p>}
      {items.map(({ id, date }) => (
        <div key={id} style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.5rem"
        }}>
          <span>{id} — {formatDate(date)}</span>
          <div>
            <button onClick={() => {
              const newDate = prompt("Nouvelle date (AAAA-MM-JJ) :", date.slice(0, 10));
              if (newDate) {
                const iso = new Date(newDate).toISOString();
                localStorage.setItem(id, iso);
                window.location.reload();
              }
            }}>✏️</button>
            <button onClick={() => {
              localStorage.removeItem(id);
              window.location.reload();
            }} style={{ marginLeft: "0.5rem" }}>🗑️</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default App;
