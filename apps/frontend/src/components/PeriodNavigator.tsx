import { useFilters } from '../FiltersContext';
import { bucketStartForDate, periodRangeForDate, referenceDateFromRange, shiftPeriodDate, toISODate } from '../dates';
import { formatBucketLabel } from '../format';

interface PeriodNavigatorProps {
  bucket: 'day' | 'week' | 'month';
}

export function PeriodNavigator({ bucket }: PeriodNavigatorProps) {
  const { from, to, setDateRange } = useFilters();

  // Today when the period contains it (so the date field reads today after
  // "Hoje", not the last day of the week/month), otherwise the period's own date.
  const referenceDate = referenceDateFromRange(from, to);

  function go(direction: 1 | -1) {
    setDateRange(periodRangeForDate(shiftPeriodDate(referenceDate, bucket, direction), bucket));
  }

  function goToday() {
    setDateRange(periodRangeForDate(new Date(), bucket));
  }

  function pickDate(value: string) {
    if (!value) return;
    setDateRange(periodRangeForDate(new Date(`${value}T00:00:00`), bucket));
  }

  return (
    <div className="period-nav">
      <button className="secondary" onClick={() => go(-1)} aria-label="Período anterior" title="Período anterior">
        ‹
      </button>
      <span className="period-nav-label">{formatBucketLabel(bucketStartForDate(referenceDate, bucket), bucket)}</span>
      <button className="secondary" onClick={() => go(1)} aria-label="Próximo período" title="Próximo período">
        ›
      </button>
      <button className="secondary" onClick={goToday}>
        Hoje
      </button>
      <input
        type="date"
        aria-label="Selecionar data"
        title="Selecionar data"
        value={toISODate(referenceDate)}
        onChange={(e) => pickDate(e.target.value)}
      />
    </div>
  );
}
