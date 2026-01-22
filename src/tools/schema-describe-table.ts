import { executeQuery } from '../db/index.js';
import { describeTableSchema } from '../validators/schemas.js';
import { formatSuccess, formatError } from '../utils/formatters.js';
import type { ToolResponse } from '../types.js';

/**
 * Tool: schema_describe_table
 * Get detailed information about a table's structure
 */
export async function schemaDescribeTable(args: unknown): Promise<ToolResponse> {
  try {
    const { table, schema } = describeTableSchema.parse(args);

    // Get columns with detailed info
    const columnsQuery = `
      SELECT
        c.column_name AS "name",
        c.data_type AS "dataType",
        c.character_maximum_length AS "maxLength",
        c.numeric_precision AS "precision",
        c.numeric_scale AS "scale",
        c.is_nullable = 'YES' AS "isNullable",
        c.column_default AS "defaultValue",
        d.description AS "description"
      FROM information_schema.columns c
      LEFT JOIN pg_namespace n ON n.nspname = c.table_schema
      LEFT JOIN pg_class cls ON cls.relname = c.table_name AND cls.relnamespace = n.oid
      LEFT JOIN pg_attribute a ON a.attrelid = cls.oid AND a.attname = c.column_name
      LEFT JOIN pg_description d ON d.objoid = cls.oid AND d.objsubid = a.attnum
      WHERE c.table_name = @table
        AND c.table_schema = @schema
      ORDER BY c.ordinal_position
    `;

    // Get primary key columns
    const pkQuery = `
      SELECT
        kcu.column_name AS "column"
      FROM information_schema.table_constraints tc
      INNER JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_name = @table
        AND tc.table_schema = @schema
      ORDER BY kcu.ordinal_position
    `;

    // Get foreign keys
    const fkQuery = `
      SELECT
        tc.constraint_name AS "name",
        kcu.column_name AS "column",
        ccu.table_schema AS "referencedSchema",
        ccu.table_name AS "referencedTable",
        ccu.column_name AS "referencedColumn"
      FROM information_schema.table_constraints tc
      INNER JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      INNER JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = @table
        AND tc.table_schema = @schema
    `;

    // Get indexes
    const indexQuery = `
      SELECT
        i.relname AS "name",
        am.amname AS "type",
        ix.indisunique AS "isUnique",
        ix.indisprimary AS "isPrimaryKey",
        STRING_AGG(a.attname, ', ' ORDER BY arr.ord) AS "columns"
      FROM pg_index ix
      INNER JOIN pg_class t ON t.oid = ix.indrelid
      INNER JOIN pg_namespace n ON n.oid = t.relnamespace
      INNER JOIN pg_class i ON i.oid = ix.indexrelid
      INNER JOIN pg_am am ON am.oid = i.relam
      LEFT JOIN LATERAL UNNEST(ix.indkey) WITH ORDINALITY AS arr(attnum, ord) ON true
      LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = arr.attnum
      WHERE t.relname = @table
        AND n.nspname = @schema
      GROUP BY i.relname, am.amname, ix.indisunique, ix.indisprimary
    `;

    // Get table stats
    const statsQuery = `
      SELECT
        c.reltuples::bigint AS "rowCount",
        pg_total_relation_size(c.oid) / 1024.0 / 1024.0 AS "sizeMB"
      FROM pg_class c
      INNER JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = @table
        AND n.nspname = @schema
        AND c.relkind = 'r'
    `;

    const params = { table, schema };

    const [columns, pk, fk, indexes, stats] = await Promise.all([
      executeQuery(columnsQuery, params, 500),
      executeQuery(pkQuery, params, 50),
      executeQuery(fkQuery, params, 100),
      executeQuery(indexQuery, params, 100),
      executeQuery(statsQuery, params, 1),
    ]);

    return formatSuccess({
      schema,
      table,
      columns: columns.rows,
      primaryKey: pk.rows.map((r) => (r as { column: string }).column),
      foreignKeys: fk.rows,
      indexes: indexes.rows,
      stats: stats.rows[0] || null,
    });
  } catch (error) {
    return formatError(error);
  }
}

/**
 * Tool definition for schema_describe_table
 */
export const schemaDescribeTableDefinition = {
  name: 'schema_describe_table',
  description:
    'Get detailed information about a table including columns, primary key, foreign keys, indexes, and statistics.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      table: {
        type: 'string',
        description: 'Table name to describe',
      },
      schema: {
        type: 'string',
        default: 'public',
        description: 'Schema name (default: public)',
      },
    },
    required: ['table'],
  },
};
