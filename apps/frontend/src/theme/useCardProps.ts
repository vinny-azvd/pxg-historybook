import { usePointerGlow } from './usePointerGlow';

/**
 * Props shared by the clickable .hunt-card of Hunts, MD and Terror: a click
 * toggles the in-place details (a mouse convenience; keyboard and screen
 * reader users get the <CardToggle> disclosure button inside the card, so
 * the div itself is NOT a tab stop) and the card tracks the pointer through
 * --mx/--my (see usePointerGlow).
 */
export function useCardProps(toggle: () => void) {
  const glow = usePointerGlow<HTMLDivElement>();
  return {
    ...glow,
    onClick: toggle,
  };
}
