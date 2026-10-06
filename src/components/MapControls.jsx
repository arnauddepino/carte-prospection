import { useEffect } from "react";
import { useMap } from "react-leaflet";
import { LocateControl } from "leaflet.locatecontrol";
import { geocoder, geocoders } from "leaflet-control-geocoder";
import "leaflet.locatecontrol/dist/L.Control.Locate.min.css";
import "leaflet-control-geocoder/dist/Control.Geocoder.css";

// Bouton « Me localiser » (en haut à gauche, sous le zoom).
export function LocateButton() {
  const map = useMap();

  useEffect(() => {
    const control = new LocateControl({
      position: "topleft",
      flyTo: true,              // anime le zoom
      returnToPrevBounds: true, // revient à la vue précédente quand on désactive
      showPopup: true,
      strings: {
        title: "Me localiser",
        metersUnit: "mètres",
        popup: "Vous êtes ici (à {distance} {unit} près)",
        outsideMapBoundsMsg: "Vous semblez être en dehors des limites de la carte",
      },
      locateOptions: {
        enableHighAccuracy: true, // GPS si disponible
        maxZoom: 18,
        watch: true,              // suit la position en continu
      },
    }).addTo(map);

    return () => control.remove();
  }, [map]);

  return null;
}

// Recherche d'adresse (en bas à droite).
export function SearchBox() {
  const map = useMap();

  useEffect(() => {
    const control = geocoder({
      position: "bottomright",
      defaultMarkGeocode: false,
      placeholder: "Rechercher une adresse…",
      geocoder: geocoders.nominatim({
        geocodingQueryParams: { countrycodes: "fr" },
      }),
    })
      .on("markgeocode", (e) => map.fitBounds(e.geocode.bbox))
      .addTo(map);

    return () => control.remove();
  }, [map]);

  return null;
}
