import { executeQuery } from '../db/index.js';
import { formatSuccess, formatError } from '../utils/formatters.js';
import type { ToolResponse } from '../types.js';

/**
 * Tool: monitor_database_size
 * Monitor database size and file usage
 */
export async function monitorDatabaseSize(): Promise<ToolResponse> {
  try {
    // Database size summary
    const sizeQuery = `
      SELECT
        current_database() AS "database",
        pg_database_size(current_database()) / 1024.0 / 1024.0 AS "totalSizeMB"
    `;

    // File details (tablespaces)
    const filesQuery = `
      SELECT
        ts.spcname AS "fileName",
        pg_tablespace_location(ts.oid) AS "physicalPath",
        pg_tablespace_size(ts.oid) / 1024.0 / 1024.0 AS "sizeMB"
      FROM pg_tablespace ts
    `;

    // Table sizes
    const tablesQuery = `
      SELECT
        n.nspname AS "schema",
        c.relname AS "table",
        c.reltuples::bigint AS "rowCount",
        pg_total_relation_size(c.oid) / 1024.0 / 1024.0 AS "totalSizeMB",
        pg_relation_size(c.oid) / 1024.0 / 1024.0 AS "usedSizeMB",
        (pg_total_relation_size(c.oid) - pg_relation_size(c.oid)) / 1024.0 / 1024.0 AS "unusedSizeMB"
      FROM pg_class c
      INNER JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
      LIMIT 20
    `;

    const [size, files, tables] = await Promise.all([
      executeQuery(sizeQuery, {}, 1),
      executeQuery(filesQuery, {}, 100),
      executeQuery(tablesQuery, {}, 20),
    ]);

    return formatSuccess({
      summary: size.rows[0],
      files: files.rows,
      largestTables: tables.rows,
    });
  } catch (error) {
    return formatError(error);
  }
}

/**
 * Tool definition for monitor_database_size
 */
export const monitorDatabaseSizeDefinition = {
  name: 'monitor_database_size',
  description:
    'Monitor database size including file usage, space allocation, and largest tables.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
};
