import { useEffect, useMemo, useState } from "react";
import { fetchPassages } from "../hooks/useProspections";
import { useStoredState } from "../hooks/useStoredState";
import { sectorStats } from "../lib/secteurs";
import { balInfo } from "../lib/bal";
import { coverageSeries, deltaPct, foldOthers, groupBy, perWeek, selectPassages, weekStarts } from "../lib/stats";
import { BarList, ChartCard, ColumnChart, LineChart, StatTile } from "./Charts";
import Icon from "./Icon";

const PERIODS = [
  { weeks: 4, label: "4 semaines" },
  { weeks: 12, label: "12 semaines" },
  { weeks: 26, label: "6 mois" },
];
const fmt = (n) => Math.round(n).toLocaleString("fr-FR");
const shortDate = (d) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

// Tableau de bord : activité de l'équipe et couverture des secteurs.
// isTarget(id) : bâtiment ciblé (les logements sociaux ne comptent pas dans la couverture).
export default function Dashboard({ records, types, secteurs, sectorOf, isTarget = () => true, balData, now, onClose }) {
  const [weeks, setWeeks] = useStoredState("prospection.tableau.semaines", 12);
  const [secteurId, setSecteurId] = useState(null);
  const [state, setState] = useState({ loading: true, error: null, passages: [] });

  useEffect(() => {
    let cancelled = false;
    fetchPassages().then(({ data, error }) => !cancelled && setState({ loading: false, error, passages: data }));
    return () => {
      cancelled = true;
    };
  }, []);

  const view = useMemo(() => {
    const { passages } = state;
    const starts = weekStarts(now, weeks);
    const from = starts[0];
    const to = new Date(+now + 1);
    const prevFrom = new Date(+from - weeks * 7 * 864e5);
    const opts = { secteurId, sectorOf };
    const current = selectPassages(passages, { from, to, ...opts });
    const previous = selectPassages(passages, { from: prevFrom, to: from, ...opts });
    const infoOf = (id) => balInfo(id, records.get(id), balData);
    const balOf = (id) => infoOf(id).value;
    const typeName = (id) => types.find((t) => t.id === id)?.name ?? "Sans type";

    // Bâtiments dont on mesure la couverture.
    const universe = new Set(
      [
        ...(secteurId
          ? [...sectorOf].filter(([, s]) => s === secteurId).map(([id]) => id)
          : secteurs.length
            ? sectorOf.keys()
            : records.keys()),
      ].filter(isTarget)
    );
    const weekEnds = starts.map((s) => new Date(Math.min(+s + 7 * 864e5 - 1, +now)));
    const coverage = coverageSeries(passages, universe, weekEnds);

    const sum = (list) =>
      list.reduce(
        (acc, p) => {
          const info = infoOf(p.id_batiment);
          if (info.value == null) return acc;
          return {
            flyers: acc.flyers + info.value,
            known: acc.known + 1,
            estimated: acc.estimated + (info.source === "estimation" ? info.value : 0),
          };
        },
        { flyers: 0, known: 0, estimated: 0 }
      );
    const cur = sum(current);
    const prev = sum(previous);
    const auteurs = new Set(current.map((p) => p.auteur).filter(Boolean));

    return {
      current,
      count: current.length,
      countDelta: deltaPct(current.length, previous.length),
      flyers: cur.flyers,
      flyersDelta: deltaPct(cur.flyers, prev.flyers),
      knownShare: current.length ? Math.round((100 * cur.known) / current.length) : 0,
      estimated: cur.estimated,
      auteurs: auteurs.size,
      coverage,
      universeSize: universe.size,
      perWeek: perWeek(current, starts, balOf),
      byAuteur: foldOthers(groupBy(current, (p) => p.auteur ?? "Sans prénom", balOf), 8),
      byType: foldOthers(groupBy(current, (p) => typeName(p.prospection_type_id), balOf), 8),
      bySector: secteurs
        .map((s) => ({ s, st: sectorStats(s.id, sectorOf, records, now, 30, isTarget) }))
        .sort((a, b) => b.st.pct - a.st.pct),
    };
  }, [state, weeks, secteurId, sectorOf, isTarget, records, types, secteurs, now]);

  const nowCoverage = view.coverage.at(-1);
  const periodLabel = PERIODS.find((p) => p.weeks === weeks)?.label ?? `${weeks} semaines`;
  const vsPrevious = "vs période précédente";

  return (
    <section className="dashboard" aria-label="Tableau de bord">
      <header className="dashboard-header">
        <h2>Tableau de bord</h2>
        <button className="icon-button" aria-label="Fermer le tableau de bord" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>

      {/* Filtres : ils s'appliquent à tout le tableau. */}
      <div className="dashboard-filters">
        <div className="segmented" role="group" aria-label="Période">
          {PERIODS.map((p) => (
            <button key={p.weeks} type="button" aria-pressed={weeks === p.weeks} onClick={() => setWeeks(p.weeks)}>
              {p.label}
            </button>
          ))}
        </div>
        {secteurs.length > 0 && (
          <select
            aria-label="Secteur"
            value={secteurId ?? ""}
            onChange={(e) => setSecteurId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Tous les secteurs</option>
            {secteurs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
        )}
      </div>

      {state.loading ? (
        <p className="hint dashboard-message">Chargement de l’historique…</p>
      ) : state.error ? (
        <p className="hint dashboard-message">Tableau de bord indisponible sans réseau. Réessayez une fois connecté.</p>
      ) : (
        <div className="dashboard-body">
          <div className="stat-grid">
            <StatTile
              hero
              label={secteurId ? "Couverture du secteur" : secteurs.length ? "Couverture des secteurs" : "Couverture"}
              value={`${fmt(nowCoverage?.pct ?? 0)} %`}
              note={`${fmt(nowCoverage?.covered ?? 0)} / ${fmt(view.universeSize)} bâtiments prospectés depuis moins de 30 jours`}
            />
            <StatTile label={`Passages · ${periodLabel}`} value={fmt(view.count)} delta={view.countDelta} deltaLabel={vsPrevious} />
            <StatTile
              label="Flyers estimés"
              value={fmt(view.flyers)}
              delta={view.flyersDelta}
              deltaLabel={vsPrevious}
              note={`${view.estimated ? `dont ≈ ${fmt(view.estimated)} estimés · ` : ""}boîtes aux lettres connues ou estimées pour ${view.knownShare} % des passages`}
            />
            <StatTile label="Collègues actifs" value={fmt(view.auteurs)} note={periodLabel} />
          </div>

          {view.count === 0 ? (
            <p className="hint dashboard-message">Aucun passage sur cette période{secteurId ? " dans ce secteur" : ""}.</p>
          ) : (
            <>
              <ChartCard
                title="Passages par semaine"
                subtitle="Semaines commençant le lundi"
                table={{
                  columns: ["Semaine du", "Passages", "Flyers estimés"],
                  rows: view.perWeek.map((w) => [shortDate(w.start), fmt(w.count), fmt(w.flyers)]),
                }}
              >
                <ColumnChart
                  data={view.perWeek.map((w) => ({
                    label: shortDate(w.start),
                    value: w.count,
                    detail: `≈ ${fmt(w.flyers)} flyers`,
                  }))}
                />
              </ChartCard>

              <ChartCard
                title="Couverture dans le temps"
                subtitle="Part des bâtiments prospectés dans les 30 jours précédents"
                table={{
                  columns: ["Fin de semaine", "Couverture", "Bâtiments"],
                  rows: view.coverage.map((c) => [shortDate(c.date), `${fmt(c.pct)} %`, `${fmt(c.covered)} / ${fmt(c.total)}`]),
                }}
              >
                <LineChart
                  data={view.coverage.map((c) => ({
                    label: shortDate(c.date),
                    value: c.pct,
                    detail: `${fmt(c.covered)} / ${fmt(c.total)} bâtiments`,
                  }))}
                />
              </ChartCard>

              <ChartCard
                title="Par collègue"
                subtitle={`Passages · ${periodLabel}`}
                table={{
                  columns: ["Collègue", "Passages", "Flyers estimés"],
                  rows: view.byAuteur.map((g) => [g.key, fmt(g.count), fmt(g.flyers)]),
                }}
              >
                <BarList items={view.byAuteur.map((g) => ({ label: g.key, value: g.count }))} />
              </ChartCard>

              <ChartCard
                title="Par type de prospection"
                subtitle={`Passages · ${periodLabel}`}
                table={{
                  columns: ["Type", "Passages", "Flyers estimés"],
                  rows: view.byType.map((g) => [g.key, fmt(g.count), fmt(g.flyers)]),
                }}
              >
                <BarList items={view.byType.map((g) => ({ label: g.key, value: g.count }))} />
              </ChartCard>
            </>
          )}

          {!secteurId && view.bySector.length > 0 && (
            <ChartCard
              title="Couverture par secteur"
              subtitle="Bâtiments prospectés depuis moins de 30 jours"
              table={{
                columns: ["Secteur", "Responsable", "Couverture", "Bâtiments", "Boîtes aux lettres connues"],
                rows: view.bySector.map(({ s, st }) => [s.nom, s.responsable ?? "—", `${st.pct} %`, `${st.aJour} / ${st.total}`, fmt(st.bal)]),
              }}
            >
              <BarList
                max={100}
                track
                items={view.bySector.map(({ s, st }) => ({
                  label: s.responsable ? `${s.nom} · ${s.responsable}` : s.nom,
                  value: st.pct,
                  valueLabel: `${st.pct} %`,
                  color: s.couleur,
                }))}
              />
            </ChartCard>
          )}
        </div>
      )}
    </section>
  );
}
