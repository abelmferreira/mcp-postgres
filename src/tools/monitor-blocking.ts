import { executeQuery } from '../db/index.js';
import { formatSuccess, formatError } from '../utils/formatters.js';
import type { ToolResponse } from '../types.js';

/**
 * Tool: monitor_blocking
 * Monitor blocking sessions and lock chains
 */
export async function monitorBlocking(): Promise<ToolResponse> {
  try {
    const query = `
      SELECT
        w.pid AS "blockedSessionId",
        w.locktype AS "lockType",
        w.mode AS "waitMode",
        w.relation::regclass::text AS "relation",
        a.usename AS "blockedLogin",
        a.application_name AS "blockedProgram",
        a.query AS "blockedQuery",
        a.query_start AS "blockedQueryStart",
        b.pid AS "blockingSessionId",
        b.usename AS "blockingLogin",
        b.application_name AS "blockingProgram",
        b.query AS "blockingQuery"
      FROM pg_locks w
      JOIN pg_stat_activity a ON a.pid = w.pid
      JOIN pg_locks bl ON bl.locktype = w.locktype
        AND bl.database IS NOT DISTINCT FROM w.database
        AND bl.relation IS NOT DISTINCT FROM w.relation
        AND bl.page IS NOT DISTINCT FROM w.page
        AND bl.tuple IS NOT DISTINCT FROM w.tuple
        AND bl.virtualxid IS NOT DISTINCT FROM w.virtualxid
        AND bl.transactionid IS NOT DISTINCT FROM w.transactionid
        AND bl.classid IS NOT DISTINCT FROM w.classid
        AND bl.objid IS NOT DISTINCT FROM w.objid
        AND bl.objsubid IS NOT DISTINCT FROM w.objsubid
        AND bl.pid <> w.pid
        AND bl.granted
      JOIN pg_stat_activity b ON b.pid = bl.pid
      WHERE NOT w.granted
      ORDER BY a.query_start DESC
    `;

    const result = await executeQuery(query, {}, 100);

    // Truncate long queries
    const blockingInfo = result.rows.map((row) => {
      const info = row as { blockedQuery?: string; blockingQuery?: string; blockingSessionId?: number };
      if (info.blockedQuery && info.blockedQuery.length > 1000) {
        info.blockedQuery = info.blockedQuery.substring(0, 1000) + '... [truncated]';
      }
      if (info.blockingQuery && info.blockingQuery.length > 1000) {
        info.blockingQuery = info.blockingQuery.substring(0, 1000) + '... [truncated]';
      }
      return info;
    });

    const headBlockersQuery = `
      SELECT DISTINCT bl.pid AS "sessionId"
      FROM pg_locks w
      JOIN pg_locks bl ON bl.locktype = w.locktype
        AND bl.database IS NOT DISTINCT FROM w.database
        AND bl.relation IS NOT DISTINCT FROM w.relation
        AND bl.page IS NOT DISTINCT FROM w.page
        AND bl.tuple IS NOT DISTINCT FROM w.tuple
        AND bl.virtualxid IS NOT DISTINCT FROM w.virtualxid
        AND bl.transactionid IS NOT DISTINCT FROM w.transactionid
        AND bl.classid IS NOT DISTINCT FROM w.classid
        AND bl.objid IS NOT DISTINCT FROM w.objid
        AND bl.objsubid IS NOT DISTINCT FROM w.objsubid
        AND bl.pid <> w.pid
        AND bl.granted
      WHERE NOT w.granted
        AND bl.pid NOT IN (SELECT pid FROM pg_locks WHERE NOT granted)
    `;

    const headBlockersResult = await executeQuery(headBlockersQuery, {}, 100);
    const headBlockers = headBlockersResult.rows.map((row) => (row as { sessionId: number }).sessionId);

    return formatSuccess({
      blocking: blockingInfo,
      headBlockers,
      count: result.rowCount,
    });
  } catch (error) {
    return formatError(error);
  }
}

/**
 * Tool definition for monitor_blocking
 */
export const monitorBlockingDefinition = {
  name: 'monitor_blocking',
  description:
    'Monitor blocking sessions and lock chains. Shows which sessions are blocking others and identifies head blockers.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
};
