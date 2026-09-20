export interface HuntFilterQuery {
  player?: string;
  from?: string;
  to?: string;
  sessionType?: string;
}

export function buildHuntFilter(query: HuntFilterQuery) {
  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (query.player) {
    conditions.push('h.id IN (SELECT hunt_id FROM hunt_players WHERE player_id = @player)');
    params.player = Number(query.player);
  }
  if (query.from) {
    // Compare by calendar date, not raw string, so a "from"/"to" of just a
    // date (no time) still includes hunts that happened later that same day
    // - a plain string comparison would otherwise exclude them, since
    // "2026-09-19 18:30:00" sorts after "2026-09-19".
    conditions.push('date(h.start_time) >= date(@from)');
    params.from = query.from;
  }
  if (query.to) {
    conditions.push('date(h.start_time) <= date(@to)');
    params.to = query.to;
  }
  if (query.sessionType) {
    conditions.push('h.session_type = @sessionType');
    params.sessionType = query.sessionType;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params };
}
