/* ─── React & React-Leaflet ──────────────────────────────── */
import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, Popup, useMap } from "react-leaflet";

/* ─── Leaflet de base ────────────────────────────────────── */
import "leaflet/dist/leaflet.css";
import * as L from "leaflet";

/* ─── Plugins (chargés + exposent L.control.locate) ──────── */
import "./leaflet-plugins";

/* ─── Supabase + styles maison ───────────────────────────── */
import { supabase } from "./supabaseClient";
import "./App.css";


function LocateButton() {
  const map = useMap();

  React.useEffect(() => {
    // S'assurer que le plugin est disponible avant de l'utiliser
    if (map && L.control && L.control.locate) {
      const locateControl = L.control.locate({
        position: "topleft",      // coin en haut à gauche
        flyTo: true,              // anime le zoom
        returnToPrevBounds: true, // retourne à la vue précédente quand désactivé
        icon: 'fa fa-location-arrow', // icône Font Awesome (facultatif)
        iconLoading: 'fa fa-spinner fa-spin', // icône durant le chargement
        showPopup: true,          // afficher un popup à l'emplacement
        strings: {
          title: "Me localiser",  // texte au survol du bouton
          popup: "Vous êtes ici",  // texte dans le popup
          outsideMapBoundsMsg: "Vous semblez être en dehors des limites de la carte"
        },
        locateOptions: {
          enableHighAccuracy: true, // utiliser le GPS si disponible
          maxZoom: 18,              // zoom max lors de la localisation
          watch: true               // suivre la position en continu
        }
      }).addTo(map);

      // Activer automatiquement après le chargement (facultatif)
      // setTimeout(() => locateControl.start(), 1000);

      return () => locateControl.remove();   // nettoyage si le composant disparaît
    } else {
      console.warn("Le plugin LocateControl n'est pas correctement chargé");
    }
  }, [map]);

  return null;   // rien à afficher dans le DOM React
}

function SearchBox() {
  const map = useMap();

  React.useEffect(() => {
    const geocoder = L.Control.geocoder({
      position: "bottomright",
      defaultMarkGeocode: false,
      placeholder: "Rechercher une adresse…",
      geocoder: L.Control.Geocoder.nominatim({
        geocodingQueryParams: { countrycodes: "fr" }   // favorise la France
      })
    })
      .on("markgeocode", e => {
        map.fitBounds(e.geocode.bbox);   // zoome sur le résultat
      })
      .addTo(map);

    return () => geocoder.remove();      // nettoyage si le composant disparaît
  }, [map]);

  return null;   // rien à rendre dans le DOM React
}

function App() {
  const [buildings, setBuildings] = useState(null);
  const [prospected, setProspected] = useState([]);
  const [popupInfo, setPopupInfo] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  // types de prospection
  const [prospectTypes, setProspectTypes]                 = useState([]);
  const [newTypeName, setNewTypeName]                     = useState("");
  const [selectedProspectType, setSelectedProspectType]   = useState(null);
  const [filterType, setFilterType]                       = useState(null);
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

    useEffect(() => {
  const loadProspectTypes = async () => {
    const { data, error } = await supabase
      .from("prospection_types")
      .select("*")
      .order("name", { ascending: true });
    if (error) {
      console.error("Erreur chargement types :", error);
    } else {
      setProspectTypes(data);
    }
  };
  loadProspectTypes();
}, []);
  const saveProspection = async (data) => {
    // ─── 1) Empêche l’enregistrement si pas de type choisi ─────────────────────
    if (!selectedProspectType) {
      alert("➡️ Veuillez sélectionner un type de prospection avant.");
      return;
    }

    // ─── 2) Vérifie si la prospection existe déjà en local ────────────────────
    const exists = prospected.find((p) => p.id_batiment === data.id_batiment);

    // ─── 3) Construit l’objet à envoyer en base, avec prospection_type_id ─────
    const payload = {
      id_batiment:   data.id_batiment,
      date:          new Date(data.date).toISOString(),
      bal:           data.bal || null,
      code_entree:   data.code_entree || null,
      infos:         data.infos || null,
      prospection_type_id: selectedProspectType,
    };

    // ─── 4) Envoie en base : update si existe, insert sinon ──────────────────
    if (exists) {
      await supabase
        .from("prospections")
        .update(payload)
        .eq("id_batiment", payload.id_batiment);
    } else {
      await supabase
        .from("prospections")
        .insert([payload]);
    }

    // ─── 5) Mets à jour ton état local et recolore la carte ───────────────────
    const others       = prospected.filter((p) => p.id_batiment !== payload.id_batiment);
    const newProspected = [...others, payload];
    setProspected(newProspected);
    updateColor(payload.id_batiment, newProspected);

    // ─── 6) Ferme le popup ─────────────────────────────────────────────────────
    setPopupInfo(null);
  };

  const deleteProspection = async (id_batiment) => {
    await supabase.from("prospections").delete().eq("id_batiment", id_batiment);
    const updated = prospected.filter((p) => p.id_batiment !== id_batiment);
    setProspected(updated);
    updateColor(id_batiment, updated);
    setPopupInfo(null);
  };
  useEffect(() => {
    if (!dataReady) return;
    // si un filtre est actif, ne passer à updateColor que la liste filtrée
    const list = filterType
      ? prospected.filter(p => p.prospection_type_id === filterType)
      : prospected;
    Object.keys(layerRefs.current).forEach(id =>
      updateColor(id, list)
    );
  }, [filterType, prospected, dataReady]);
  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      {!dataReady && <div style={{ position: "absolute", top: 10, left: 10, background: "white", padding: "0.5rem" }}>Chargement des données...</div>}
      <div className="control-panel">
    <div>
      <label>Type :</label>
      <select
        value={selectedProspectType || ""}
        onChange={e => setSelectedProspectType(Number(e.target.value))}
      >
        <option value="">-- Sélectionner --</option>
        {prospectTypes.map(t => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>

      <input
        type="text"
        placeholder="Nouveau type…"
        value={newTypeName}
        onChange={e => setNewTypeName(e.target.value)}
      />
      <button 
      disabled={!newTypeName.trim()}
      onClick={async () => {
        if (!newTypeName.trim()) return;
        const { error } = await supabase
          .from("prospection_types")
          .insert({ name: newTypeName.trim() });
        if (error) console.error("Création type :", error);
        else {
          setNewTypeName("");
          const { data } = await supabase
            .from("prospection_types")
            .select("*")
            .order("name", { ascending: true });
          setProspectTypes(data);
        }
      }}>➕</button>
    </div>

    <div>
      <label>Filtrer :</label>
      <select
        value={filterType || ""}
        onChange={e => setFilterType(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">-- Tous --</option>
        {prospectTypes.map(t => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </div>
  </div>
      <MapContainer center={[48.845, 2.29]} 
      zoom={17}            // 🔍 Zoom plus proche (15 par défaut) 
      minZoom={13} maxZoom={18}         // 🧭 Permet de zoomer encore plus 
      style={{ height: "100%", width: "100%" }}>

        <TileLayer
          attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <SearchBox />      {/* <- la loupe apparaît en haut à gauche */}
        <LocateButton />   {/* <- le bouton de localisation apparaît en haut à gauche */}

        
        
        {buildings && dataReady && (
          <GeoJSON
            key={selectedProspectType}      // force le remount quand on change de type
            data={buildings}
            onEachFeature={(feature, layer) => {
              const id = feature.id || feature.properties["@id"];
              layerRefs.current[id] = layer;
              updateColor(id);

              // clic gauche : enregistre la prospection
              layer.on("click", async () => {
                await saveProspection({
                  id_batiment: id,
                  date:        new Date().toISOString(),
                  bal:         null,
                  code_entree: null,
                  infos:       null,
                });
              });

              // clic droit : ouvre le popup d'édition
              layer.on("contextmenu", (e) => {
                const found = prospected.find(p => p.id_batiment === id);
                setPopupInfo({
                  id_batiment: id,
                  latlng:      e.latlng,
                  date:        found?.date || new Date().toISOString(),
                  bal:         found?.bal  || "",
                  code_entree: found?.code_entree || "",
                  infos:       found?.infos || "",
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