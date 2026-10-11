import { useEffect, useMemo, useRef } from "react";
import { GeoJSON } from "react-leaflet";
import { partialColor } from "../lib/adresses";
import { colorFor, NEVER_COLOR, styleFor } from "../lib/colors";
import { dateMode, socialHorsCible } from "../lib/modes";
import { featureId, hasFilters, matchesFilters } from "../lib/prospections";

// Style de départ, constant : le changer forcerait Leaflet à restyler
// toute la couche.
const BASE_STYLE = styleFor(NEVER_COLOR);

// Couche des bâtiments. Tap = onTap(building), clic droit / appui long =
// onEdit(building), avec building = { id, latlng, properties }.
// focus (tournée en cours) : { ids: Set, nextId } — les autres bâtiments sont
// estompés et le prochain à faire est cerclé.
// adressesFor(id) : adresses d'un bâtiment (hachures si fait en partie).
// isSocial(id) : logement social (gris barré, sauf en mode commerçants).
// terrain : mode de prospection affiché (les couleurs suivent son dernier passage).
export default function BuildingsLayer({
  buildings,
  records,
  sectorOf,
  adressesFor = () => [],
  isSocial = () => false,
  terrain = "boitage",
  filters,
  focus,
  now,
  selectedId,
  onTap,
  onEdit,
}) {
  const groupRef = useRef(null);
  const layersRef = useRef(new Map()); // id → { layer, key }

  // Indexe les couches réellement affichées, une fois montées.
  useEffect(() => {
    const index = new Map();
    groupRef.current.eachLayer((layer) => {
      index.set(featureId(layer.feature), { layer, key: null });
    });
    layersRef.current = index;
  }, [buildings]);

  // Restyle uniquement les bâtiments dont l'apparence change (après un tap,
  // un changement venu d'un collègue, de filtre, de sélection ou de date).
  useEffect(() => {
    const filtering = hasFilters(filters);
    for (const [id, entry] of layersRef.current) {
      const record = records.get(id);
      const date = dateMode(record, terrain);
      const color = colorFor(date, now);
      const social = isSocial(id);
      const options = {
        social: social && socialHorsCible(terrain),
        selected: id === selectedId || id === focus?.nextId,
        inaccessible: record?.acces === "inaccessible",
        partial: terrain === "boitage" && record?.date ? partialColor(record, adressesFor(id), now) : null,
        hidden:
          (focus && !focus.ids.has(id)) ||
          (filtering && !matchesFilters(record, filters, now, sectorOf.get(id) ?? null, social, date)),
      };
      const key = `${color}|${options.selected}|${options.inaccessible}|${options.hidden}|${options.partial}|${options.social}`;
      if (key !== entry.key) {
        entry.layer.setStyle(styleFor(color, options));
        entry.key = key;
      }
    }
  }, [buildings, records, sectorOf, adressesFor, isSocial, terrain, filters, focus, now, selectedId]);

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
