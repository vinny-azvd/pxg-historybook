import { Router } from 'express';
import { db } from '../db/connection.js';

export const playersRouter = Router();

playersRouter.get('/', (_req, res) => {
  const players = db
    .prepare(
      `SELECT p.id, p.name, COUNT(DISTINCT hp.hunt_id) AS huntCount
       FROM players p
       LEFT JOIN hunt_players hp ON hp.player_id = p.id
       GROUP BY p.id
       ORDER BY p.name COLLATE NOCASE`
    )
    .all();
  res.json(players);
});
