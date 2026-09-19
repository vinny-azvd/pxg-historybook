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
    conditions.push('h.start_time >= @from');
    params.from = query.from;
  }
  if (query.to) {
    conditions.push('h.start_time <= @to');
    params.to = query.to;
  }
  if (query.sessionType) {
    conditions.push('h.session_type = @sessionType');
    params.sessionType = query.sessionType;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params };
}
