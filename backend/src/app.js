import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { query } from './db.js';
import { errorHandler } from './lib/http.js';
import { logger } from './logger.js';
import adminRoutes from './routes/admin.js';
import alertRoutes from './routes/alerts.js';
import authRoutes from './routes/auth.js';
import donorRoutes from './routes/donors.js';
import publicRoutes from './routes/public.js';
import requestRoutes from './routes/requests.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy); // CloudFront (+ ALB) in front
  app.disable('x-powered-by');
  app.use(helmet());
  if (config.corsOrigins.length) app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '100kb' }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/healthz' || req.url === '/api/health' },
    }),
  );

  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.get('/api/health', async (_req, res) => {
    await query('SELECT 1');
    res.json({ ok: true, service: 'raktsetu-api', time: new Date().toISOString() });
  });

  const limiter = (limit, windowMs) => rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts. Wait a few minutes and try again.' } });

  app.use('/api/auth', limiter(40, 15 * 60_000), authRoutes);
  app.use('/api/alerts', limiter(30, 60_000), alertRoutes);
  app.use('/api/donors', donorRoutes);
  app.use('/api/requests', requestRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}
