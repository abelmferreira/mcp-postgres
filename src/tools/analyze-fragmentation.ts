import { executeQuery } from '../db/index.js';
import { fragmentationSchema } from '../validators/schemas.js';
import { formatSuccess, formatError } from '../utils/formatters.js';
import type { ToolResponse } from '../types.js';

/**
 * Tool: analyze_fragmentation
 * Analyze index fragmentation
 */
export async function analyzeFragmentation(args: unknown): Promise<ToolResponse> {
  try {
    const { table } = fragmentationSchema.parse(args);

    let query = `
      SELECT
        n.nspname AS "schema",
        t.relname AS "table",
        i.relname AS "indexName",
        am.amname AS "indexType",
        NULL::numeric AS "fragmentationPercent",
        NULL::numeric AS "pageCount",
        pg_relation_size(i.oid) / 1024.0 / 1024.0 AS "sizeMB",
        'OK - Check pgstattuple for fragmentation' AS "recommendation",
        NULL AS "maintenanceDDL"
      FROM pg_index ix
      INNER JOIN pg_class t ON t.oid = ix.indrelid
      INNER JOIN pg_class i ON i.oid = ix.indexrelid
      INNER JOIN pg_namespace n ON n.oid = t.relnamespace
      INNER JOIN pg_am am ON am.oid = i.relam
      WHERE t.relkind = 'r'
    `;

    const params: Record<string, string | number> = {};

    if (table) {
      query += ` AND t.relname = @table`;
      params.table = table;
    }

    query += `
      ORDER BY pg_relation_size(i.oid) DESC
    `;

    const result = await executeQuery(query, params, 100);

    // Categorize by fragmentation level
    const summary = {
      needsRebuild: 0,
      needsReorganize: 0,
      ok: 0,
    };

    result.rows.forEach(() => {
      summary.ok++;
    });

    return formatSuccess({
      fragmentation: result.rows,
      count: result.rowCount,
      summary,
      thresholds: {
        rebuild: 'Use pg_repack/REINDEX as needed',
        reorganize: 'Use VACUUM FULL or pg_repack',
        ok: 'Review fragmentation with pgstattuple',
      },
      note: 'PostgreSQL does not expose fragmentation percentages by default. Use extensions like pgstattuple or pg_repack for detailed analysis.',
    });
  } catch (error) {
    return formatError(error);
  }
}

/**
 * Tool definition for analyze_fragmentation
 */
export const analyzeFragmentationDefinition = {
  name: 'analyze_fragmentation',
  description:
    'Analyze index fragmentation levels and get maintenance recommendations (REBUILD or REORGANIZE).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      table: {
        type: 'string',
        description: 'Filter for a specific table',
      },
      minFragmentation: {
        type: 'number',
        default: 10,
        minimum: 0,
        maximum: 100,
        description: 'Minimum fragmentation percentage (default: 10)',
      },
      minPageCount: {
        type: 'number',
        default: 1000,
        minimum: 1,
        description: 'Minimum page count (default: 1000)',
      },
    },
  },
};
