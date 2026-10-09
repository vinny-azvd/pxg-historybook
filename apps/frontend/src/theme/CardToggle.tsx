interface CardToggleProps {
  expanded: boolean;
  /** id of the expanded region (only referenced while it exists). */
  controlsId: string;
  /** Name of the hunt / MD / Terror, for the accessible name. */
  label: string;
  onToggle: () => void;
}

/**
 * The keyboard / screen-reader face of a .hunt-card: a visually hidden
 * disclosure button that is the card's only own tab stop (the card div is not
 * focusable). Clicking the card with a mouse keeps working through
 * useCardProps; the focus ring is drawn around the whole card by the
 * `.hunt-card:has(> .card-toggle:focus-visible)` rules.
 */
export function CardToggle({ expanded, controlsId, label, onToggle }: CardToggleProps) {
  return (
    <button
      type="button"
      className="card-toggle"
      aria-expanded={expanded}
      aria-controls={expanded ? controlsId : undefined}
      onClick={(e) => {
        // The card's own onClick would toggle a second time.
        e.stopPropagation();
        onToggle();
      }}
    >
      {`Detalhes de ${label}`}
    </button>
  );
}
