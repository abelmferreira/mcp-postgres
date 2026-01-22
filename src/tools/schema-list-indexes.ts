import { executeQuery } from '../db/index.js';
import { listIndexesSchema } from '../validators/schemas.js';
import { formatSuccess, formatError } from '../utils/formatters.js';
import type { ToolResponse } from '../types.js';

/**
 * Tool: schema_list_indexes
 * List indexes in the database
 */
export async function schemaListIndexes(args: unknown): Promise<ToolResponse> {
  try {
    const { table, schema } = listIndexesSchema.parse(args);

    let query = `
      WITH index_cols AS (
        SELECT
          t.oid AS table_oid,
          i.oid AS index_oid,
          n.nspname AS schema_name,
          t.relname AS table_name,
          i.relname AS index_name,
          ix.indisunique AS is_unique,
          ix.indisprimary AS is_primary_key,
          am.amname AS index_type,
          ARRAY_AGG(a.attname ORDER BY arr.ord) FILTER (WHERE arr.attnum > 0) AS columns
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_class i ON i.oid = ix.indexrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        INNER JOIN pg_am am ON am.oid = i.relam
        LEFT JOIN LATERAL UNNEST(ix.indkey) WITH ORDINALITY AS arr(attnum, ord) ON true
        LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = arr.attnum
        WHERE t.relkind = 'r'
        GROUP BY t.oid, i.oid, n.nspname, t.relname, i.relname, ix.indisunique, ix.indisprimary, am.amname
      ),
      usage AS (
        SELECT
          s.indexrelid,
          s.idx_scan,
          s.idx_tup_read,
          s.idx_tup_fetch,
          s.last_idx_scan
        FROM pg_stat_user_indexes s
      ),
      table_stats AS (
        SELECT
          c.oid AS table_oid,
          c.reltuples::bigint AS row_count,
          pg_relation_size(c.oid) / 1024.0 / 1024.0 AS size_mb
        FROM pg_class c
      )
      SELECT
        ic.schema_name AS "schema",
        ic.table_name AS "table",
        ic.index_name AS "indexName",
        ic.index_type AS "type",
        ic.is_unique AS "isUnique",
        ic.is_primary_key AS "isPrimaryKey",
        false AS "isDisabled",
        ARRAY_TO_STRING(ic.columns, ', ') AS "columns",
        NULL AS "includedColumns",
        ts.row_count AS "rowCount",
        ts.size_mb AS "sizeMB",
        u.idx_scan AS "seeks",
        u.idx_tup_read AS "scans",
        u.idx_tup_fetch AS "lookups",
        NULL AS "updates",
        u.last_idx_scan AS "lastSeek",
        NULL AS "lastScan"
      FROM index_cols ic
      LEFT JOIN usage u ON u.indexrelid = ic.index_oid
      LEFT JOIN table_stats ts ON ts.table_oid = ic.table_oid
      WHERE ic.index_name IS NOT NULL
    `;

    const params: Record<string, string> = {};

    if (table) {
      query += ` AND ic.table_name = @table`;
      params.table = table;
    }

    if (schema) {
      query += ` AND ic.schema_name = @schema`;
      params.schema = schema;
    }

    query += ` ORDER BY ic.schema_name, ic.table_name, ic.index_name`;

    const result = await executeQuery(query, params, 1000);

    return formatSuccess({
      indexes: result.rows,
      count: result.rowCount,
    });
  } catch (error) {
    return formatError(error);
  }
}

/**
 * Tool definition for schema_list_indexes
 */
export const schemaListIndexesDefinition = {
  name: 'schema_list_indexes',
  description:
    'List indexes in the database with usage statistics, including seeks, scans, lookups, and updates.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      table: {
        type: 'string',
        description: 'Filter by table name',
      },
      schema: {
        type: 'string',
        description: 'Filter by schema name',
      },
    },
  },
};
