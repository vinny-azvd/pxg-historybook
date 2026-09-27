import { Router } from 'express';
import { db } from '../db/connection.js';

export const playersRouter = Router();

playersRouter.get('/', (_req, res) => {
  // Only players who actually appear in at least one imported Hunt, Terror
  // or MD - excludes stray player rows with no content behind them (e.g. a
  // name typed once for testing that never got an import attached).
  const players = db
    .prepare(
      `SELECT p.id, p.name, COUNT(DISTINCT hp.hunt_id) AS huntCount
       FROM players p
       LEFT JOIN hunt_players hp ON hp.player_id = p.id
       WHERE EXISTS (SELECT 1 FROM hunt_players x WHERE x.player_id = p.id)
          OR EXISTS (SELECT 1 FROM terror_players x WHERE x.player_id = p.id)
          OR EXISTS (SELECT 1 FROM md_players x WHERE x.player_id = p.id)
       GROUP BY p.id
       ORDER BY p.name COLLATE NOCASE`
    )
    .all();
  res.json(players);
});
