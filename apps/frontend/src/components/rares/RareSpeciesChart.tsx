import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { RareSpeciesRow } from '../../api/types';
import { formatDateTime, formatInt, formatRelativeDate } from '../../format';
import { pokeballFallback, pokemonSprite, pokemonTypes, typeColor, typeLabel, variantBadges } from '../../pokemon';
import { ChartFrame, tooltipBoxStyle } from '../charts/chartKit';
import { ORIGIN_LABEL, UNIDENTIFIED_LABEL, UNIDENTIFIED_SHORT, approxTextWidth, countScale, useNarrowScreen } from './rareUtils';
import { baseName } from './RareSprite';

const ROW_HEIGHT = 38;
const SPRITE = 30;
const UNIDENTIFIED_KEY = '__unidentified__';

interface Row {
  key: string;
  label: string; // name without the variant prefixes the badges carry
  enemy: string | null; // null for the unidentified bucket
  count: number;
  nightmareCrystalCount: number;
  type: string | null;
  color: string;
  variantBadges: string[];
  badges: string[]; // variant badges + "NC"
  source: RareSpeciesRow | null;
}

// Rough glyph widths for the 12px/10px system sans used on the axis: the tick
// is SVG, which can't wrap or measure text before drawing, so what's drawn is
// picked by this estimate (everything stays in the tooltip and the table).
const badgeWidth = (text: string) => approxTextWidth(text, 10) + 10;

/** What the axis label shows in `room` px, best first: short name + every
 * badge, short name + variant badges (NC dropped), or the full exported name
 * ("Golden Sudowoodo") with no badges - never the short name alone, which
 * would turn a Golden Sudowoodo into a plain "Sudowoodo". */
function fitLabel(row: Row, room: number): { text: string; badges: string[] } {
  const fits = (text: string, badges: string[]) =>
    approxTextWidth(text) + badges.reduce((sum, b) => sum + 6 + badgeWidth(b), 0) <= room;
  if (fits(row.label, row.badges)) return { text: row.label, badges: row.badges };
  if (row.variantBadges.length > 0 && fits(row.label, row.variantBadges)) return { text: row.label, badges: row.variantBadges };
  const full = row.enemy ?? row.label;
  if (approxTextWidth(full) <= room) return { text: full, badges: [] };
  const chars = Math.max(4, Math.floor(room / approxTextWidth('x')) - 1);
  return { text: `${full.slice(0, chars)}…`, badges: [] };
}

function SpeciesTick(props: {
  x?: number;
  y?: number;
  payload?: { value: string };
  rows: Map<string, Row>;
  width: number;
  showSprite: boolean;
}) {
  const { x = 0, y = 0, payload, rows, width, showSprite } = props;
  const row = payload ? rows.get(payload.value) : undefined;
  const [failed, setFailed] = useState(false);
  if (!row) return <g />;
  // Recharts hands the tick its right edge (axis line minus tick margin);
  // starting at `x - width` would put the first glyph under the card edge.
  const left = x - width + 14;
  const drawSprite = showSprite && row.enemy !== null;
  const sprite = row.enemy ? pokemonSprite(row.enemy) : null;
  const textX = left + (drawSprite ? SPRITE + 6 : 0);
  const { text, badges } = fitLabel(row, x - 8 - textX);
  let badgeX = textX + approxTextWidth(text) + 6;
  return (
    <g>
      <title>{row.enemy ?? UNIDENTIFIED_LABEL}</title>
      {drawSprite && (
        <image
          href={failed || !sprite ? pokeballFallback() : sprite}
          x={left}
          y={y - SPRITE / 2}
          width={SPRITE}
          height={SPRITE}
          style={{ imageRendering: 'pixelated' }}
          aria-hidden="true"
          onError={() => setFailed(true)}
        />
      )}
      <text x={textX} y={y} dy="0.35em" fill="var(--text-secondary)" fontSize={12}>
        {text}
      </text>
      {badges.map((badge) => {
          const w = badgeWidth(badge);
          const bx = badgeX;
          badgeX += w + 4;
          const isNc = badge === 'NC';
          return (
            <g key={badge} aria-hidden="true">
              <rect
                x={bx}
                y={y - 8}
                width={w}
                height={16}
                rx={8}
                fill={isNc ? 'var(--jade-badge-bg)' : 'var(--rare-drop-badge-bg)'}
              />
              <text
                x={bx + w / 2}
                y={y}
                dy="0.35em"
                textAnchor="middle"
                fontSize={10}
                fontWeight={700}
                fill={isNc ? 'var(--jade-badge-text)' : 'var(--rare-drop-badge-text)'}
              >
                {badge}
              </text>
            </g>
          );
        })}
    </g>
  );
}

interface RareSpeciesChartProps {
  species: RareSpeciesRow[];
  unidentified: number;
  /** Party teammates' rares under a Treinador filter - see teammateRareKills. */
  teammates: number;
}

// One horizontal bar per exported rare name, most kills first. The axis shows
// who it is (sprite + name + badges) and the bar wears the species' first type
// color - always named in the legend and tooltip, never color alone. Rares the
// export counted without naming the enemy get their own neutral row instead of
// silently disappearing from the ranking.
export function RareSpeciesChart({ species, unidentified, teammates }: RareSpeciesChartProps) {
  const narrow = useNarrowScreen();
  const rows: Row[] = species.map((s) => {
    const type = pokemonTypes(s.enemy)[0] ?? null;
    const variants = variantBadges(s.enemy);
    return {
      key: s.enemy,
      label: baseName(s.enemy),
      enemy: s.enemy,
      count: s.count,
      nightmareCrystalCount: s.nightmareCrystalCount,
      type,
      color: typeColor(type),
      variantBadges: variants,
      badges: [...variants, ...(s.nightmareCrystalCount > 0 ? ['NC'] : [])],
      source: s,
    };
  });
  if (unidentified > 0) {
    rows.push({
      key: UNIDENTIFIED_KEY,
      label: narrow ? UNIDENTIFIED_SHORT : UNIDENTIFIED_LABEL,
      enemy: null,
      count: unidentified,
      nightmareCrystalCount: 0,
      type: null,
      color: 'var(--type-unknown)',
      variantBadges: [],
      badges: [],
      source: null,
    });
    rows.sort((a, b) => b.count - a.count);
  }
  if (rows.length === 0) {
    return (
      <div className="chart-empty-state">
        {teammates > 0 ? 'Nenhum raro deste Treinador no período.' : 'Nenhum raro no período.'}
      </div>
    );
  }

  const byKey = new Map(rows.map((r) => [r.key, r]));
  const scale = countScale(Math.max(0, ...rows.map((r) => r.count)));
  // On a phone the sprite goes first (the name and badges carry the
  // identity) and the axis gives its width back to the bars.
  const axisWidth = narrow ? 140 : 260;
  const typesPresent = [...new Set(rows.filter((r) => r.enemy).map((r) => r.type))];

  const table = {
    columns: ['Espécie', 'Tipo', 'Selos', 'Raros', 'Via NC', 'Último', 'De onde'],
    numericColumns: [3, 4],
    rows: rows.map((r) => ({
      key: r.key,
      cells: [
        r.enemy ?? UNIDENTIFIED_LABEL,
        r.enemy ? typeLabel(r.type) : '—',
        r.badges.join(', ') || '—',
        formatInt(r.count),
        formatInt(r.nightmareCrystalCount),
        r.source ? formatDateTime(r.source.lastAt) : '—',
        r.source ? r.source.entryNames.map((e) => `${e.name} (${e.count})`).join(', ') : '—',
      ],
    })),
  };

  return (
    <ChartFrame caption="Raros por espécie" table={table}>
      <ResponsiveContainer width="100%" height={rows.length * ROW_HEIGHT + 36}>
        <BarChart data={rows} layout="vertical" accessibilityLayer margin={{ top: 8, right: 40, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--gridline)" horizontal={false} />
          <XAxis
            type="number"
            dataKey="count"
            domain={scale.domain}
            ticks={scale.ticks}
            tickFormatter={(v: number) => formatInt(v)}
            stroke="var(--baseline)"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="key"
            stroke="var(--baseline)"
            tickLine={false}
            width={axisWidth}
            interval={0}
            tick={<SpeciesTick rows={byKey} width={axisWidth} showSprite={!narrow} />}
          />
          <Tooltip
            cursor={{ fill: 'var(--gridline)', opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const row = payload[0].payload as Row;
              return (
                <div style={tooltipBoxStyle}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {formatInt(row.count)} raro{row.count === 1 ? '' : 's'}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: row.color, display: 'inline-block' }} />
                    {row.enemy ?? UNIDENTIFIED_LABEL}
                    {row.enemy && ` · ${typeLabel(row.type)}`}
                  </div>
                  {row.nightmareCrystalCount > 0 && (
                    <div style={{ color: 'var(--text-muted)' }}>{formatInt(row.nightmareCrystalCount)} via Nightmare Crystal</div>
                  )}
                  {row.source ? (
                    <>
                      <div style={{ color: 'var(--text-muted)' }}>
                        Último: {formatRelativeDate(row.source.lastAt)} ({formatDateTime(row.source.lastAt)})
                      </div>
                      <div style={{ color: 'var(--text-muted)' }}>
                        {row.source.entryNames
                          .slice(0, 3)
                          .map((e) => `${e.name} × ${e.count}`)
                          .join(' · ')}
                        {row.source.origins.length === 1 && ` (${ORIGIN_LABEL[row.source.origins[0]]})`}
                      </div>
                    </>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', maxWidth: 240 }}>
                      Contados pelo jogo sem o nome do inimigo no export.
                    </div>
                  )}
                </div>
              );
            }}
          />
          <Bar dataKey="count" name="Raros" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.key} fill={r.color} />
            ))}
            <LabelList
              dataKey="count"
              position="right"
              formatter={(v: number) => formatInt(v)}
              style={{ fill: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="chart-marker-legend" aria-label="Cores por tipo">
        {typesPresent.map((type) => (
          <span key={type ?? 'unknown'}>
            <span aria-hidden="true" className="legend-swatch" style={{ background: typeColor(type), marginRight: 0 }} />
            {typeLabel(type)}
          </span>
        ))}
        {unidentified > 0 && (
          <span>
            <span aria-hidden="true" className="legend-swatch" style={{ background: 'var(--type-unknown)', marginRight: 0 }} />
            {UNIDENTIFIED_SHORT}
          </span>
        )}
      </div>
      {unidentified > 0 && (
        <p className="rares-note">
          <strong>{UNIDENTIFIED_LABEL}:</strong> {formatInt(unidentified)} raro{unidentified === 1 ? '' : 's'} que o jogo
          contou na sessão sem dizer qual inimigo era.
        </p>
      )}
      {teammates > 0 && (
        <p className="rares-note">
          <strong>Outros treinadores:</strong> {formatInt(teammates)} raro{teammates === 1 ? '' : 's'} da party foram
          derrotados por colegas - entram no total, mas o ranking mostra só os deste Treinador.
        </p>
      )}
    </ChartFrame>
  );
}
