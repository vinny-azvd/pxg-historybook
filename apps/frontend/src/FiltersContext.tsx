import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MonthBucket, Player } from './api/types';
import { api } from './api/client';

interface FiltersState {
  player: string;
  sessionType: string;
  players: Player[];
  from: string;
  to: string;
  months: MonthBucket[];
  setPlayer: (id: string) => void;
  setSessionType: (type: string) => void;
  setDateRange: (range: { from: string; to: string }) => void;
  refreshPlayers: () => void;
}

const FiltersContext = createContext<FiltersState | null>(null);

const STORAGE_KEY = 'pxg-hunts:selected-player';

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [player, setPlayerState] = useState<string>(() => localStorage.getItem(STORAGE_KEY) ?? '');
  const [sessionType, setSessionType] = useState<string>('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [months, setMonths] = useState<MonthBucket[]>([]);

  const refreshPlayers = () => {
    api.getPlayers().then(setPlayers).catch(() => setPlayers([]));
  };

  useEffect(() => {
    refreshPlayers();
  }, []);

  useEffect(() => {
    api
      .getMonths({ player, sessionType })
      .then(setMonths)
      .catch(() => setMonths([]));
  }, [player, sessionType]);

  const setPlayer = (id: string) => {
    setPlayerState(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage errors (private mode, etc.)
    }
  };

  const setDateRange = (range: { from: string; to: string }) => {
    setFrom(range.from);
    setTo(range.to);
  };

  const value = useMemo(
    () => ({
      player,
      sessionType,
      players,
      from,
      to,
      months,
      setPlayer,
      setSessionType,
      setDateRange,
      refreshPlayers,
    }),
    [player, sessionType, players, from, to, months]
  );

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error('useFilters must be used within FiltersProvider');
  return ctx;
}
