import { Pool, type PoolConfig } from 'pg';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { ConnectionError } from '../utils/errors.js';

/**
 * Singleton connection pool
 */
let pool: Pool | null = null;

/**
 * SQL Server configuration
 */
const sqlConfig: PoolConfig = {
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
