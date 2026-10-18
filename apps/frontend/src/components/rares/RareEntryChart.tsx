import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { RareEntryRow } from '../../api/types';
import { formatHours, formatInt, formatRate } from '../../format';
import { ChartFrame, niceScale, tooltipBoxStyle } from '../charts/chartKit';
import { ORIGIN_SERIES, approxTextWidth, useNarrowScreen } from './rareUtils';

const ROW_HEIGHT = 34;

// The list is sorted best first, so the first rows answer "where do I find
// rares"; the long tail (dozens of one-off hunts) is one click away.
const INITIAL_ROWS = 10;

// Same bar as the "1 raro a cada X" KPI: below 3 rares, or under an hour of
// play, a rate is mostly luck (1 rare in a 7-minute MD reads 8,8/h).
const MIN_RARES = 3;
const MIN_SECONDS = 3600;

interface RareEntryChartProps {
  /** Already re-counted from the visible rares (visibleEntryRows). */
  entries: RareEntryRow[];
  /** Hunts of the period with no visible rare, left out of `entries`. */
  hiddenHunts: number;
  /** Replaces the empty message when a filter (not the period) emptied the chart. */
  emptyText?: string;
}

const raresText = (n: number) => `${formatInt(n)} raro${n === 1 ? '' : 's'}`;

// Raros/h per hunt spot (MD bosses are weekly fights, not spots: left out; total rares ÷ total hours, not an average of
// per-session rates). The rate alone hides how much play is behind it, so
// each bar is labelled with its sample too, and small samples are faded and
// ranked after the reliable ones instead of leading the chart on one lucky
// run. Bars are colored by origin (same blue/orange as the timeline): the
// rate is the data here, and the spot's Pokémon type would be a second
// meaning for color that the chart doesn't need.
export function RareEntryChart({ entries: allEntries, hiddenHunts, emptyText }: RareEntryChartProps) {
  const narrow = useNarrowScreen();
  // Kept here (the chart stays mounted across refetches), so a filter change
  // doesn't fold the list back.
  const [showAll, setShowAll] = useState(false);
  const entries = allEntries.filter((e) => e.origin === 'hunt');
  const hiddenText = hiddenHunts > 0 && (
    <p className="rares-note">
      {formatInt(hiddenHunts)} hunt{hiddenHunts === 1 ? '' : 's'} sem raros visíveis fica{hiddenHunts === 1 ? '' : 'm'} de fora.
    </p>
  );
  if (entries.length === 0) {
    return (
      <>
        <div className="chart-empty-state">{emptyText ?? 'Nenhum raro visível por hunt no período.'}</div>
        {hiddenText}
      </>
    );
  }

  const rows = entries
    .map((e) => {
      const small = e.rareKills < MIN_RARES || e.durationSeconds < MIN_SECONDS;
      const sample = narrow ? raresText(e.rareKills) : `${raresText(e.rareKills)} em ${formatHours(e.durationSeconds)}`;
      return {
        ...e,
        key: `${e.origin}-${e.name}`,
        label: e.name,
        plot: e.rareKillsPerHour ?? 0,
        small,
        // A session with no duration has no rate: "—", like the table, not "0,0".
        valueLabel: `${formatRate(e.rareKillsPerHour)} · ${sample}`,
        color: ORIGIN_SERIES[e.origin].color,
      };
    })
    // Stable sort keeps the data's highest-rate-first order inside each group.
    .sort((a, b) => Number(a.small) - Number(b.small));

  // Chart only; the table view keeps every row.
  const collapsible = rows.length > INITIAL_ROWS;
  const shown = collapsible && !showAll ? rows.slice(0, INITIAL_ROWS) : rows;
  const scale = niceScale(Math.max(0, ...shown.map((r) => r.plot)));
  const hasSmall = shown.some((r) => r.small && r.plot > 0);
  // The value label sits right of the bar; reserve room for the longest one.
  const rightMargin = Math.min(190, Math.ceil(Math.max(...shown.map((r) => approxTextWidth(r.valueLabel)))) + 12);

  const table = {
    columns: ['Nome', 'Raros/h', 'Raros', 'Sessões', 'Horas', 'Amostra'],
    numericColumns: [1, 2, 3, 4],
    rows: rows.map((r) => ({
      key: r.key,
      cells: [
        r.name,
        formatRate(r.rareKillsPerHour),
        formatInt(r.rareKills),
        formatInt(r.sessions),
        formatHours(r.durationSeconds),
        r.small ? 'Pequena' : 'OK',
      ],
    })),
  };

  return (
    <ChartFrame caption="Raros/h por hunt - só os raros mostrados aqui, sem Shiny T2/T3" table={table}>
      <ResponsiveContainer width="100%" height={Math.max(140, shown.length * ROW_HEIGHT + 36)}>
        <BarChart data={shown} layout="vertical" accessibilityLayer margin={{ top: 8, right: rightMargin, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--gridline)" horizontal={false} />
          <XAxis
            type="number"
            dataKey="plot"
            domain={scale.domain}
            ticks={scale.ticks}
            tickFormatter={(v: number) => formatRate(v)}
            stroke="var(--baseline)"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            stroke="var(--baseline)"
            tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
            tickLine={false}
            width={narrow ? 110 : 150}
            interval={0}
          />
          <Tooltip
            cursor={{ fill: 'var(--gridline)', opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const row = payload[0].payload as (typeof rows)[number];
              return (
                <div style={tooltipBoxStyle}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{formatRate(row.rareKillsPerHour)} raros/h</div>
                  <div style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: row.color, display: 'inline-block' }} />
                    {row.name}
                  </div>
                  <div style={{ color: 'var(--text-muted)' }}>
                    {raresText(row.rareKills)} em {formatHours(row.durationSeconds)} · {formatInt(row.sessions)} hunt
                    {row.sessions === 1 ? '' : 's'}
                  </div>
                  {row.small && <div style={{ color: 'var(--text-muted)' }}>Amostra pequena: taxa pouco confiável</div>}
                </div>
              );
            }}
          />
          <Bar dataKey="plot" name="Raros/h" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
            {shown.map((r) => (
              <Cell key={r.key} fill={r.color} fillOpacity={r.small ? 0.4 : 1} />
            ))}
            <LabelList
              dataKey="valueLabel"
              // Drawn by hand: the default label wraps to the bar's width, which
              // breaks "3,6 · 11 raros em 3h04" over three lines on short bars.
              content={(props: any) => (
                <text
                  x={Number(props.x) + Number(props.width) + 6}
                  y={Number(props.y) + Number(props.height) / 2}
                  dy="0.35em"
                  fill="var(--text-secondary)"
                  fontSize={12}
                  fontWeight={600}
                >
                  {props.value}
                </text>
              )}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {collapsible && (
        <div className="rares-entry-more">
          {!showAll && (
            <span className="rares-note" style={{ margin: 0 }}>
              Mostrando <span className="num">{INITIAL_ROWS}</span> de <span className="num">{formatInt(rows.length)}</span>
            </span>
          )}
          <button type="button" className="secondary" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
            {showAll ? (
              <>
                Mostrar só as <span className="num">{INITIAL_ROWS}</span> primeiras
              </>
            ) : (
              <>
                Mostrar todas (<span className="num">{formatInt(rows.length)}</span>)
              </>
            )}
          </button>
        </div>
      )}
      {hasSmall && (
        <p className="rares-note">
          Barras claras: amostra pequena (menos de {MIN_RARES} raros ou de 1h de jogo) - taxa pouco confiável, listada depois
          das demais.
        </p>
      )}
      <p className="rares-note">
        Conta só os raros mostrados nesta página: os Shiny de Tier 2/3 ou fora da roleta são complemento da hunt e ficam de
        fora, assim como os raros não identificados (não dá para classificá-los). Os filtros de tier e elemento valem aqui
        também.
      </p>
      {hiddenText}
    </ChartFrame>
  );
}
