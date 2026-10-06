import { useEffect, useMemo, useRef } from "react";
import { GeoJSON } from "react-leaflet";
import { colorFor, NEVER_COLOR } from "../lib/colors";
import { featureId } from "../lib/prospections";

// Style de départ, constant : le changer forcerait Leaflet à restyler
// toute la couche.
const BASE_STYLE = { color: NEVER_COLOR, weight: 1, fillOpacity: 0.4 };

// Couche des bâtiments. Tap = onTap(id), clic droit / appui long = onEdit(id, latlng).
export default function BuildingsLayer({ buildings, records, filterType, now, onTap, onEdit }) {
  const groupRef = useRef(null);
  const layersRef = useRef(new Map()); // id → { layer, color }

  // Indexe les couches réellement affichées, une fois montées.
  useEffect(() => {
    const index = new Map();
    groupRef.current.eachLayer((layer) => {
      index.set(featureId(layer.feature), { layer, color: null });
    });
    layersRef.current = index;
  }, [buildings]);

  // Recolore uniquement les bâtiments dont la couleur change
  // (après un tap, un changement de filtre ou le passage du temps).
  useEffect(() => {
    for (const [id, entry] of layersRef.current) {
      const record = records.get(id);
      const shown = record && (!filterType || record.prospection_type_id === filterType);
      const color = colorFor(shown ? record.date : null, now);
      if (color !== entry.color) {
        entry.layer.setStyle({ color });
        entry.color = color;
      }
    }
  }, [buildings, records, filterType, now]);

  const eventHandlers = useMemo(
    () => ({
      click: (e) => onTap(featureId(e.propagatedFrom.feature)),
      contextmenu: (e) => onEdit(featureId(e.propagatedFrom.feature), e.latlng),
    }),
    [onTap, onEdit]
  );

  return (
    <GeoJSON ref={groupRef} data={buildings} style={BASE_STYLE} eventHandlers={eventHandlers} />
  );
}
