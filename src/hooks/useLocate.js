import { useCallback, useEffect, useRef, useState } from "react";
import { LocateControl } from "leaflet.locatecontrol";
import "leaflet.locatecontrol/dist/L.Control.Locate.min.css";

// Suivi de la position (GPS) piloté par notre propre bouton : le plugin
// dessine le point bleu et suit la position, son bouton Leaflet est masqué.
export function useLocate(map) {
  const controlRef = useRef(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!map) return;
    const control = new LocateControl({
      flyTo: true,
      showPopup: false,
      locateOptions: { enableHighAccuracy: true, maxZoom: 18, watch: true },
      strings: { outsideMapBoundsMsg: "Vous semblez être en dehors des limites de la carte" },
    }).addTo(map);
    controlRef.current = control;

    const onActivate = () => setActive(true);
    const onDeactivate = () => setActive(false);
    map.on("locateactivate", onActivate);
    map.on("locatedeactivate", onDeactivate);
    return () => {
      map.off("locateactivate", onActivate);
      map.off("locatedeactivate", onDeactivate);
      control.remove();
    };
  }, [map]);

  const toggle = useCallback(() => {
    const control = controlRef.current;
    if (!control) return;
    if (active) control.stop();
    else control.start();
  }, [active]);

  return { active, toggle };
}
