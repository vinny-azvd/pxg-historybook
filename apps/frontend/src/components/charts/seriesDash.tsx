import { LineKey } from './chartKit';

/**
 * Per-series dash patterns.
 *
 * A skin may define --series-dash-1..8 (an SVG stroke-dasharray value) so that
 * the lines of different players differ by more than colour (the Game Boy
 * skin uses it: its chrome is all greens, and a shape cue survives colour
 * blindness and grayscale). Every token falls back to `none`, so a skin that
 * does not define them - Classic included - draws the same solid lines as
 * before. The legend swatch and the tooltip key mirror the pattern; they are
 * only shown when the skin turns --legend-dash-display on.
 */

const SLOTS = 8;

/** The --series-N slot a series color belongs to; custom (hex) colors the
 * user picked fall back to the series' position in the list. */
export function seriesSlot(color: string, index: number): number {
  const match = /^var\(--series-(\d)\)$/.exec(color.trim());
  const slot = match ? Number(match[1]) : (index % SLOTS) + 1;
  return slot >= 1 && slot <= SLOTS ? slot : (index % SLOTS) + 1;
}

/** CSS value for strokeDasharray (via `style`): the skin's dash token or none. */
export function seriesDash(color: string, index: number): string {
  return `var(--series-dash-${seriesSlot(color, index)}, none)`;
}

/** A short line sample drawn with the series' dash pattern. */
export function DashSwatch({ color, index, width = 30 }: { color: string; index: number; width?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={10}
      viewBox={`0 0 ${width} 10`}
      style={{ display: 'var(--legend-dash-display, none)', flexShrink: 0 }}
    >
      <line x1={0} y1={5} x2={width} y2={5} stroke={color} strokeWidth={3} style={{ strokeDasharray: seriesDash(color, index) }} />
    </svg>
  );
}

/** Tooltip key for a line series: the plain swatch, or the dashed sample in
 * skins that turn dash patterns on. */
export function SeriesKey({ color, index }: { color: string; index: number }) {
  return (
    <>
      <span style={{ display: 'var(--line-key-plain-display, contents)' }}>
        <LineKey color={color} />
      </span>
      <DashSwatch color={color} index={index} width={20} />
    </>
  );
}
