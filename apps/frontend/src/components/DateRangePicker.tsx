interface DateRangePickerProps {
  label: string;
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
}

export function DateRangePicker({ label, from, to, onChange }: DateRangePickerProps) {
  return (
    <div>
      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="date" value={from} onChange={(e) => onChange({ from: e.target.value, to })} />
        <span style={{ color: 'var(--text-muted)' }}>até</span>
        <input type="date" value={to} onChange={(e) => onChange({ from, to: e.target.value })} />
      </div>
    </div>
  );
}
