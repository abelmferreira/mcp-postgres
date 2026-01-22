import { executeQuery } from '../db/index.js';
import { listProceduresSchema } from '../validators/schemas.js';
import { formatSuccess, formatError } from '../utils/formatters.js';
import type { ToolResponse } from '../types.js';

/**
 * Tool: schema_list_procedures
 * List stored procedures in the database
 */
export async function schemaListProcedures(args: unknown): Promise<ToolResponse> {
  try {
    const { schema, pattern } = listProceduresSchema.parse(args);

    let query = `
      SELECT
        n.nspname AS "schema",
        p.proname AS "name",
        CASE p.prokind
          WHEN 'p' THEN 'PROCEDURE'
          WHEN 'f' THEN 'FUNCTION'
          WHEN 'a' THEN 'AGGREGATE'
          WHEN 'w' THEN 'WINDOW'
          ELSE 'UNKNOWN'
        END AS "type",
        p.pronargs AS "parameterCount",
        pg_get_functiondef(p.oid) AS "definition"
      FROM pg_proc p
      INNER JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    `;

    const params: Record<string, string> = {};

    if (schema) {
      query += ` AND n.nspname = @schema`;
      params.schema = schema;
    }

    if (pattern) {
      query += ` AND p.proname LIKE @pattern`;
      params.pattern = pattern;
    }

    query += ` ORDER BY n.nspname, p.proname`;

    const result = await executeQuery(query, params, 500);

    // Truncate definition to avoid huge responses
    const procedures = result.rows.map((row) => {
      const proc = row as { definition?: string };
      if (proc.definition && proc.definition.length > 2000) {
        proc.definition = proc.definition.substring(0, 2000) + '... [truncated]';
      }
      return proc;
    });

    return formatSuccess({
      procedures,
      count: result.rowCount,
    });
  } catch (error) {
    return formatError(error);
  }
}

/**
 * Tool definition for schema_list_procedures
 */
export const schemaListProceduresDefinition = {
  name: 'schema_list_procedures',
  description:
    'List stored procedures in the database with optional filtering by schema and name pattern.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      schema: {
        type: 'string',
        description: 'Filter by schema name (e.g., "public")',
      },
      pattern: {
        type: 'string',
        description: 'LIKE pattern for procedure name',
      },
    },
  },
};
