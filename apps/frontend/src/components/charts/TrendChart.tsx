import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrendPoint } from '../../api/types';
import { fillBucketStarts, isPartialBucket } from '../../dates';
import { formatBucketLabel, formatCompact, formatFull, formatInt } from '../../format';
import { getRareDrops } from '../HuntBadges';
import { TooltipNames } from './TooltipNames';
import {
  ChartFrame,
  ChartMarker,
  MarkerLegend,
  axisTickLabel,
  niceScale,
  useAxisTicks,
  tooltipBoxStyle,
  tooltipHintStyle,
  useChartZoom,
  ZOOM_HINT,
  ZOOM_HINT_SINGLE,
  ZoomCaption,
  type MarkerKind,
} from './chartKit';

type Bucket = 'day' | 'week' | 'month' | 'hunt' | 'terror' | 'md';

interface TrendChartProps {
  data: TrendPoint[];
  metricKey: keyof TrendPoint;
  seriesLabel: string;
  seriesColor: string;
  bucket?: Bucket;
  formatValue?: (value: number) => string;
  /** Click (tap) on a day/week/month point: zoom into that period. */
  onZoom?: (bucketStart: string) => void;
  /** Mouse drag across several points: zoom into the selected span. */
  onZoomSpan?: (first: string, last: string) => void;
  rareDropThreshold?: number;
  unitLabel?: string;
  /** The period being browsed, so days/weeks/months without hunts still get
   * a slot on the x axis (the line breaks there instead of bridging it). */
  range?: { from?: string; to?: string };
}

// Row shape after gap-filling: an empty slot carries no metric value.
type Row = TrendPoint & { empty?: boolean };

function markerKind(row: Row | undefined, rareDropThreshold: number): MarkerKind {
  if (!row || row.empty) return 'plain';
  if (row.topDrops && getRareDrops(row.topDrops, rareDropThreshold).length > 0) return 'rare';
  if (row.jadeSevere) return 'jadeSevere';
  if ((row.jadeTotemCount ?? 0) > 0) return 'jade';
  return 'plain';
}

const isEntry = (bucket: Bucket) => bucket === 'hunt' || bucket === 'terror' || bucket === 'md';

export function TrendChart(props: TrendChartProps) {
  if (props.data.length === 0) {
    return <div className="chart-empty-state">Sem registros para o período selecionado.</div>;
  }
  return <TrendChartPlot {...props} />;
}

function TrendChartPlot({
  data,
  metricKey,
  seriesLabel,
  seriesColor,
  bucket = 'week',
  formatValue = formatCompact,
  onZoom: onZoomProp,
  onZoomSpan: onZoomSpanProp,
  rareDropThreshold = 1_000_000,
  unitLabel = 'hunt',
  range,
}: TrendChartProps) {
  const isEntryBucket = isEntry(bucket);
  // Nothing is finer than one hunt/MD/terror, so those points do not zoom.
  const onZoom = isEntryBucket ? undefined : onZoomProp;
  const onZoomSpan = isEntryBucket ? undefined : onZoomSpanProp;
  const rows: Row[] = isEntryBucket
    ? data
    : fillBucketStarts(data.map((p) => p.bucketStart), bucket as 'day' | 'week' | 'month', range).map(
        (bucketStart) =>
          data.find((p) => p.bucketStart === bucketStart) ??
          ({ bucketStart, huntCount: 0, empty: true } as unknown as Row)
      );

  const zoom = useChartZoom({
    labels: rows.map((r) => r.bucketStart),
    onZoom,
    onZoomSpan,
    isEmpty: (label) => Boolean(rows.find((r) => r.bucketStart === label)?.empty),
  });

  const axis = useAxisTicks(rows.map((r) => r.bucketStart), bucket);
  const values = rows.map((r) => r[metricKey]).filter((v): v is number => typeof v === 'number');
  const scale = niceScale(Math.max(0, ...values));
  const kinds = new Set(rows.map((r) => markerKind(r, rareDropThreshold)));

  const table = {
    columns: ['Período', seriesLabel, isEntryBucket ? 'Hunt' : `${unitLabel[0].toUpperCase()}${unitLabel.slice(1)}s`, 'Destaques'],
    numericColumns: isEntryBucket ? [1] : [1, 2],
    rows: rows.map((r) => {
      const value = r[metricKey] as number | null | undefined;
      const drops = getRareDrops(r.topDrops ?? [], rareDropThreshold).map((d) => `💎 ${d.item}`);
      const jade = (r.jadeTotemCount ?? 0) > 0 ? [`Jade × ${r.jadeTotemCount}`] : [];
      return {
        key: r.bucketStart,
        label: formatBucketLabel(r.bucketStart, bucket),
        onExpand: onZoom && !r.empty ? () => onZoom(r.bucketStart) : undefined,
        cells: [
          formatBucketLabel(r.bucketStart, bucket),
          typeof value === 'number' ? formatValue(value) : '—',
          isEntryBucket ? r.huntName ?? '—' : formatInt(r.huntCount ?? 0),
          [...drops, ...jade].join(' · ') || '—',
        ],
      };
    }),
  };

  return (
    <ChartFrame caption={seriesLabel} table={table}>
      <div {...zoom.areaProps}>
        <ResponsiveContainer width="100%" height={280} onResize={axis.onResize}>
          <LineChart
            data={rows}
            accessibilityLayer
            aria-label={`Gráfico de linhas: ${seriesLabel}. Para expandir um período pelo teclado, use Ver tabela.`}
            margin={{ top: 12, right: 16, left: 0, bottom: 0 }}
            {...zoom.chartProps}
          >
            <CartesianGrid stroke="var(--gridline)" vertical={false} />
            <XAxis
              dataKey="bucketStart"
              tickFormatter={(v) => axisTickLabel(v, bucket)}
              stroke="var(--baseline)"
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              tickLine={false}
              {...axis.xAxis}
            />
            <YAxis
              domain={scale.domain}
              ticks={scale.ticks}
              tickFormatter={(v) => formatValue(v)}
              stroke="var(--baseline)"
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null;
                const row = payload[0].payload as Row;
                const value = row[metricKey] as number | null | undefined;
                const partial = !isEntryBucket && isPartialBucket(String(label), bucket as 'day' | 'week' | 'month');
                return (
                  <div style={tooltipBoxStyle}>
                    <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>
                      {bucket === 'week' ? 'Semana de ' : ''}
                      {isEntryBucket && row.huntName ? `${row.huntName} · ` : ''}
                      {formatBucketLabel(String(label), bucket)}
                      {partial && ' (parcial)'}
                    </div>
                    {row.empty ? (
                      <div style={{ color: 'var(--text-muted)' }}>Sem hunts neste período</div>
                    ) : (
                      <>
                        <div>
                          {seriesLabel}:{' '}
                          <strong title={typeof value === 'number' ? formatFull(value) : undefined}>
                            {typeof value === 'number' ? formatValue(value) : '—'}
                          </strong>
                        </div>
                        {!isEntryBucket && (
                          <div style={{ color: 'var(--text-muted)' }}>
                            {row.huntCount} {unitLabel}
                            {row.huntCount === 1 ? '' : 's'}
                          </div>
                        )}
                        {!isEntryBucket && <TooltipNames names={row.names} />}
                        {isEntryBucket && (row.jadeTotemCount ?? 0) > 0 && (
                          // --jade/--jade-soft are tuned as chart-marker fills, not
                          // text-on-surface colors (the soft variant fails WCAG
                          // contrast as text - ~1.7:1 in light theme). Severity is
                          // shown by weight instead, using the badge-safe token.
                          <div style={{ color: 'var(--jade-badge-text)', fontWeight: row.jadeSevere ? 700 : 400 }}>
                            🟢 Jade Totem × {row.jadeTotemCount}
                          </div>
                        )}
                        {getRareDrops(row.topDrops ?? [], rareDropThreshold).map((drop) => (
                          <div key={drop.item} style={{ color: 'var(--rare-drop-badge-text)' }}>
                            💎 {drop.item} ({formatCompact(drop.unitPrice)}/un.)
                          </div>
                        ))}
                        {onZoom && <div style={tooltipHintStyle}>{onZoomSpan ? ZOOM_HINT : ZOOM_HINT_SINGLE}</div>}
                      </>
                    )}
                  </div>
                );
              }}
            />
            {zoom.selection && (
              <ReferenceArea
                x1={zoom.selection.from}
                x2={zoom.selection.to}
                fill="var(--selection)"
                fillOpacity={0.16}
                stroke="var(--selection)"
                strokeOpacity={0.6}
                strokeDasharray="4 3"
                ifOverflow="visible"
              />
            )}
            <Line
              type="linear"
              dataKey={metricKey}
              name={seriesLabel}
              stroke={seriesColor}
              strokeWidth={2}
              dot={(props: any) => (
                <ChartMarker
                  key={props.key}
                  cx={props.value === null || props.value === undefined ? undefined : props.cx}
                  cy={props.cy}
                  kind={markerKind(props.payload, rareDropThreshold)}
                  color={seriesColor}
                />
              )}
              // The hover dot must not take the mousedown: it is replaced before the
              // mouseup, so a click right on a point would never reach the chart.
              activeDot={{ r: 6, stroke: 'var(--surface-1)', strokeWidth: 2, style: { pointerEvents: 'none' } }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <MarkerLegend kinds={kinds} />
      {onZoom && <ZoomCaption span={Boolean(onZoomSpan)} />}
    </ChartFrame>
  );
}
