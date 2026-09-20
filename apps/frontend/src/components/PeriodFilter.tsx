import { useEffect, useState } from 'react';
import { useFilters } from '../FiltersContext';
import { currentMonthKey, monthLabel, monthRange, previousMonthKey } from '../dates';

const CURRENT_MONTH = currentMonthKey();
const PREVIOUS_MONTH = previousMonthKey();

export function PeriodFilter() {
  const { from, to, months, setDateRange } = useFilters();
  const [customOpen, setCustomOpen] = useState(false);

  // A range can also arrive from outside this component (e.g. clicking a
  // point on a trend chart), so drop back to "no filter" display whenever
  // the shared range is cleared elsewhere instead of trusting local state.
  useEffect(() => {
    if (!from && !to) setCustomOpen(false);
  }, [from, to]);

  const matchedMonth =
    !from && !to
      ? null
      : [CURRENT_MONTH, PREVIOUS_MONTH, ...months.map((m) => m.month)].find((key) => {
          const range = monthRange(key);
          return range.from === from && range.to === to;
        }) ?? null;

  const showCustomInputs = customOpen || (!matchedMonth && Boolean(from || to));
  const selectValue = showCustomInputs ? 'custom' : matchedMonth ? `month:${matchedMonth}` : '';

  function handleSelect(value: string) {
    if (value === '') {
      setDateRange({ from: '', to: '' });
      setCustomOpen(false);
      return;
    }
    if (value === 'custom') {
      setCustomOpen(true);
      return;
    }
    if (value.startsWith('month:')) {
      setDateRange(monthRange(value.slice('month:'.length)));
      setCustomOpen(false);
    }
  }

  const otherMonths = months.filter((m) => m.month !== CURRENT_MONTH && m.month !== PREVIOUS_MONTH);

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <select value={selectValue} onChange={(e) => handleSelect(e.target.value)} aria-label="Filtrar por período">
        <option value="">Todo o período</option>
        <option value={`month:${CURRENT_MONTH}`}>Este mês</option>
        <option value={`month:${PREVIOUS_MONTH}`}>Mês passado</option>
        {otherMonths.length > 0 && (
          <optgroup label="Meses com hunts">
            {otherMonths.map((m) => (
              <option key={m.month} value={`month:${m.month}`}>
                {monthLabel(m.month)} ({m.huntCount})
              </option>
            ))}
          </optgroup>
        )}
        <option value="custom">Período personalizado…</option>
      </select>
      {showCustomInputs && (
        <>
          <input
            type="date"
            value={from}
            onChange={(e) => setDateRange({ from: e.target.value, to })}
            aria-label="Data inicial"
          />
          <span style={{ color: 'var(--text-muted)' }}>até</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setDateRange({ from, to: e.target.value })}
            aria-label="Data final"
          />
        </>
      )}
    </div>
  );
}
