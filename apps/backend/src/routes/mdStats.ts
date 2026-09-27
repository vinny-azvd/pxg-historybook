import { Router } from 'express';
import {
  computeMdOverview,
  computeMdTrends,
  computeMdTrendsByPlayer,
  computeMdWeeklyGroups,
} from '../services/mdStatsAggregation.js';

export const mdStatsRouter = Router();

mdStatsRouter.get('/overview', (req, res) => {
  const { player, from, to, sessionType } = req.query as Record<string, string>;
  res.json(computeMdOverview({ player, from, to, sessionType }));
});

mdStatsRouter.get('/trends', (req, res) => {
  const { player, from, to, sessionType, bucket = 'week' } = req.query as Record<string, string>;
  res.json(computeMdTrends({ player, from, to, sessionType }, bucket));
});

mdStatsRouter.get('/trends-by-player', (req, res) => {
  const { player, from, to, sessionType, bucket = 'week' } = req.query as Record<string, string>;
  res.json(computeMdTrendsByPlayer({ player, from, to, sessionType }, bucket));
});

mdStatsRouter.get('/weekly', (req, res) => {
  const { player, from, to, sessionType, page = '1', pageSize = '10' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, Number(page) || 1);
  const pageSizeNum = Math.min(50, Math.max(1, Number(pageSize) || 10));
  res.json(computeMdWeeklyGroups({ player, from, to, sessionType }, pageNum, pageSizeNum));
});
