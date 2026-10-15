/**
 * Beanstalk WORKER environment entrypoint.
 * The Beanstalk SQS daemon (sqsd) reads the queue subscribed to the SNS events topic and POSTs
 * each message to /tasks/sns; cron.yaml POSTs /tasks/escalate on a schedule. A 2xx response
 * deletes the message; anything else lets SQS retry and, eventually, park it in the DLQ.
 */
import express from 'express';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { pool } from './db.js';
import { logger } from './logger.js';
import { runMigrations } from './migrate.js';
import { escalate, runRound } from './services/matching.js';
import { standDownDonors } from './services/responses.js';

const handlers = {
  'request.created': ({ requestId }) => runRound(requestId, { initial: true }),
  'request.cancelled': ({ requestId }) => standDownDonors(requestId, 'cancelled'),
  'request.fulfilled': ({ requestId }) => standDownDonors(requestId, 'fulfilled'),
};

const app = express();
app.disable('x-powered-by');
app.use(express.json({ type: () => true, limit: '256kb' }));
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/healthz' || req.url === '/health' } }));

app.get(['/healthz', '/health', '/'], (_req, res) => res.json({ ok: true, service: 'raktsetu-worker' }));

app.use('/tasks', (req, res, next) => {
  if (config.taskSecret && req.get('x-task-secret') !== config.taskSecret) return res.status(403).json({ error: 'forbidden' });
  next();
});

app.post('/tasks/sns', async (req, res) => {
  let msg = req.body;
  // Accept both raw SQS delivery and the SNS JSON envelope.
  if (msg?.Type === 'Notification' && typeof msg.Message === 'string') {
    try {
      msg = JSON.parse(msg.Message);
    } catch {
      msg = null;
    }
  }
  const handler = handlers[msg?.type];
  if (!handler) {
    req.log.warn({ body: req.body }, 'unknown or malformed event; acknowledging so it is not retried');
    return res.json({ ignored: true });
  }
  const result = await handler(msg.payload || {});
  res.json({ ok: true, type: msg.type, result });
});

app.post('/tasks/escalate', async (_req, res) => {
  res.json(await escalate());
});

app.use((err, req, res, _next) => {
  if (err?.type === 'entity.parse.failed') {
    (req.log || logger).warn('non-JSON message acknowledged and dropped');
    return res.json({ ignored: true });
  }
  (req.log || logger).error({ err }, 'task failed; SQS will retry');
  res.status(500).json({ error: err.message });
});

await runMigrations();
const server = app.listen(config.port, () => logger.info({ port: config.port }, 'RaktSetu worker listening'));

let timer;
if (config.localCron) {
  // Local stand-in for Beanstalk's cron.yaml.
  timer = setInterval(() => escalate().catch((err) => logger.error({ err }, 'local escalation failed')), 60_000);
  logger.info('local escalation cron enabled (every 60s)');
}

function shutdown() {
  clearInterval(timer);
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
