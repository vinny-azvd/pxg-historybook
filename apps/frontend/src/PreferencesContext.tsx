import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export interface VisibleFields {
  experience: boolean;
  damageDealt: boolean;
  damageTaken: boolean;
}

interface CardPreferences {
  rareDropThreshold: number;
  visibleFields: VisibleFields;
  playerColors: Record<string, string>;
}

interface PreferencesState extends CardPreferences {
  setRareDropThreshold: (value: number) => void;
  setVisibleField: (field: keyof VisibleFields, value: boolean) => void;
  setPlayerColor: (playerId: string, color: string) => void;
  getPlayerColor: (playerId: string, fallbackIndex: number) => string;
}

const STORAGE_KEY = 'pxg-hunts:card-preferences';

// A concrete, fixed hex palette (not the --series-N CSS vars) so a per-player
// default color is always a valid value to hand to a native <input
// type="color"> picker - CSS custom properties aren't valid color-input values.
export const DEFAULT_PLAYER_PALETTE = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
  '#e34948',
];

const DEFAULT_PREFERENCES: CardPreferences = {
  rareDropThreshold: 1_000_000,
  visibleFields: { experience: false, damageDealt: false, damageTaken: false },
  playerColors: {},
};

function loadPreferences(): CardPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      rareDropThreshold: typeof parsed.rareDropThreshold === 'number' ? parsed.rareDropThreshold : DEFAULT_PREFERENCES.rareDropThreshold,
      visibleFields: { ...DEFAULT_PREFERENCES.visibleFields, ...parsed.visibleFields },
      playerColors: typeof parsed.playerColors === 'object' && parsed.playerColors !== null ? parsed.playerColors : {},
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function savePreferences(prefs: CardPreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage errors (private mode, etc.)
  }
}

const PreferencesContext = createContext<PreferencesState | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<CardPreferences>(() => loadPreferences());

  const setRareDropThreshold = (value: number) => {
    setPrefs((prev) => {
      const next = { ...prev, rareDropThreshold: value };
      savePreferences(next);
      return next;
    });
  };

  const setVisibleField = (field: keyof VisibleFields, value: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, visibleFields: { ...prev.visibleFields, [field]: value } };
      savePreferences(next);
      return next;
    });
  };

  const setPlayerColor = (playerId: string, color: string) => {
    setPrefs((prev) => {
      const next = { ...prev, playerColors: { ...prev.playerColors, [playerId]: color } };
      savePreferences(next);
      return next;
    });
  };

  const getPlayerColor = (playerId: string, fallbackIndex: number) =>
    prefs.playerColors[playerId] ?? DEFAULT_PLAYER_PALETTE[fallbackIndex % DEFAULT_PLAYER_PALETTE.length];

  const value = useMemo(
    () => ({ ...prefs, setRareDropThreshold, setVisibleField, setPlayerColor, getPlayerColor }),
    [prefs]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
