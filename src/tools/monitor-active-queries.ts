import { executeQuery } from '../db/index.js';
import { activeQueriesSchema } from '../validators/schemas.js';
import { formatSuccess, formatError } from '../utils/formatters.js';
import type { ToolResponse } from '../types.js';

/**
 * Tool: monitor_active_queries
 * Monitor currently running queries
 */
export async function monitorActiveQueries(args: unknown): Promise<ToolResponse> {
  try {
    const { minDurationMs, includeSystemQueries } = activeQueriesSchema.parse(args);

    const query = `
      SELECT
        a.pid AS "sessionId",
        a.state AS "status",
        a.wait_event_type AS "waitType",
        a.wait_event AS "waitEvent",
        a.query_start AS "queryStart",
        EXTRACT(EPOCH FROM (now() - a.query_start)) * 1000 AS "elapsedTimeMs",
        a.usename AS "loginName",
        a.client_addr AS "clientAddress",
        a.application_name AS "programName",
        a.datname AS "database",
        a.query AS "fullQuery"
      FROM pg_stat_activity a
      WHERE a.pid <> pg_backend_pid()
        AND a.state <> 'idle'
        AND EXTRACT(EPOCH FROM (now() - a.query_start)) * 1000 >= @minDurationMs
        ${includeSystemQueries ? '' : "AND a.usename NOT IN ('postgres')"}
      ORDER BY a.query_start DESC
    `;

    const result = await executeQuery(query, { minDurationMs }, 100);

    // Truncate long queries
    const queries = result.rows.map((row) => {
      const queryRow = row as { fullQuery?: string; currentStatement?: string };
      if (queryRow.fullQuery && queryRow.fullQuery.length > 2000) {
        queryRow.fullQuery = queryRow.fullQuery.substring(0, 2000) + '... [truncated]';
      }
      if (queryRow.currentStatement && queryRow.currentStatement.length > 1000) {
        queryRow.currentStatement = queryRow.currentStatement.substring(0, 1000) + '... [truncated]';
      }
      return queryRow;
    });

    return formatSuccess({
      activeQueries: queries,
      count: result.rowCount,
    });
  } catch (error) {
    return formatError(error);
  }
}

/**
 * Tool definition for monitor_active_queries
 */
export const monitorActiveQueriesDefinition = {
  name: 'monitor_active_queries',
  description:
    'Monitor currently running queries with execution statistics, wait info, and blocking information.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      minDurationMs: {
        type: 'number',
        default: 0,
        description: 'Filter queries with minimum duration in milliseconds',
      },
      includeSystemQueries: {
        type: 'boolean',
        default: false,
        description: 'Include system queries (default: false)',
      },
    },
  },
};
