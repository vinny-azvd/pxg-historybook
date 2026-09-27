import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { IMAGES_DIR } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { huntsRouter } from './routes/hunts.js';
import { statsRouter } from './routes/stats.js';
import { playersRouter } from './routes/players.js';
import { itemsRouter } from './routes/items.js';
import { terrorsRouter } from './routes/terrors.js';
import { terrorStatsRouter } from './routes/terrorStats.js';
import { mdsRouter } from './routes/mds.js';
import { mdStatsRouter } from './routes/mdStats.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  if (fs.existsSync(IMAGES_DIR)) {
    app.use('/static/items', express.static(IMAGES_DIR));
  }

  app.use('/api/hunts', huntsRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/players', playersRouter);
  app.use('/api/items', itemsRouter);
  app.use('/api/terrors', terrorsRouter);
  app.use('/api/terror-stats', terrorStatsRouter);
  app.use('/api/mds', mdsRouter);
  app.use('/api/md-stats', mdStatsRouter);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  const frontendDist = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
  }

  return app;
}
