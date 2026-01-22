import { executeQuery } from '../db/index.js';
import { listColumnsSchema } from '../validators/schemas.js';
import { formatSuccess, formatError } from '../utils/formatters.js';
import type { ToolResponse } from '../types.js';

/**
 * Tool: schema_list_columns
 * Search for columns across all tables
 */
export async function schemaListColumns(args: unknown): Promise<ToolResponse> {
  try {
    const { pattern, dataType, table, schema } = listColumnsSchema.parse(args);

    let query = `
      SELECT
        c.table_schema AS "schema",
        c.table_name AS "table",
        c.column_name AS "column",
        c.data_type AS "dataType",
        c.character_maximum_length AS "maxLength",
        c.numeric_precision AS "precision",
        c.numeric_scale AS "scale",
        c.is_nullable = 'YES' AS "isNullable",
        d.description AS "description"
      FROM information_schema.columns c
      LEFT JOIN pg_namespace n ON n.nspname = c.table_schema
      LEFT JOIN pg_class cls ON cls.relname = c.table_name AND cls.relnamespace = n.oid
      LEFT JOIN pg_attribute a ON a.attrelid = cls.oid AND a.attname = c.column_name
      LEFT JOIN pg_description d ON d.objoid = cls.oid AND d.objsubid = a.attnum
      WHERE 1=1
    `;

    const params: Record<string, string> = {};

    if (pattern) {
      query += ` AND c.column_name LIKE @pattern`;
      params.pattern = pattern;
    }

    if (dataType) {
      query += ` AND c.data_type = @dataType`;
      params.dataType = dataType;
    }

    if (table) {
      query += ` AND c.table_name = @table`;
      params.table = table;
    }

    if (schema) {
      query += ` AND c.table_schema = @schema`;
      params.schema = schema;
    }

    query += ` ORDER BY c.table_schema, c.table_name, c.ordinal_position`;

    const result = await executeQuery(query, params, 1000);

    return formatSuccess({
      columns: result.rows,
      count: result.rowCount,
    });
  } catch (error) {
    return formatError(error);
  }
}

/**
 * Tool definition for schema_list_columns
 */
export const schemaListColumnsDefinition = {
  name: 'schema_list_columns',
  description:
    'Search for columns across all tables with optional filtering by name pattern, data type, table, and schema.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      pattern: {
        type: 'string',
        description: 'LIKE pattern for column name (e.g., "%id%")',
      },
      dataType: {
        type: 'string',
        description: 'Filter by data type (e.g., "int", "varchar")',
      },
      table: {
        type: 'string',
        description: 'Filter by table name',
      },
      schema: {
        type: 'string',
        description: 'Filter by schema name',
      },
    },
  },
};
