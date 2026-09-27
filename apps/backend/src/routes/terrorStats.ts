import { Router } from 'express';
import {
  computeTerrorOverview,
  computeTerrorTrends,
  computeTerrorTrendsByPlayer,
  computeTerrorWeeklyGroups,
} from '../services/terrorStatsAggregation.js';

export const terrorStatsRouter = Router();

terrorStatsRouter.get('/overview', (req, res) => {
  const { player, from, to, sessionType } = req.query as Record<string, string>;
  res.json(computeTerrorOverview({ player, from, to, sessionType }));
});

terrorStatsRouter.get('/trends', (req, res) => {
  const { player, from, to, sessionType, bucket = 'week' } = req.query as Record<string, string>;
  res.json(computeTerrorTrends({ player, from, to, sessionType }, bucket));
});

terrorStatsRouter.get('/trends-by-player', (req, res) => {
  const { player, from, to, sessionType, bucket = 'week' } = req.query as Record<string, string>;
  res.json(computeTerrorTrendsByPlayer({ player, from, to, sessionType }, bucket));
});

terrorStatsRouter.get('/weekly', (req, res) => {
  const { player, from, to, sessionType, page = '1', pageSize = '10' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, Number(page) || 1);
  const pageSizeNum = Math.min(50, Math.max(1, Number(pageSize) || 10));
  res.json(computeTerrorWeeklyGroups({ player, from, to, sessionType }, pageNum, pageSizeNum));
});
