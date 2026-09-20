import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export interface VisibleFields {
  experience: boolean;
  damageDealt: boolean;
  damageTaken: boolean;
}

interface CardPreferences {
  rareDropThreshold: number;
  visibleFields: VisibleFields;
}

interface PreferencesState extends CardPreferences {
  setRareDropThreshold: (value: number) => void;
  setVisibleField: (field: keyof VisibleFields, value: boolean) => void;
}

const STORAGE_KEY = 'pxg-hunts:card-preferences';

const DEFAULT_PREFERENCES: CardPreferences = {
  rareDropThreshold: 1_000_000,
  visibleFields: { experience: false, damageDealt: false, damageTaken: false },
};

function loadPreferences(): CardPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      rareDropThreshold: typeof parsed.rareDropThreshold === 'number' ? parsed.rareDropThreshold : DEFAULT_PREFERENCES.rareDropThreshold,
      visibleFields: { ...DEFAULT_PREFERENCES.visibleFields, ...parsed.visibleFields },
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

  const value = useMemo(
    () => ({ ...prefs, setRareDropThreshold, setVisibleField }),
    [prefs]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
