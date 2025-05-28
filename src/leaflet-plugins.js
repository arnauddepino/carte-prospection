/* leaflet-plugins.js */

/* S'assurer que Leaflet est pleinement chargé d'abord */
import L from 'leaflet';
window.L = L;  // Exposer Leaflet globalement

/* Importer les CSS des plugins */
import "leaflet-control-geocoder/dist/Control.Geocoder.css";
import "leaflet.locatecontrol/dist/L.Control.Locate.min.css";

/* Importer les plugins JavaScript après avoir défini L */
import "leaflet-control-geocoder";
import "leaflet.locatecontrol";  // Utiliser le chemin principal du package au lieu du fichier .min.js

/* Exporter L pour être sûr qu'il est accessible */
export default L;