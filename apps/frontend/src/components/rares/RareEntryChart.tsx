import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { RareEntryRow, RareOrigin } from '../../api/types';
import { formatHours, formatInt, formatRate } from '../../format';
import { ChartFrame, niceScale, tooltipBoxStyle } from '../charts/chartKit';
import { ORIGIN_LABEL, ORIGIN_SERIES, approxTextWidth, useNarrowScreen } from './rareUtils';

const ROW_HEIGHT = 34;

// Same bar as the "1 raro a cada X" KPI: below 3 rares, or under an hour of
// play, a rate is mostly luck (1 rare in a 7-minute MD reads 8,8/h).
const MIN_RARES = 3;
const MIN_SECONDS = 3600;

interface RareEntryChartProps {
  entries: RareEntryRow[];
  /** With both origins on screen, MD rows say so - "Mamoswine" can be a hunt
   * spot and an MD at the same time. */
  showOrigin: boolean;
}

const raresText = (n: number) => `${formatInt(n)} raro${n === 1 ? '' : 's'}`;

// Raros/h per hunt spot / MD (total rares ÷ total hours, not an average of
// per-session rates). The rate alone hides how much play is behind it, so
// each bar is labelled with its sample too, and small samples are faded and
// ranked after the reliable ones instead of leading the chart on one lucky
// run. Bars are colored by origin (same blue/orange as the timeline): the
// rate is the data here, and the spot's Pokémon type would be a second
// meaning for color that the chart doesn't need.
export function RareEntryChart({ entries, showOrigin }: RareEntryChartProps) {
  const narrow = useNarrowScreen();
  if (entries.length === 0) return <div className="chart-empty-state">Sem sessões no período.</div>;

  const rows = entries
    .map((e) => {
      const small = e.rareKills < MIN_RARES || e.durationSeconds < MIN_SECONDS;
      const sample = narrow ? raresText(e.rareKills) : `${raresText(e.rareKills)} em ${formatHours(e.durationSeconds)}`;
      return {
        ...e,
        key: `${e.origin}-${e.name}`,
        label: showOrigin && e.origin === 'md' ? `${e.name} (MD)` : e.name,
        plot: e.rareKillsPerHour ?? 0,
        small,
        // A session with no duration has no rate: "—", like the table, not "0,0".
        valueLabel: `${formatRate(e.rareKillsPerHour)} · ${sample}`,
        color: ORIGIN_SERIES[e.origin].color,
      };
    })
    // Stable sort keeps the data's highest-rate-first order inside each group.
    .sort((a, b) => Number(a.small) - Number(b.small));

  const scale = niceScale(Math.max(0, ...rows.map((r) => r.plot)));
  const visibleOrigins = (['hunt', 'md'] as RareOrigin[]).filter((o) => rows.some((r) => r.origin === o && r.plot > 0));
  const hasSmall = rows.some((r) => r.small && r.plot > 0);
  // The value label sits right of the bar; reserve room for the longest one.
  const rightMargin = Math.min(190, Math.ceil(Math.max(...rows.map((r) => approxTextWidth(r.valueLabel)))) + 12);

  const table = {
    columns: ['Nome', 'Origem', 'Raros/h', 'Raros', 'Sessões', 'Horas', 'Amostra'],
    numericColumns: [2, 3, 4, 5],
    rows: rows.map((r) => ({
      key: r.key,
      cells: [
        r.name,
        ORIGIN_LABEL[r.origin],
        formatRate(r.rareKillsPerHour),
        formatInt(r.rareKills),
        formatInt(r.sessions),
        formatHours(r.durationSeconds),
        r.small ? 'Pequena' : 'OK',
      ],
    })),
  };

  return (
    <ChartFrame caption="Raros/h por hunt" table={table}>
      <ResponsiveContainer width="100%" height={Math.max(140, rows.length * ROW_HEIGHT + 36)}>
        <BarChart data={rows} layout="vertical" accessibilityLayer margin={{ top: 8, right: rightMargin, left: 0, bottom: 0 }}>
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
                    {row.name} · {ORIGIN_LABEL[row.origin]}
                  </div>
                  <div style={{ color: 'var(--text-muted)' }}>
                    {raresText(row.rareKills)} em {formatHours(row.durationSeconds)} · {formatInt(row.sessions)}{' '}
                    {row.origin === 'md' ? 'MD' : 'hunt'}
                    {row.sessions === 1 ? '' : 's'}
                  </div>
                  {row.small && <div style={{ color: 'var(--text-muted)' }}>Amostra pequena: taxa pouco confiável</div>}
                </div>
              );
            }}
          />
          <Bar dataKey="plot" name="Raros/h" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
            {rows.map((r) => (
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
      {showOrigin && visibleOrigins.length > 1 && (
        <div className="chart-marker-legend" aria-label="Legenda">
          {visibleOrigins.map((origin) => (
            <span key={origin}>
              <span aria-hidden="true" className="legend-swatch" style={{ background: ORIGIN_SERIES[origin].color, marginRight: 0 }} />
              {ORIGIN_SERIES[origin].label}
            </span>
          ))}
        </div>
      )}
      {hasSmall && (
        <p className="rares-note">
          Barras claras: amostra pequena (menos de {MIN_RARES} raros ou de 1h de jogo) - taxa pouco confiável, listada depois
          das demais.
        </p>
      )}
    </ChartFrame>
  );
}
