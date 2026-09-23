import { formatPercent } from '../format';

interface StatTileProps {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  deltaGoodDirection?: 'up' | 'down';
  onClick?: () => void;
}

export function StatTile({ label, value, sub, delta, deltaGoodDirection = 'up', onClick }: StatTileProps) {
  const hasDelta = delta !== undefined && delta !== null;
  const isUp = hasDelta && delta! > 0;
  const isGood = hasDelta && (deltaGoodDirection === 'up' ? isUp : !isUp);

  return (
    <div
      className={onClick ? 'stat-tile clickable' : 'stat-tile'}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {sub && <span className="sub">{sub}</span>}
      {hasDelta && (
        <span className={`delta ${isGood ? 'up' : 'down'}`}>{formatPercent(delta)}</span>
      )}
    </div>
  );
}
