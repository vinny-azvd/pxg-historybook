import { Router } from 'express';
import { db } from '../db/connection.js';

export const itemsRouter = Router();

itemsRouter.get('/unmatched', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT item, item_normalized AS itemNormalized, SUM(occurrences) AS occurrences FROM (
         SELECT item, item_normalized, COUNT(*) AS occurrences FROM hunt_drops
         WHERE item_normalized NOT IN (SELECT name_normalized FROM item_icons)
         GROUP BY item_normalized
         UNION ALL
         SELECT item, item_normalized, COUNT(*) AS occurrences FROM hunt_supplies
         WHERE item_normalized NOT IN (SELECT name_normalized FROM item_icons)
         GROUP BY item_normalized
       )
       GROUP BY item_normalized
       ORDER BY occurrences DESC`
    )
    .all();
  res.json(rows);
});
