import type {
  CompareResponse,
  EnemyDefeatedLine,
  Filters,
  HuntDetail,
  HuntListResponse,
  MonthBucket,
  OverviewStats,
  Player,
  PlayerTrendPoint,
  RareKillRow,
  TrendPoint,
} from './types';

async function request<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

function toQuery(params: Record<string, any>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  getPlayers: () => request<Player[]>('/api/players'),

  getHunts: (filters: Filters & { sort?: string; order?: string; page?: number; pageSize?: number }) =>
    request<HuntListResponse>(`/api/hunts${toQuery(filters)}`),

  getHunt: (id: number) => request<HuntDetail>(`/api/hunts/${id}`),

  renameHunt: async (id: number, huntName: string) => {
    const res = await fetch(`/api/hunts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ huntName }),
    });
    if (!res.ok) throw new Error('Falha ao renomear a hunt');
    return res.json();
  },

  setNightmareCrystalSelections: async (id: number, fromNightmareCrystalIds: number[]) => {
    const res = await fetch(`/api/hunts/${id}/nightmare-crystal`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromNightmareCrystalIds }),
    });
    if (!res.ok) throw new Error('Falha ao salvar a seleção do Nightmare Crystal');
    return res.json() as Promise<{ enemiesDefeated: EnemyDefeatedLine[] }>;
  },

  deleteHunt: async (id: number) => {
    const res = await fetch(`/api/hunts/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) throw new Error('Falha ao remover hunt');
  },

  uploadHunt: async (payload: unknown) => {
    const res = await fetch('/api/hunts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  },

  getOverview: (filters: Filters) => request<OverviewStats>(`/api/stats/overview${toQuery(filters)}`),

  getRareKills: (filters: Filters) => request<RareKillRow[]>(`/api/stats/rare-kills${toQuery(filters)}`),

  getMonths: (filters: { player?: string; sessionType?: string }) =>
    request<MonthBucket[]>(`/api/stats/months${toQuery(filters)}`),

  getTrends: (filters: Filters & { bucket: string }) =>
    request<TrendPoint[]>(`/api/stats/trends${toQuery(filters)}`),

  getTrendsByPlayer: (filters: Filters & { bucket: string }) =>
    request<PlayerTrendPoint[]>(`/api/stats/trends-by-player${toQuery(filters)}`),

  getCompare: (params: {
    player?: string;
    sessionType?: string;
    periodA: { from: string; to: string };
    periodB: { from: string; to: string };
  }) => {
    const search = new URLSearchParams();
    if (params.player) search.set('player', params.player);
    if (params.sessionType) search.set('sessionType', params.sessionType);
    search.set('periodA[from]', params.periodA.from);
    search.set('periodA[to]', params.periodA.to);
    search.set('periodB[from]', params.periodB.from);
    search.set('periodB[to]', params.periodB.to);
    return request<CompareResponse>(`/api/stats/compare?${search.toString()}`);
  },

  getUnmatchedItems: () => request<{ item: string; itemNormalized: string; occurrences: number }[]>(
    '/api/items/unmatched'
  ),
};
