import Cursor from 'pg-cursor';
import type { FieldDef, PoolClient } from 'pg';
import { getPool } from './connection.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { validateQuery } from '../validators/query-validator.js';
import {
  QueryValidationError,
  ReadOnlyViolationError,
  TimeoutError,
  getErrorMessage,
  MissingParameterError,
} from '../utils/errors.js';
import type { QueryResult, SqlParamValue } from '../types.js';

/**
 * Replace @param placeholders with $1..$n and build parameter array.
 */
function compileQuery(
  query: string,
  params: Record<string, SqlParamValue>
): { text: string; values: SqlParamValue[] } {
  const values: SqlParamValue[] = [];
  const paramIndex = new Map<string, number>();
  const missingParams = new Set<string>();
  const regex = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;

  const text = query.replace(regex, (_match, name: string) => {
    if (!(name in params)) {
      missingParams.add(name);
      return _match;
    }
    let index = paramIndex.get(name);
    if (!index) {
      values.push(params[name]);
      index = values.length;
      paramIndex.set(name, index);
    }
    return `$${index}`;
  });

  if (missingParams.size > 0) {
    const firstMissing = Array.from(missingParams.values())[0];
    throw new MissingParameterError(firstMissing);
  }

  return { text, values };
}

/**
 * READ ONLY transaction used for every query in READONLY mode.
 *
 * `SELECT 1` right after BEGIN takes the transaction snapshot. PostgreSQL only
 * accepts `SET transaction_read_only = off` (or set_config(...)) BEFORE the
 * first snapshot, so after this nothing in the user query can turn the
 * transaction back into read-write. The transaction always ends in ROLLBACK,
 * which also reverts any session setting changed inside it.
 */
const BEGIN_READ_ONLY = 'BEGIN TRANSACTION READ ONLY';
const TAKE_SNAPSHOT = 'SELECT 1';

interface LimitedRows {
  rows: Record<string, unknown>[];
  fields: FieldDef[];
  truncated: boolean;
}

/**
 * Run a single statement through a server-side portal and fetch at most
 * `limit + 1` rows. The extra row only tells whether there is more data;
 * the server never produces the rest of the result set.
 *
 * A portal (pg-cursor) works for SELECT, WITH and EXPLAIN alike, without
 * rewriting the query, and always uses the extended protocol, where the
 * server rejects multiple statements in one call.
 */
async function fetchLimited(
  client: PoolClient,
  text: string,
  values: SqlParamValue[],
  limit: number
): Promise<LimitedRows> {
  const cursor = client.query(new Cursor<Record<string, unknown>>(text, values));

  const { rows, fields } = await new Promise<{
    rows: Record<string, unknown>[];
    fields: FieldDef[];
  }>((resolve, reject) => {
    cursor.read(limit + 1, (err, readRows, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({ rows: readRows ?? [], fields: result?.fields ?? [] });
    });
  });

  // Only close on success: after an error the cursor already synced with
  // the server, and closing again would send a stray Close message.
  await cursor.close();

  const truncated = rows.length > limit;
  return {
    rows: truncated ? rows.slice(0, limit) : rows,
    fields,
    truncated,
  };
}

/**
 * Execute a SQL query with parameters
 *
 * In READONLY mode the query is validated and runs inside a READ ONLY
 * transaction on a dedicated connection. The row limit is applied on the
 * server (see fetchLimited) and is capped by MAX_ROWS.
 *
 * @param query SQL query with @param placeholders
 * @param params Named parameters (without @)
 * @param maxRows Maximum rows to return
 * @returns Query result with rows and metadata. `rowCount` is the number of
 *   rows returned; `truncated` is true when the query had more rows.
 */
export async function executeQuery(
  query: string,
  params: Record<string, SqlParamValue> = {},
  maxRows: number = 100
): Promise<QueryResult> {
  const startTime = Date.now();

  // Validate query in READONLY mode
  if (config.READONLY) {
    const validation = validateQuery(query);
    if (!validation.valid) {
      throw new QueryValidationError(validation.reason || 'Query validation failed');
    }
  }

  const limit = Math.max(1, Math.min(Math.floor(maxRows) || 1, config.MAX_ROWS));

  let client: PoolClient | undefined;
  let inTransaction = false;
  let discardClient = false;

  try {
    const { text, values } = compileQuery(query, params);
    const pool = await getPool();
    client = await pool.connect();

    if (config.READONLY) {
      await client.query(BEGIN_READ_ONLY);
      inTransaction = true;
      await client.query(TAKE_SNAPSHOT);
    }

    const { rows, fields: rawFields, truncated } = await fetchLimited(
      client,
      text,
      values,
      limit
    );

    const duration = Date.now() - startTime;

    logger.info('Query executed', {
      duration,
      rows: rows.length,
      truncated,
      readonly: config.READONLY,
      paramCount: values.length,
      query: query.substring(0, 200),
    });

    const fields = rawFields.map((field) => ({
      name: field.name,
      type: field.dataTypeID?.toString() ?? 'unknown',
    }));

    return {
      rows,
      rowCount: rows.length,
      fields,
      duration,
      truncated,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = getErrorMessage(error);

    logger.error('Query execution failed', {
      error: message,
      duration,
      query: query.substring(0, 200),
    });

    // Handle specific database errors
    if (message.includes('timeout') || message.includes('Timeout')) {
      throw new TimeoutError(duration);
    }

    throw error;
  } finally {
    if (client) {
      if (inTransaction) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Unknown session state: do not return it to the pool
          discardClient = true;
        }
      }
      client.release(discardClient);
    }
  }
}

/**
 * Execute a write operation (INSERT, UPDATE, DELETE)
 * Only allowed when READONLY is false
 *
 * @param query SQL query
 * @param params Named parameters
 * @returns Number of affected rows
 */
export async function executeWrite(
  query: string,
  params: Record<string, SqlParamValue> = {}
): Promise<{ affectedRows: number; duration: number }> {
  if (config.READONLY) {
    throw new ReadOnlyViolationError('Write operations are not allowed in READONLY mode');
  }

  const startTime = Date.now();

  try {
    const pool = await getPool();
    const { text, values } = compileQuery(query, params);
    const result = await pool.query(text, values);

    const duration = Date.now() - startTime;

    logger.info('Write operation executed', {
      affectedRows: result.rowCount ?? 0,
      duration,
      paramCount: values.length,
      query: query.substring(0, 200),
    });

    return {
      affectedRows: result.rowCount ?? 0,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = getErrorMessage(error);

    logger.error('Write operation failed', {
      error: message,
      duration,
      query: query.substring(0, 200),
    });

    throw error;
  }
}

/**
 * Execute a query that returns a single scalar value
 */
export async function executeScalar<T>(
  query: string,
  params: Record<string, SqlParamValue> = {}
): Promise<T | null> {
  const result = await executeQuery(query, params, 1);

  if (result.rows.length === 0) {
    return null;
  }

  const firstRow = result.rows[0] as Record<string, unknown>;
  const keys = Object.keys(firstRow);

  if (keys.length === 0) {
    return null;
  }

  return firstRow[keys[0]] as T;
}

/**
 * Build a parameterized INSERT query
 */
export function buildInsertQuery(
  schema: string,
  table: string,
  data: Record<string, SqlParamValue>
): { query: string; params: Record<string, SqlParamValue> } {
  const columns = Object.keys(data);
  const paramNames = columns.map((col) => `@${col}`);

  const query = `
    INSERT INTO "${schema}"."${table}" ("${columns.join('", "')}") 
    VALUES (${paramNames.join(', ')})
    RETURNING *;
  `;

  return { query, params: data };
}

/**
 * Build a parameterized UPDATE query
 */
export function buildUpdateQuery(
  schema: string,
  table: string,
  data: Record<string, SqlParamValue>,
  whereClause: string,
  whereParams: Record<string, SqlParamValue>
): { query: string; params: Record<string, SqlParamValue> } {
  const setClause = Object.keys(data)
    .map((col) => `"${col}" = @${col}`)
    .join(', ');

  const query = `
    UPDATE "${schema}"."${table}"
    SET ${setClause}
    WHERE ${whereClause}
    RETURNING *;
  `;

  return { query, params: { ...data, ...whereParams } };
}

/**
 * Build a parameterized DELETE query
 */
export function buildDeleteQuery(
  schema: string,
  table: string,
  whereClause: string,
  whereParams: Record<string, SqlParamValue>
): { query: string; params: Record<string, SqlParamValue> } {
  const query = `
    DELETE FROM "${schema}"."${table}"
    WHERE ${whereClause}
    RETURNING *;
  `;

  return { query, params: whereParams };
}
