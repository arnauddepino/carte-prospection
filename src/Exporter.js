import { useEffect } from "react";
import axios from "axios";
import osmtogeojson from "osmtogeojson";

export default function Exporter() {
  useEffect(() => {
    const fetchAndExportBuildings = async () => {
      const latStart = 48.830;
      const latEnd = 48.860;
      const lonStart = 2.275;
      const lonEnd = 2.305;
      const step = 0.0025;

      const allFeatures = [];
      const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

      for (let lat = latStart; lat < latEnd; lat += step) {
        for (let lon = lonStart; lon < lonEnd; lon += step) {
          let success = false;
          let attempts = 0;

          while (!success && attempts < 3) {
            attempts++;
            try {
              const query = `
                [out:json][timeout:25];
                (
                  way["building"](${lat},${lon},${lat + step},${lon + step});
                );
                out body;
                >;
                out skel qt;
              `;

              const response = await axios.post(
                "https://overpass-api.de/api/interpreter",
                query,
                { headers: { "Content-Type": "text/plain" } }
              );

              const geojson = osmtogeojson(response.data);
              allFeatures.push(...geojson.features);
              console.log(`✅ Zone ${lat.toFixed(4)}, ${lon.toFixed(4)} chargée (essai ${attempts})`);
              success = true;
            } catch (error) {
              console.warn(`⚠️ Zone ${lat.toFixed(4)}, ${lon.toFixed(4)} échouée (essai ${attempts})`);
              await sleep(1500); // petite pause avant de réessayer
            }
          }

          if (!success) {
            console.error(`❌ Échec définitif sur la zone ${lat}, ${lon}`);
          }

          await sleep(750); // pause entre chaque tuile
        }
      }

      const allData = {
        type: "FeatureCollection",
        features: allFeatures,
      };

      const blob = new Blob([JSON.stringify(allData)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "buildings15e-full.json";
      a.click();
      URL.revokeObjectURL(url);

      console.log("🎉 Export terminé : fichier buildings15e-full.json généré !");
    };

    fetchAndExportBuildings();
  }, []);

  return <h1 style={{ padding: "2rem" }}>🏗️ Export complet en cours… vérifie la console !</h1>;
}
