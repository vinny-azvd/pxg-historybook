import type { ChartScope } from './useChartScope';

/** "Tudo › out/2026 › 05/10–11/10 › 07/10": where the chart is zoomed. Every
 * crumb but the last takes you back out to it. */
export function ScopeBreadcrumb({ scope }: { scope: Pick<ChartScope, 'crumbs' | 'goTo'> }) {
  const last = scope.crumbs.length - 1;
  // Not zoomed: the range label next to the arrows already says it all.
  if (last < 1) return null;
  return (
    <nav className="scope-crumbs" aria-label="Zoom do gráfico">
      <ol>
        {scope.crumbs.map((crumb, index) => (
          <li key={crumb.key}>
            {index < last ? (
              <>
                <button type="button" className="scope-crumb" onClick={() => scope.goTo(index)}>
                  {crumb.label}
                </button>
                <span className="scope-crumb-sep" aria-hidden="true">
                  ›
                </span>
              </>
            ) : (
              <span className="scope-crumb scope-crumb-current" aria-current="location">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
