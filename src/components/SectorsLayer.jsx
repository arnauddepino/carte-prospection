import { Fragment, useMemo } from "react";
import L from "leaflet";
import { CircleMarker, Marker, Polyline } from "react-leaflet";
import "leaflet-polylineoffset";
import { legOffset, sectorRing } from "../lib/secteurs";

// Contour d'un secteur : une ligne colorée par tronçon, décalée du côté de la
// rangée d'immeubles qu'elle désigne, avec un liseré blanc pour la lisibilité.
// Les lignes ne réagissent au toucher que si `interactive` (gestion des secteurs).
function SectorLines({ sector, interactive, onLegTap }) {
  return sector.legs.map((leg, k) => {
    const offset = legOffset(sector, k);
    const key = `${sector.id}-${k}-${offset}-${interactive}`;
    return (
      <Fragment key={key}>
        <Polyline positions={leg} offset={offset} interactive={false} pathOptions={{ color: "#ffffff", weight: 7, opacity: 0.9 }} />
        <Polyline
          positions={leg}
          offset={offset}
          interactive={interactive}
          bubblingMouseEvents={false}
          pathOptions={{ color: sector.couleur, weight: 4, opacity: 1 }}
          eventHandlers={interactive ? { click: () => onLegTap(sector, k) } : undefined}
        />
      </Fragment>
    );
  });
}

// Nom du secteur au centre de son contour (second repère, en plus de la couleur).
function SectorLabel({ sector }) {
  const icon = useMemo(() => {
    const div = document.createElement("div");
    div.className = "sector-label";
    div.style.setProperty("--sector-color", sector.couleur);
    div.textContent = sector.nom;
    return L.divIcon({ html: div.outerHTML, className: "", iconSize: null });
  }, [sector.nom, sector.couleur]);
  const center = useMemo(() => {
    const ring = sectorRing(sector);
    return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  }, [sector]);
  return <Marker position={center} icon={icon} interactive={false} keyboard={false} />;
}

export default function SectorsLayer({ secteurs, interactive, onLegTap, draft }) {
  return (
    <>
      {secteurs.map((s) => (
        <Fragment key={s.id}>
          <SectorLines sector={s} interactive={interactive} onLegTap={onLegTap} />
          <SectorLabel sector={s} />
        </Fragment>
      ))}

      {/* Tracé en cours */}
      {draft && (
        <>
          {draft.legs.map((leg, k) => (
            <Polyline
              key={`draft-${k}`}
              positions={leg}
              interactive={false}
              pathOptions={{ color: draft.couleur, weight: 4, dashArray: "8 6" }}
            />
          ))}
          {draft.points.map((p, i) => (
            <CircleMarker
              key={`pt-${i}-${p[0]}-${p[1]}`}
              center={p}
              radius={i === 0 ? 10 : 6}
              interactive={false}
              pathOptions={{ color: "#ffffff", weight: 2, fillColor: draft.couleur, fillOpacity: 1 }}
            />
          ))}
        </>
      )}
    </>
  );
}
