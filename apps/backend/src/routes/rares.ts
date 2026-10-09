import { Router } from 'express';
import { computeRares } from '../services/raresAggregation.js';

export const raresRouter = Router();

// One summary for the whole "Raros" page (KPIs, ranking, timeline, table):
// they all share the same filtered sessions, so a single round trip keeps
// them from ever disagreeing mid-load.
raresRouter.get('/', (req, res) => {
  const { player, from, to, sessionType, origin, bucket = 'week' } = req.query as Record<string, string>;
  res.json(computeRares({ player, from, to, sessionType, origin, bucket }));
});
