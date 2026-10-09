import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useSkin } from './ThemeContext';
import type { Skin } from './skins';

function PaletteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 3a9 9 0 0 0 0 18c1.1 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3.5 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"
      />
    </svg>
  );
}

/** Palette button in the header; opens a listbox with the 4 skins. */
export function ThemePicker() {
  const { skin, setSkin, skins } = useSkin();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const listId = useId();
  const labelId = useId();

  function focusOption(index: number) {
    const n = skins.length;
    optionRefs.current[((index % n) + n) % n]?.focus();
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function choose(id: Skin) {
    setSkin(id);
    close(true);
  }

  // Focus the selected option when the list opens.
  useEffect(() => {
    if (!open) return;
    const current = Math.max(
      0,
      skins.findIndex((s) => s.id === skin)
    );
    focusOption(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Outside pointer press closes (no focus steal: the user is going elsewhere).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function onButtonKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onListKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    const index = optionRefs.current.findIndex((el) => el === document.activeElement);
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault();
        focusOption(index + 1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        focusOption(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusOption(0);
        break;
      case 'End':
        e.preventDefault();
        focusOption(skins.length - 1);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case 'Tab':
        // Focus is leaving the popover: close it and let the browser move on.
        setOpen(false);
        break;
    }
  }

  return (
    <div className="theme-picker" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="theme-picker-button secondary"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label="Escolher tema visual"
        title="Tema visual"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onButtonKeyDown}
      >
        <PaletteIcon />
      </button>
      {open && (
        <div className="theme-picker-popover">
          <p className="theme-picker-title" id={labelId}>
            Tema visual
          </p>
          <ul id={listId} className="theme-picker-list" role="listbox" aria-labelledby={labelId} onKeyDown={onListKeyDown}>
            {skins.map((s, i) => (
              <li
                key={s.id}
                ref={(el) => {
                  optionRefs.current[i] = el;
                }}
                role="option"
                tabIndex={-1}
                aria-selected={s.id === skin}
                className="theme-option"
                data-skin-option={s.id}
                onClick={() => choose(s.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    choose(s.id);
                  }
                }}
              >
                <span className="skin-preview" data-preview={s.id} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="theme-option-text">
                  <span className="theme-option-label">{s.label}</span>
                  <span className="theme-option-desc">{s.description}</span>
                </span>
                {s.id === skin && (
                  <span className="theme-option-check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
