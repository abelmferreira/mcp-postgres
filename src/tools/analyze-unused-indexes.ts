import { executeQuery } from '../db/index.js';
import { unusedIndexesSchema } from '../validators/schemas.js';
import { formatSuccess, formatError } from '../utils/formatters.js';
import type { ToolResponse } from '../types.js';

/**
 * Tool: analyze_unused_indexes
 * Find indexes that are not being used
 */
export async function analyzeUnusedIndexes(args: unknown): Promise<ToolResponse> {
  try {
    const { table, minSizeMB, minAgeDays } = unusedIndexesSchema.parse(args);

    let query = `
      SELECT
        n.nspname AS "schema",
        t.relname AS "table",
        i.relname AS "indexName",
        am.amname AS "type",
        ix.indisunique AS "isUnique",
        ix.indisprimary AS "isPrimaryKey",
        pg_relation_size(i.oid) / 1024.0 / 1024.0 AS "sizeMB",
        COALESCE(s.idx_scan, 0) AS "seeks",
        COALESCE(s.idx_tup_read, 0) AS "scans",
        COALESCE(s.idx_tup_fetch, 0) AS "lookups",
        s.last_idx_scan AS "lastSeek",
        'DROP INDEX ' || quote_ident(n.nspname) || '.' || quote_ident(i.relname) AS "dropDDL"
      FROM pg_index ix
      INNER JOIN pg_class t ON t.oid = ix.indrelid
      INNER JOIN pg_class i ON i.oid = ix.indexrelid
      INNER JOIN pg_namespace n ON n.oid = t.relnamespace
      INNER JOIN pg_am am ON am.oid = i.relam
      LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.oid
      WHERE t.relkind = 'r'
        AND ix.indisprimary = false
        AND COALESCE(s.idx_scan, 0) = 0
        AND pg_relation_size(i.oid) / 1024.0 / 1024.0 >= @minSizeMB
    `;

    const params: Record<string, string | number> = { minSizeMB, minAgeDays };

    if (table) {
      query += ` AND t.relname = @table`;
      params.table = table;
    }

    query += `
      ORDER BY pg_relation_size(i.oid) DESC
    `;

    const result = await executeQuery(query, params, 100);

    // Calculate potential space savings
    const totalSizeMB = result.rows.reduce((sum, row) => {
      const r = row as { sizeMB: number };
      return sum + (r.sizeMB || 0);
    }, 0);

    return formatSuccess({
      unusedIndexes: result.rows,
      count: result.rowCount,
      potentialSpaceSavingsMB: Math.round(totalSizeMB * 100) / 100,
      note: 'These indexes have not been used for seeks, scans, or lookups. Consider dropping them to save space and improve write performance. Always verify in a non-production environment first.',
    });
  } catch (error) {
    return formatError(error);
  }
}

/**
 * Tool definition for analyze_unused_indexes
 */
export const analyzeUnusedIndexesDefinition = {
  name: 'analyze_unused_indexes',
  description:
    'Find indexes that are not being used and could be dropped to save space and improve write performance.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      table: {
        type: 'string',
        description: 'Filter for a specific table',
      },
      minSizeMB: {
        type: 'number',
        default: 1,
        minimum: 0,
        description: 'Minimum index size in MB (default: 1)',
      },
      minAgeDays: {
        type: 'number',
        default: 30,
        minimum: 0,
        description: 'Minimum days since last use (default: 30)',
      },
    },
  },
};
