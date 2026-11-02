import net from 'node:net';
import { Pool, type PoolConfig } from 'pg';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { ConnectionError } from '../utils/errors.js';
import { SshTunnel, loadPrivateKey } from './tunnel.js';

/**
 * Singleton connection pool (and the SSH tunnel it goes through, when enabled)
 */
let pool: Pool | null = null;
let poolPromise: Promise<Pool> | null = null;
let tunnel: SshTunnel | null = null;

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
 * TLS options. With the SSH tunnel the socket goes to 127.0.0.1, so pg would
 * not send SNI (it only sets `servername` for hostnames). We pass the real
 * SQL_SERVER as `servername` instead, so SNI and any future certificate
 * hostname check keep referring to the database name, not to the tunnel end.
 * The certificate itself is still not verified (`rejectUnauthorized: false`),
 * exactly as without the tunnel.
 */
function buildSslOptions(viaTunnel: boolean): PoolConfig['ssl'] {
  if (!config.SQL_SSL) {
    return false;
  }
  if (viaTunnel && net.isIP(config.SQL_SERVER) === 0) {
    return { rejectUnauthorized: false, servername: config.SQL_SERVER };
  }
  return { rejectUnauthorized: false };
}

/**
 * PostgreSQL pool configuration for a given host/port (the local tunnel end when SSH is enabled)
 */
export function buildPoolConfig(host: string, port: number, viaTunnel = false): PoolConfig {
  return {
    user: config.SQL_USER,
    password: config.SQL_PASSWORD,
    host,
    database: config.SQL_DATABASE,
    port,
    ssl: buildSslOptions(viaTunnel),
    min: config.POOL_MIN,
    max: config.POOL_MAX,
    idleTimeoutMillis: 30000,
    statement_timeout: config.QUERY_TIMEOUT,
    idle_in_transaction_session_timeout: config.QUERY_TIMEOUT + IDLE_IN_TRANSACTION_MARGIN_MS,
    ...(config.READONLY ? { options: READONLY_SESSION_OPTIONS } : {}),
  };
}

/**
 * PostgreSQL configuration for a direct connection (no tunnel)
 */
export const sqlConfig: PoolConfig = buildPoolConfig(config.SQL_SERVER, config.SQL_PORT);

/**
 * Open the SSH tunnel when configured. Returns the host/port the pool must connect to.
 */
async function resolveEndpoint(): Promise<{ host: string; port: number }> {
  if (!config.SSH) {
    return { host: config.SQL_SERVER, port: config.SQL_PORT };
  }

  tunnel = new SshTunnel({
    host: config.SSH.host,
    port: config.SSH.port,
    username: config.SSH.user,
    privateKey: loadPrivateKey(config.SSH.keyPath, config.SSH.keyPassphrase),
    passphrase: config.SSH.keyPassphrase,
    hostFingerprint: config.SSH.hostFingerprint,
    dstHost: config.SQL_SERVER,
    dstPort: config.SQL_PORT,
  });

  const localPort = await tunnel.start();
  return { host: '127.0.0.1', port: localPort };
}

async function createPool(): Promise<Pool> {
  let created: Pool | null = null;
  try {
    logger.info('Connecting to PostgreSQL', {
      server: config.SQL_SERVER,
      database: config.SQL_DATABASE,
      port: config.SQL_PORT,
      readonly: config.READONLY,
      viaSshTunnel: config.SSH !== null,
    });

    const endpoint = await resolveEndpoint();
    created = new Pool(buildPoolConfig(endpoint.host, endpoint.port, config.SSH !== null));

    // Handle pool errors (idle clients dropped by the server or the tunnel)
    created.on('error', (err: Error) => {
      logger.error('Connection pool error', { error: err.message });
    });

    // Validate the connection works
    await created.query('SELECT 1');

    logger.info('Connected to PostgreSQL successfully');

    pool = created;
    return created;
  } catch (error) {
    // Do not leave a half-open pool or tunnel behind; the next call starts from scratch
    if (created) {
      await created.end().catch(() => undefined);
    }
    if (tunnel) {
      await tunnel.close().catch(() => undefined);
      tunnel = null;
    }
    const message = error instanceof Error ? error.message : 'Unknown connection error';
    logger.error('Failed to connect to PostgreSQL', { error: message });
    throw new ConnectionError(`Failed to connect to PostgreSQL: ${message}`);
  }
}

/**
 * Get the connection pool (creates if not exists)
 */
export async function getPool(): Promise<Pool> {
  if (pool) {
    return pool;
  }
  if (!poolPromise) {
    poolPromise = createPool().finally(() => {
      poolPromise = null;
    });
  }
  return poolPromise;
}

/**
 * Close the connection pool and the SSH tunnel
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

  if (tunnel) {
    await tunnel.close().catch(() => undefined);
    tunnel = null;
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
