import { executeQuery } from '../db/index.js';
import { formatSuccess, formatError } from '../utils/formatters.js';
import type { ToolResponse } from '../types.js';

/**
 * Tool: monitor_connections
 * Monitor active connections to the database
 */
export async function monitorConnections(): Promise<ToolResponse> {
  try {
    // Connection summary
    const summaryQuery = `
      SELECT
        COUNT(*) AS "totalConnections",
        SUM(CASE WHEN state = 'active' THEN 1 ELSE 0 END) AS "activeConnections",
        SUM(CASE WHEN state = 'idle' THEN 1 ELSE 0 END) AS "sleepingConnections",
        COUNT(DISTINCT client_addr) AS "uniqueHosts",
        COUNT(DISTINCT usename) AS "uniqueLogins",
        COUNT(DISTINCT application_name) AS "uniquePrograms"
      FROM pg_stat_activity
    `;

    // Connections by login
    const byLoginQuery = `
      SELECT
        usename AS "loginName",
        COUNT(*) AS "connections",
        SUM(CASE WHEN state = 'active' THEN 1 ELSE 0 END) AS "active",
        MAX(state_change) AS "lastActivity"
      FROM pg_stat_activity
      GROUP BY usename
      ORDER BY COUNT(*) DESC
    `;

    // Connections by host
    const byHostQuery = `
      SELECT
        COALESCE(client_addr::text, 'N/A') AS "hostName",
        COUNT(*) AS "connections",
        SUM(CASE WHEN state = 'active' THEN 1 ELSE 0 END) AS "active",
        MAX(state_change) AS "lastActivity"
      FROM pg_stat_activity
      GROUP BY client_addr
      ORDER BY COUNT(*) DESC
    `;

    // Connections by program
    const byProgramQuery = `
      SELECT
        COALESCE(application_name, 'N/A') AS "programName",
        COUNT(*) AS "connections",
        SUM(CASE WHEN state = 'active' THEN 1 ELSE 0 END) AS "active",
        MAX(state_change) AS "lastActivity"
      FROM pg_stat_activity
      GROUP BY application_name
      ORDER BY COUNT(*) DESC
    `;

    // Connection details
    const detailsQuery = `
      SELECT
        pid AS "sessionId",
        usename AS "loginName",
        client_addr::text AS "hostName",
        application_name AS "programName",
        state AS "status",
        datname AS "database",
        backend_start AS "loginTime",
        state_change AS "lastRequestStart"
      FROM pg_stat_activity
      ORDER BY backend_start DESC
      LIMIT 50
    `;

    const [summary, byLogin, byHost, byProgram, details] = await Promise.all([
      executeQuery(summaryQuery, {}, 1),
      executeQuery(byLoginQuery, {}, 50),
      executeQuery(byHostQuery, {}, 50),
      executeQuery(byProgramQuery, {}, 50),
      executeQuery(detailsQuery, {}, 50),
    ]);

    return formatSuccess({
      summary: summary.rows[0],
      byLogin: byLogin.rows,
      byHost: byHost.rows,
      byProgram: byProgram.rows,
      details: details.rows,
    });
  } catch (error) {
    return formatError(error);
  }
}

/**
 * Tool definition for monitor_connections
 */
export const monitorConnectionsDefinition = {
  name: 'monitor_connections',
  description:
    'Monitor active connections to the database including summaries by login, host, and program.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
};
