import { Router } from 'express';
import {
  computeTerrorOverview,
  computeTerrorRareKills,
  computeTerrorTrends,
} from '../services/terrorStatsAggregation.js';

export const terrorStatsRouter = Router();

terrorStatsRouter.get('/overview', (req, res) => {
  const { player, from, to, sessionType } = req.query as Record<string, string>;
  res.json(computeTerrorOverview({ player, from, to, sessionType }));
});

terrorStatsRouter.get('/rare-kills', (req, res) => {
  const { player, from, to, sessionType } = req.query as Record<string, string>;
  res.json(computeTerrorRareKills({ player, from, to, sessionType }));
});

terrorStatsRouter.get('/trends', (req, res) => {
  const { player, from, to, sessionType, bucket = 'week' } = req.query as Record<string, string>;
  res.json(computeTerrorTrends({ player, from, to, sessionType }, bucket));
});
