import fs from 'node:fs';
import pg from 'pg';
import { config } from './config.js';
import { logger } from './logger.js';

// BIGINT ids -> number, NUMERIC -> number, DATE -> 'YYYY-MM-DD' string (no timezone drift)
pg.types.setTypeParser(20, (v) => Number.parseInt(v, 10));
pg.types.setTypeParser(1700, (v) => Number.parseFloat(v));
pg.types.setTypeParser(1082, (v) => v);

function sslOptions() {
  if (config.dbSsl === 'verify') return { ca: fs.readFileSync(config.dbSslCa, 'utf8') };
  if (config.dbSsl === 'require') return { rejectUnauthorized: false };
  return false;
}

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: sslOptions(),
  max: config.dbPoolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => logger.error({ err }, 'postgres pool error'));

export const query = (text, params) => pool.query(text, params);

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
