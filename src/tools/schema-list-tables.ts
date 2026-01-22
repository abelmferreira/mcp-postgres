import { executeQuery } from '../db/index.js';
import { listTablesSchema } from '../validators/schemas.js';
import { formatSuccess, formatError } from '../utils/formatters.js';
import type { ToolResponse } from '../types.js';

/**
 * Tool: schema_list_tables
 * List tables and views in the database
 */
export async function schemaListTables(args: unknown): Promise<ToolResponse> {
  try {
    const { schema, type, pattern } = listTablesSchema.parse(args);

    const params: Record<string, string> = {};

    let query = `
      SELECT
        n.nspname AS "schema",
        c.relname AS "name",
        CASE c.relkind WHEN 'r' THEN 'TABLE' WHEN 'v' THEN 'VIEW' ELSE c.relkind::text END AS "type",
        c.reltuples::bigint AS "rowCount",
        pg_total_relation_size(c.oid) / 1024.0 / 1024.0 AS "sizeMB",
        c.relkind AS "relKind"
      FROM pg_class c
      INNER JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'v', 'm')
    `;

    if (schema) {
      query += ` AND n.nspname = @schema`;
      params.schema = schema;
    }

    if (pattern) {
      query += ` AND c.relname LIKE @pattern`;
      params.pattern = pattern;
    }

    if (type === 'TABLE') {
      query += ` AND c.relkind = 'r'`;
    } else if (type === 'VIEW') {
      query += ` AND c.relkind IN ('v', 'm')`;
    }

    query += ` ORDER BY n.nspname, c.relname`;

    const result = await executeQuery(query, params, 1000);

    return formatSuccess({
      tables: result.rows.map((row) => {
        const r = row as { relKind?: string; type?: string };
        if (r.relKind === 'm') {
          r.type = 'VIEW';
        }
        delete r.relKind;
        return r;
      }),
      count: result.rowCount,
    });
  } catch (error) {
    return formatError(error);
  }
}

/**
 * Tool definition for schema_list_tables
 */
export const schemaListTablesDefinition = {
  name: 'schema_list_tables',
  description:
    'List all tables and views in the database with optional filtering by schema, type, and name pattern.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      schema: {
        type: 'string',
        description: 'Filter by schema name (e.g., "public")',
      },
      type: {
        type: 'string',
        enum: ['TABLE', 'VIEW', 'ALL'],
        default: 'ALL',
        description: 'Filter by object type: TABLE, VIEW, or ALL',
      },
      pattern: {
        type: 'string',
        description: 'LIKE pattern for table name (e.g., "%user%")',
      },
    },
  },
};
