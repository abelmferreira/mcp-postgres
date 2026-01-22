import { executeQuery } from '../db/index.js';
import { perfCountersSchema } from '../validators/schemas.js';
import { formatSuccess, formatError } from '../utils/formatters.js';
import type { ToolResponse } from '../types.js';

/**
 * Tool: monitor_performance_counters
  * Monitor PostgreSQL performance metrics
 */
export async function monitorPerformanceCounters(args: unknown): Promise<ToolResponse> {
  try {
    const { category } = perfCountersSchema.parse(args);

    const query = `
      SELECT
        datname AS "database",
        blks_hit AS "blocksHit",
        blks_read AS "blocksRead",
        tup_returned AS "tuplesReturned",
        tup_fetched AS "tuplesFetched",
        xact_commit AS "commits",
        xact_rollback AS "rollbacks"
      FROM pg_stat_database
      WHERE datname = current_database()
    `;

    const result = await executeQuery(query, {}, 1);

    return formatSuccess({
      category,
      metrics: result.rows[0] || null,
      totalCounters: result.rowCount,
      note: 'PostgreSQL exposes metrics via pg_stat_database. For more, enable pg_stat_statements.',
      counters: result.rowCount > 0 ? { 'PostgreSQL:Database': result.rows } : {},
      bufferCacheHitRatio: null,
    });
  } catch (error) {
    return formatError(error);
  }
}

/**
 * Tool definition for monitor_performance_counters
 */
export const monitorPerformanceCountersDefinition = {
  name: 'monitor_performance_counters',
  description:
    'Monitor PostgreSQL performance metrics (database stats).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      category: {
        type: 'string',
        enum: ['buffer', 'sql', 'locks', 'memory', 'all'],
        default: 'all',
        description: 'Metric category (not used in PostgreSQL, kept for compatibility)',
      },
    },
  },
};
