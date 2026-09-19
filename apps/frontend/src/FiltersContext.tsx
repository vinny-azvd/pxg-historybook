import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Player } from './api/types';
import { api } from './api/client';

interface FiltersState {
  player: string;
  sessionType: string;
  players: Player[];
  setPlayer: (id: string) => void;
  setSessionType: (type: string) => void;
  refreshPlayers: () => void;
}

const FiltersContext = createContext<FiltersState | null>(null);

const STORAGE_KEY = 'pxg-hunts:selected-player';

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [player, setPlayerState] = useState<string>(() => localStorage.getItem(STORAGE_KEY) ?? '');
  const [sessionType, setSessionType] = useState<string>('');
  const [players, setPlayers] = useState<Player[]>([]);

  const refreshPlayers = () => {
    api.getPlayers().then(setPlayers).catch(() => setPlayers([]));
  };

  useEffect(() => {
    refreshPlayers();
  }, []);

  const setPlayer = (id: string) => {
    setPlayerState(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage errors (private mode, etc.)
    }
  };

  const value = useMemo(
    () => ({ player, sessionType, players, setPlayer, setSessionType, refreshPlayers }),
    [player, sessionType, players]
  );

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error('useFilters must be used within FiltersProvider');
  return ctx;
}
