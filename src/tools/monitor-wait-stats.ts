import { executeQuery } from '../db/index.js';
import { waitStatsSchema } from '../validators/schemas.js';
import { formatSuccess, formatError } from '../utils/formatters.js';
import type { ToolResponse } from '../types.js';

/**
 * Tool: monitor_wait_stats
 * Monitor wait statistics
 */
export async function monitorWaitStats(args: unknown): Promise<ToolResponse> {
  try {
    const { top, excludeIdle } = waitStatsSchema.parse(args);

    const idleWaits = [
      'ClientRead',
      'ClientWrite',
      'ClientWait',
      'Idle',
      'Activity',
      'Idle in transaction',
    ];

    let query = `
      SELECT
        wait_event AS "waitType",
        COUNT(*) AS "waitingTasksCount",
        EXTRACT(EPOCH FROM MAX(now() - query_start)) * 1000 AS "totalWaitTimeMs",
        EXTRACT(EPOCH FROM MAX(now() - query_start)) * 1000 AS "maxWaitTimeMs",
        NULL::numeric AS "signalWaitTimeMs",
        EXTRACT(EPOCH FROM MAX(now() - query_start)) * 1000 AS "resourceWaitTimeMs",
        CASE WHEN SUM(EXTRACT(EPOCH FROM (now() - query_start)) * 1000) OVER() = 0 THEN 0
          ELSE ROUND(
            100.0 * (EXTRACT(EPOCH FROM MAX(now() - query_start)) * 1000)
            / SUM(EXTRACT(EPOCH FROM (now() - query_start)) * 1000) OVER(),
            2
          )
        END AS "percentTotal"
      FROM pg_stat_activity
      WHERE wait_event IS NOT NULL
    `;

    if (excludeIdle) {
      query += ` AND wait_event NOT IN ('${idleWaits.join("','")}')`;
    }

    query += `
      GROUP BY wait_event
      ORDER BY totalWaitTimeMs DESC
      LIMIT @top
    `;

    const result = await executeQuery(query, { top }, top);

    return formatSuccess({
      waitStats: result.rows,
      count: result.rowCount,
      excludedIdleWaits: excludeIdle,
    });
  } catch (error) {
    return formatError(error);
  }
}

/**
 * Tool definition for monitor_wait_stats
 */
export const monitorWaitStatsDefinition = {
  name: 'monitor_wait_stats',
  description:
    'Monitor wait statistics to identify performance bottlenecks. Shows wait types, counts, and times.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      top: {
        type: 'number',
        default: 10,
        minimum: 1,
        maximum: 100,
        description: 'Number of wait types to return (default: 10)',
      },
      excludeIdle: {
        type: 'boolean',
        default: true,
        description: 'Exclude idle/benign waits (default: true)',
      },
    },
  },
};
