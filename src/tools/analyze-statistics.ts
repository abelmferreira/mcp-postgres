import { executeQuery } from '../db/index.js';
import { statisticsSchema } from '../validators/schemas.js';
import { formatSuccess, formatError } from '../utils/formatters.js';
import type { ToolResponse } from '../types.js';

/**
 * Tool: analyze_statistics
 * Analyze table statistics and identify stale statistics
 */
export async function analyzeStatistics(args: unknown): Promise<ToolResponse> {
  try {
    const { table, minRowsChanged } = statisticsSchema.parse(args);

    let query = `
      SELECT
        n.nspname AS "schema",
        c.relname AS "table",
        s.stxname AS "statisticsName",
        NULL::boolean AS "autoCreated",
        NULL::boolean AS "userCreated",
        NULL::boolean AS "noRecompute",
        NULL::boolean AS "hasFilter",
        NULL::text AS "filterDefinition",
        ps.last_analyze AS "lastUpdated",
        c.reltuples::bigint AS "totalRows",
        ps.n_mod_since_analyze AS "modificationCounter",
        CASE WHEN c.reltuples = 0 THEN 0
          ELSE ROUND(100.0 * ps.n_mod_since_analyze / c.reltuples, 2)
        END AS "percentModified",
        CASE
          WHEN c.reltuples = 0 THEN 'EMPTY TABLE'
          WHEN ps.n_mod_since_analyze IS NULL THEN 'UNKNOWN'
          WHEN (100.0 * ps.n_mod_since_analyze / c.reltuples) > @minRowsChanged THEN 'STALE - Analyze recommended'
          WHEN ps.last_analyze IS NULL THEN 'OLD - Consider analyze'
          ELSE 'OK'
        END AS "status",
        CASE
          WHEN ps.n_mod_since_analyze IS NOT NULL
            AND (100.0 * ps.n_mod_since_analyze / NULLIF(c.reltuples, 0)) > @minRowsChanged
            THEN 'ANALYZE ' || quote_ident(n.nspname) || '.' || quote_ident(c.relname)
          ELSE NULL
        END AS "updateDDL"
      FROM pg_stat_user_tables ps
      INNER JOIN pg_class c ON c.oid = ps.relid
      INNER JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_statistic_ext s ON s.stxrelid = c.oid
      WHERE c.relkind = 'r'
    `;

    const params: Record<string, string | number> = { minRowsChanged };

    if (table) {
      query += ` AND c.relname = @table`;
      params.table = table;
    }

    if (minRowsChanged > 0) {
      query += ` AND (c.reltuples = 0 OR (100.0 * ps.n_mod_since_analyze / c.reltuples) >= @minRowsChanged)`;
    }

    query += `
      ORDER BY
        CASE
          WHEN c.reltuples = 0 THEN 0
          ELSE 100.0 * ps.n_mod_since_analyze / c.reltuples
        END DESC,
        ps.last_analyze ASC
    `;

    const result = await executeQuery(query, params, 200);

    // Categorize statistics
    const summary = {
      stale: 0,
      old: 0,
      ok: 0,
      empty: 0,
    };

    result.rows.forEach((row) => {
      const r = row as { status: string };
      if (r.status.startsWith('STALE')) {
        summary.stale++;
      } else if (r.status.startsWith('OLD')) {
        summary.old++;
      } else if (r.status === 'EMPTY TABLE') {
        summary.empty++;
      } else {
        summary.ok++;
      }
    });

    return formatSuccess({
      statistics: result.rows,
      count: result.rowCount,
      summary,
      thresholds: {
        stale: 'More than 20% rows modified',
        old: 'Last updated more than 30 days ago',
      },
      note: 'Stale statistics can cause the query optimizer to choose suboptimal execution plans. Consider updating statistics regularly.',
    });
  } catch (error) {
    return formatError(error);
  }
}

/**
 * Tool definition for analyze_statistics
 */
export const analyzeStatisticsDefinition = {
  name: 'analyze_statistics',
  description:
    'Analyze table statistics to identify stale or outdated statistics that may affect query performance.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      table: {
        type: 'string',
        description: 'Filter for a specific table',
      },
      minRowsChanged: {
        type: 'number',
        default: 10,
        minimum: 0,
        maximum: 100,
        description: 'Minimum percentage of rows changed (default: 10)',
      },
    },
  },
};
