import { Router } from 'express';
import {
  computeAvailableMonths,
  computeOverview,
  computeRareKills,
  computeTrends,
  computeTrendsByPlayer,
} from '../services/statsAggregation.js';

export const statsRouter = Router();

statsRouter.get('/overview', (req, res) => {
  const { player, from, to, sessionType } = req.query as Record<string, string>;
  res.json(computeOverview({ player, from, to, sessionType }));
});

statsRouter.get('/rare-kills', (req, res) => {
  const { player, from, to, sessionType } = req.query as Record<string, string>;
  res.json(computeRareKills({ player, from, to, sessionType }));
});

statsRouter.get('/months', (req, res) => {
  const { player, sessionType } = req.query as Record<string, string>;
  res.json(computeAvailableMonths({ player, sessionType }));
});

statsRouter.get('/trends', (req, res) => {
  const { player, from, to, sessionType, bucket = 'week' } = req.query as Record<string, string>;
  res.json(computeTrends({ player, from, to, sessionType }, bucket));
});

statsRouter.get('/trends-by-player', (req, res) => {
  const { player, from, to, sessionType, bucket = 'week' } = req.query as Record<string, string>;
  res.json(computeTrendsByPlayer({ player, from, to, sessionType }, bucket));
});

statsRouter.get('/compare', (req, res) => {
  const query = req.query as Record<string, any>;
  const player = query.player as string | undefined;
  const sessionType = query.sessionType as string | undefined;

  const periodA = query.periodA ?? {};
  const periodB = query.periodB ?? {};

  const statsA = computeOverview({ player, sessionType, from: periodA.from, to: periodA.to });
  const statsB = computeOverview({ player, sessionType, from: periodB.from, to: periodB.to });

  const delta = (a: number | null, b: number | null) => {
    if (a === null || b === null) return null;
    return { diff: b - a, percent: a === 0 ? null : ((b - a) / Math.abs(a)) * 100 };
  };

  res.json({
    periodA: { range: periodA, stats: statsA },
    periodB: { range: periodB, stats: statsB },
    delta: {
      avgProfitPerHour: delta(statsA.avgProfitPerHour, statsB.avgProfitPerHour),
      avgKillsPerHour: delta(statsA.avgKillsPerHour, statsB.avgKillsPerHour),
      avgRareKillsPerHour: delta(statsA.avgRareKillsPerHour, statsB.avgRareKillsPerHour),
      avgExperiencePerHour: delta(statsA.avgExperiencePerHour, statsB.avgExperiencePerHour),
      totalProfit: delta(statsA.totalProfit, statsB.totalProfit),
    },
  });
});
