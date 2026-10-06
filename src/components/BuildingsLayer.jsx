import { useEffect, useMemo, useRef } from "react";
import { GeoJSON } from "react-leaflet";
import { colorFor, NEVER_COLOR, styleFor } from "../lib/colors";
import { featureId } from "../lib/prospections";

// Style de départ, constant : le changer forcerait Leaflet à restyler
// toute la couche.
const BASE_STYLE = styleFor(NEVER_COLOR);

// Couche des bâtiments. Tap = onTap(building), clic droit / appui long =
// onEdit(building), avec building = { id, latlng, properties }.
export default function BuildingsLayer({ buildings, records, filterType, now, selectedId, onTap, onEdit }) {
  const groupRef = useRef(null);
  const layersRef = useRef(new Map()); // id → { layer, color, selected }

  // Indexe les couches réellement affichées, une fois montées.
  useEffect(() => {
    const index = new Map();
    groupRef.current.eachLayer((layer) => {
      index.set(featureId(layer.feature), { layer, color: null, selected: false });
    });
    layersRef.current = index;
  }, [buildings]);

  // Restyle uniquement les bâtiments qui changent (après un tap, un
  // changement de filtre, de sélection ou le passage du temps).
  useEffect(() => {
    for (const [id, entry] of layersRef.current) {
      const record = records.get(id);
      const shown = record && (!filterType || record.prospection_type_id === filterType);
      const color = colorFor(shown ? record.date : null, now);
      const selected = id === selectedId;
      if (color !== entry.color || selected !== entry.selected) {
        entry.layer.setStyle(styleFor(color, selected));
        entry.color = color;
        entry.selected = selected;
      }
    }
  }, [buildings, records, filterType, now, selectedId]);

  const eventHandlers = useMemo(() => {
    const building = (e) => ({
      id: featureId(e.propagatedFrom.feature),
      latlng: e.latlng,
      properties: e.propagatedFrom.feature.properties,
    });
    return {
      click: (e) => onTap(building(e)),
      contextmenu: (e) => onEdit(building(e)),
    };
  }, [onTap, onEdit]);

  return (
    <GeoJSON ref={groupRef} data={buildings} style={BASE_STYLE} eventHandlers={eventHandlers} />
  );
}
