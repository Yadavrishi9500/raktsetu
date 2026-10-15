import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { logger } from './logger.js';
import { runMigrations } from './migrate.js';
import { seed } from './seed.js';

await runMigrations();
if (config.seedDemo) await seed();

const server = createApp().listen(config.port, () =>
  logger.info({ port: config.port, notifyMode: config.notifyMode }, 'RaktSetu API listening'),
);

function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
