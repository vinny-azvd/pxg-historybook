import { useCallback, useEffect, useRef, type PointerEvent } from 'react';

/**
 * Pointer tracking for card skins: writes --mx / --my (0-100%, position of
 * the pointer inside the element) and --tx / --ty (the same, unitless -1..1) straight onto the element, so a skin can
 * build tilt and shine in pure CSS without a React re-render. rAF throttled;
 * the vars are removed on leave. Touch pointers are ignored (no hover there).
 * Spread onPointerMove/onPointerLeave on the card and attach `ref` to it.
 */
export function usePointerGlow<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const frame = useRef(0);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const onPointerMove = useCallback((e: PointerEvent<T>) => {
    if (e.pointerType === 'touch') return;
    last.current = { x: e.clientX, y: e.clientY };
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = ref.current;
      const p = last.current;
      if (!el || !p) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const mx = Math.min(100, Math.max(0, ((p.x - r.left) / r.width) * 100));
      const my = Math.min(100, Math.max(0, ((p.y - r.top) / r.height) * 100));
      el.style.setProperty('--mx', `${mx.toFixed(1)}%`);
      el.style.setProperty('--my', `${my.toFixed(1)}%`);
      // Same position as unitless -1..1 numbers, so a skin can feed rotate()/
      // translate() (a percentage cannot be turned into an angle in plain CSS).
      el.style.setProperty('--tx', ((mx - 50) / 50).toFixed(3));
      el.style.setProperty('--ty', ((my - 50) / 50).toFixed(3));
    });
  }, []);

  const onPointerLeave = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    last.current = null;
    const el = ref.current;
    if (el) {
      el.style.removeProperty('--mx');
      el.style.removeProperty('--my');
      el.style.removeProperty('--tx');
      el.style.removeProperty('--ty');
    }
  }, []);

  return { ref, onPointerMove, onPointerLeave };
}
