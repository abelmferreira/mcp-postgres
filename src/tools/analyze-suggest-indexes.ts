import { executeQuery } from '../db/index.js';
import { suggestIndexesSchema } from '../validators/schemas.js';
import { formatSuccess, formatError } from '../utils/formatters.js';
import type { ToolResponse } from '../types.js';

/**
 * Tool: analyze_suggest_indexes
 * Suggest missing indexes based on query analyzer
 */
export async function analyzeSuggestIndexes(args: unknown): Promise<ToolResponse> {
  try {
    const { table, minImpact, top } = suggestIndexesSchema.parse(args);

    let query = `
      SELECT
        schemaname AS "schema",
        relname AS "table",
        seq_scan AS "userScans",
        idx_scan AS "userSeeks",
        seq_scan + idx_scan AS "improvementMeasure",
        'CREATE INDEX ON ' || quote_ident(schemaname) || '.' || quote_ident(relname) || ' (...)' AS "suggestedIndexDDL"
      FROM pg_stat_user_tables
      WHERE (seq_scan + idx_scan) >= @minImpact
    `;

    const params: Record<string, string | number> = { top, minImpact };

    if (table) {
      query += ` AND relname = @table`;
      params.table = table;
    }

    query += `
      ORDER BY seq_scan DESC
      LIMIT @top
    `;

    const result = await executeQuery(query, params, top);

    // Add recommendations
    const suggestions = result.rows.map((row) => {
      const suggestion = row as {
        improvementMeasure: number;
        userSeeks: number;
        userScans: number;
      };
      return {
        ...suggestion,
        recommendation:
          suggestion.improvementMeasure > 100000
            ? 'HIGH PRIORITY - Significant performance improvement expected'
            : suggestion.improvementMeasure > 10000
              ? 'MEDIUM PRIORITY - Moderate performance improvement expected'
              : 'LOW PRIORITY - Minor performance improvement expected',
      };
    });

    return formatSuccess({
      suggestions,
      count: result.rowCount,
      note: 'These suggestions are based on the query optimizer analysis. Always test indexes in a non-production environment first.',
    });
  } catch (error) {
    return formatError(error);
  }
}

/**
 * Tool definition for analyze_suggest_indexes
 */
export const analyzeSuggestIndexesDefinition = {
  name: 'analyze_suggest_indexes',
  description:
    'Suggest missing indexes based on query analyzer recommendations. Returns DDL statements to create suggested indexes.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      table: {
        type: 'string',
        description: 'Filter suggestions for a specific table',
      },
      minImpact: {
        type: 'number',
        default: 10,
        minimum: 0,
        maximum: 100,
        description: 'Minimum impact percentage to include (default: 10)',
      },
      top: {
        type: 'number',
        default: 20,
        minimum: 1,
        maximum: 50,
        description: 'Maximum number of suggestions (default: 20)',
      },
    },
  },
};
