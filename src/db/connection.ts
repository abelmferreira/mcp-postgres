import { Pool, type PoolConfig } from 'pg';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { ConnectionError } from '../utils/errors.js';

/**
 * Singleton connection pool
 */
let pool: Pool | null = null;

/**
 * Session-level read-only protection for READONLY mode.
 *
 * Sent as a startup parameter (`options: -c ...`) instead of running
 * `SET default_transaction_read_only = on` from a pool 'connect' handler:
 * - the server applies it while opening the session, before any query, so
 *   there is no window where a fresh connection is read-write;
 * - it covers every query that uses the pool, including the ones that do not
 *   go through executeQuery();
 * - a failure to apply it fails the connection instead of being silently
 *   lost in an async event handler.
 * Caveat: PgBouncer in transaction/statement mode rejects the `options`
 * startup parameter unless it is listed in `ignore_startup_parameters` (and
 * then it is ignored). The per-query `BEGIN READ ONLY` in execute.ts does
 * not depend on it, so the protection still holds behind a pooler.
 *
 * The session default alone is NOT enough: `SET transaction_read_only = off`
 * is accepted before the first snapshot of a transaction. That is why
 * execute.ts also opens an explicit READ ONLY transaction and takes a
 * snapshot before running the user query.
 */
export const READONLY_SESSION_OPTIONS = '-c default_transaction_read_only=on';

/**
 * Kills sessions left idle inside an open transaction (e.g. a hung client
 * holding a READ ONLY transaction and its snapshot). Our transactions only
 * wrap a single statement, so the query timeout plus a margin is plenty.
 */
const IDLE_IN_TRANSACTION_MARGIN_MS = 5000;

/**
 * PostgreSQL configuration
 */
export const sqlConfig: PoolConfig = {
  user: config.SQL_USER,
  password: config.SQL_PASSWORD,
  host: config.SQL_SERVER,
  database: config.SQL_DATABASE,
  port: config.SQL_PORT,
  ssl: config.SQL_SSL ? { rejectUnauthorized: false } : false,
  min: config.POOL_MIN,
  max: config.POOL_MAX,
  idleTimeoutMillis: 30000,
  statement_timeout: config.QUERY_TIMEOUT,
  idle_in_transaction_session_timeout: config.QUERY_TIMEOUT + IDLE_IN_TRANSACTION_MARGIN_MS,
  ...(config.READONLY ? { options: READONLY_SESSION_OPTIONS } : {}),
};

/**
 * Get the connection pool (creates if not exists)
 */
export async function getPool(): Promise<Pool> {
  if (pool) {
    return pool;
  }

  try {
    logger.info('Connecting to PostgreSQL', {
      server: config.SQL_SERVER,
      database: config.SQL_DATABASE,
      port: config.SQL_PORT,
      readonly: config.READONLY,
    });

    pool = new Pool(sqlConfig);
    await pool.query('SELECT 1');

    logger.info('Connected to PostgreSQL successfully');

    // Handle pool errors
    pool.on('error', (err: Error) => {
      logger.error('Connection pool error', { error: err.message });
    });

    return pool;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown connection error';
    logger.error('Failed to connect to PostgreSQL', { error: message });
    throw new ConnectionError(`Failed to connect to PostgreSQL: ${message}`);
  }
}

/**
 * Close the connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    try {
      await pool.end();
      pool = null;
      logger.info('Connection pool closed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error closing connection pool', { error: message });
    }
  }
}

/**
 * Check if the pool is connected
 */
export function isConnected(): boolean {
  return pool !== null;
}

/**
 * Get pool statistics
 */
export function getPoolStats(): { min: number; max: number; connected: boolean } {
  return {
    min: config.POOL_MIN,
    max: config.POOL_MAX,
    connected: pool !== null,
  };
}
