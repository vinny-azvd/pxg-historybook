export interface TerrorFilterQuery {
  player?: string;
  from?: string;
  to?: string;
  sessionType?: string;
}

export function buildTerrorFilter(query: TerrorFilterQuery) {
  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (query.player) {
    conditions.push('t.id IN (SELECT terror_id FROM terror_players WHERE player_id = @player)');
    params.player = Number(query.player);
  }
  if (query.from) {
    conditions.push('date(t.start_time) >= date(@from)');
    params.from = query.from;
  }
  if (query.to) {
    conditions.push('date(t.start_time) <= date(@to)');
    params.to = query.to;
  }
  if (query.sessionType) {
    conditions.push('t.session_type = @sessionType');
    params.sessionType = query.sessionType;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params };
}
