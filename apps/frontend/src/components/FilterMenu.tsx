import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface FilterSummaryItem {
  label: string;
  /** Wrap the label in span.num (tier codes): the skins' pixel font breaks digits. */
  num?: boolean;
}

interface FilterMenuSection {
  /** What is selected, in catalog order; empty = nothing active. */
  items: FilterSummaryItem[];
  /** The chips and this filter's explanatory notes, shown in the region below the row. */
  panel: ReactNode;
}

interface FilterMenuProps {
  /** Prefix for the ids tying each button to the region. */
  id: string;
  tier: FilterMenuSection;
  element: FilterMenuSection;
  onClear: () => void;
}

type Key = 'tier' | 'element';

// Most items a button lists before it falls back to "first +N".
const SHOWN = 2;

// Two closed filters ("Tier", "Elemento") that live in the same toolbar row as
// the Período chips: 26 chips are too much to keep on screen, but a filter
// coming from a deep link must not hide silently, so each button carries its
// own selection. Rendered as a fragment so the buttons are items of that row;
// the region is flex-basis 100% and so wraps to the line below it. Accordion:
// one region, showing whichever filter was opened. Open/closed is plain
// component state on purpose: every visit starts closed.
export function FilterMenu({ id, tier, element, onClear }: FilterMenuProps) {
  const [open, setOpen] = useState<Key | null>(null);
  const buttons = useRef<Record<Key, HTMLButtonElement | null>>({ tier: null, element: null });
  const regionId = `${id}-region`;
  const sections: { key: Key; name: string; section: FilterMenuSection }[] = [
    { key: 'tier', name: 'Tier', section: tier },
    { key: 'element', name: 'Elemento', section: element },
  ];
  const active = tier.items.length + element.items.length > 0;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || !open) return;
    e.stopPropagation();
    const back = buttons.current[open];
    setOpen(null);
    back?.focus();
  };

  return (
    <>
      <div className="chart-toolbar-group filter-menu-buttons" role="group" aria-label="Filtros de tier e elemento">
        {sections.map(({ key, name, section }) => {
          const { items } = section;
          const isOpen = open === key;
          // Two names fit; more fall back to the first plus a count (title has all).
          const shown = items.length <= SHOWN ? items : items.slice(0, 1);
          const plain = items.map((i) => i.label).join(', ');
          const render = (item: FilterSummaryItem) => (item.num ? <span className="num">{item.label}</span> : item.label);
          return (
            <button
              key={key}
              ref={(el) => {
                buttons.current[key] = el;
              }}
              type="button"
              id={`${id}-${key}-btn`}
              // The selected look is the chips' filled one plus the visible text
              // in the button, so colour is never the only cue.
              className={`filter-menu-btn${items.length > 0 ? '' : ' secondary'}`}
              aria-expanded={isOpen}
              aria-controls={regionId}
              title={items.length > 0 ? `${name}: ${plain}` : undefined}
              onClick={() => setOpen(isOpen ? null : key)}
            >
              <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
              <span className="filter-menu-text">
                {name}
                {items.length > 0 && (
                  <>
                    {': '}
                    {shown.map((item, i) => (
                      <span key={item.label}>
                        {i > 0 && ', '}
                        {render(item)}
                      </span>
                    ))}
                    {items.length > shown.length && (
                      <>
                        {' '}
                        +<span className="num">{items.length - shown.length}</span>
                      </>
                    )}
                  </>
                )}
              </span>
            </button>
          );
        })}
        {active && (
          <button type="button" className="secondary filter-menu-clear" onClick={onClear}>
            Limpar filtros
          </button>
        )}
      </div>
      <div
        id={regionId}
        role="group"
        aria-labelledby={open ? `${id}-${open}-btn` : undefined}
        hidden={!open}
        className="filter-menu-region"
        onKeyDown={onKeyDown}
      >
        {open === 'tier' && tier.panel}
        {open === 'element' && element.panel}
      </div>
    </>
  );
}
