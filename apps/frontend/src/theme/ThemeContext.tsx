import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { applySkin, readStoredSkin, storeSkin, SKINS, type Skin, type SkinInfo } from './skins';

interface ThemeState {
  skin: Skin;
  setSkin: (skin: Skin) => void;
  skins: readonly SkinInfo[];
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [skin, setSkinState] = useState<Skin>(() => readStoredSkin());

  // Layout effect: the attributes are in place before the first paint (main.tsx
  // has usually applied them already; this keeps them right if it didn't).
  useLayoutEffect(() => {
    applySkin(skin);
  }, [skin]);

  const setSkin = useCallback((next: Skin) => {
    storeSkin(next);
    setSkinState(next);
  }, []);

  const value = useMemo<ThemeState>(() => ({ skin, setSkin, skins: SKINS }), [skin, setSkin]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useSkin(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useSkin must be used inside <ThemeProvider>');
  return ctx;
}
