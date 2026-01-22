import { executeQuery } from '../db/index.js';
import { analyzeQuerySchema } from '../validators/schemas.js';
import { formatSuccess, formatError } from '../utils/formatters.js';
import type { ToolResponse } from '../types.js';

/**
 * Tool: analyze_query
 * Analyze a query's execution plan and statistics
 */
export async function analyzeQuery(args: unknown): Promise<ToolResponse> {
  try {
    const { query, params, includeExecutionPlan } = analyzeQuerySchema.parse(args);

    const results: {
      estimatedPlan?: unknown;
      statistics?: unknown;
      warnings?: string[];
    } = {};
    const warnings: string[] = [];

    if (includeExecutionPlan) {
      try {
        const planResult = await executeQuery(`EXPLAIN (FORMAT JSON) ${query}`, params, 1);
        if (planResult.rows.length > 0) {
          const planJson = (planResult.rows[0] as Record<string, unknown>)['QUERY PLAN'];
          results.estimatedPlan = parsePlanJson(planJson);
        }
      } catch (planError) {
        warnings.push(`Could not get execution plan: ${planError instanceof Error ? planError.message : 'Unknown error'}`);
      }
    }

    // Get query statistics from cache if available
    const statsQuery = `
      SELECT
        calls AS "executionCount",
        total_exec_time AS "totalElapsedTimeMs",
        mean_exec_time AS "avgElapsedTimeMs",
        rows AS "totalRows"
      FROM pg_stat_statements
      WHERE query LIKE @queryPattern
      ORDER BY total_exec_time DESC
      LIMIT 1
    `;

    // Create a pattern to find similar queries in cache
    const queryPattern = '%' + query.substring(0, Math.min(50, query.length)).replace(/'/g, "''") + '%';

    try {
      const statsResult = await executeQuery(statsQuery, { queryPattern }, 1);
      if (statsResult.rows.length > 0) {
        results.statistics = statsResult.rows[0];
      } else {
        warnings.push('No cached statistics found for this query');
      }
    } catch {
      warnings.push('Could not retrieve query statistics');
    }

    if (warnings.length > 0) {
      results.warnings = warnings;
    }

    return formatSuccess(results);
  } catch (error) {
    return formatError(error);
  }
}

/**
 * Parse execution plan JSON to extract key information
 */
function parsePlanJson(plan: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {
    raw: plan,
  };

  if (!Array.isArray(plan) || plan.length === 0) {
    return result;
  }

  const root = plan[0] as Record<string, unknown>;
  const planNode = root['Plan'] as Record<string, unknown> | undefined;
  if (!planNode) {
    return result;
  }

  if (typeof planNode['Plan Rows'] === 'number') {
    result.estimatedRows = planNode['Plan Rows'];
  }
  if (typeof planNode['Total Cost'] === 'number') {
    result.estimatedCost = planNode['Total Cost'];
  }

  const nodeType = planNode['Node Type'];
  if (typeof nodeType === 'string' && nodeType.includes('Scan')) {
    result.scanOperations = 1;
    result.potentialIssue = 'Query uses scan operations';
  }

  if (typeof planNode['Parallel Aware'] === 'boolean' && planNode['Parallel Aware']) {
    result.usesParallelism = true;
  }

  return result;
}

/**
 * Tool definition for analyze_query
 */
export const analyzeQueryDefinition = {
  name: 'analyze_query',
  description:
    'Analyze a SQL query to get execution plan, statistics, and performance recommendations.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'SQL query to analyze',
      },
      params: {
        type: 'object',
        description: 'Named parameters for the query',
        additionalProperties: true,
        default: {},
      },
      includeExecutionPlan: {
        type: 'boolean',
        default: true,
        description: 'Include execution plan details (default: true)',
      },
    },
    required: ['query'],
  },
};
