import { Fragment, useMemo } from "react";
import L from "leaflet";
import { CircleMarker, Marker, Polyline } from "react-leaflet";
import "leaflet-polylineoffset";
import { legOffset, sectorLabelPosition } from "../lib/secteurs";

// Tronçons d'un secteur : ligne au milieu de la rue si les deux côtés sont
// couverts, décalée vers la rangée d'immeubles concernée sinon. Liseré blanc
// pour la lisibilité. Les lignes ne réagissent au toucher que si `interactive`
// (gestion des secteurs).
function SectorLines({ sector, interactive, onLegTap }) {
  return sector.troncons.map((t, i) => {
    const offset = legOffset(t);
    const weight = t.cote === "deux" ? 5 : 4;
    const key = `${sector.id}-${i}-${t.cote}-${t.coords.length}-${interactive}`;
    return (
      <Fragment key={key}>
        <Polyline positions={t.coords} offset={offset} interactive={false} pathOptions={{ color: "#ffffff", weight: weight + 3, opacity: 0.9 }} />
        <Polyline
          positions={t.coords}
          offset={offset}
          interactive={interactive}
          bubblingMouseEvents={false}
          pathOptions={{ color: sector.couleur, weight, opacity: 1 }}
          eventHandlers={interactive ? { click: () => onLegTap(sector, i) } : undefined}
        />
      </Fragment>
    );
  });
}

// Nom du secteur sur son plus long tronçon (second repère, en plus de la couleur).
function SectorLabel({ sector }) {
  const icon = useMemo(() => {
    const div = document.createElement("div");
    div.className = "sector-label";
    div.style.setProperty("--sector-color", sector.couleur);
    div.textContent = sector.nom;
    return L.divIcon({ html: div.outerHTML, className: "", iconSize: null });
  }, [sector.nom, sector.couleur]);
  const position = sectorLabelPosition(sector);
  if (!position) return null;
  return <Marker position={position} icon={icon} interactive={false} keyboard={false} />;
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
              key={`pt-${i}-${p.latlng[0]}-${p.latlng[1]}`}
              center={p.latlng}
              radius={p.last ? 9 : 6}
              interactive={false}
              pathOptions={{ color: "#ffffff", weight: 2, fillColor: draft.couleur, fillOpacity: 1 }}
            />
          ))}
        </>
      )}
    </>
  );
}
