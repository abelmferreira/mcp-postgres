import { executeQuery } from '../db/index.js';
import { duplicateIndexesSchema } from '../validators/schemas.js';
import { formatSuccess, formatError } from '../utils/formatters.js';
import type { ToolResponse } from '../types.js';

/**
 * Tool: analyze_duplicate_indexes
 * Find duplicate or overlapping indexes
 */
export async function analyzeDuplicateIndexes(args: unknown): Promise<ToolResponse> {
  try {
    const { table } = duplicateIndexesSchema.parse(args);

    let query = `
      WITH index_columns AS (
        SELECT
          t.oid AS table_oid,
          n.nspname AS schema_name,
          t.relname AS table_name,
          i.oid AS index_oid,
          i.relname AS index_name,
          ARRAY_AGG(a.attname ORDER BY arr.ord) AS key_columns
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_class i ON i.oid = ix.indexrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        LEFT JOIN LATERAL UNNEST(ix.indkey) WITH ORDINALITY AS arr(attnum, ord) ON true
        LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = arr.attnum
        WHERE t.relkind = 'r'
        GROUP BY t.oid, n.nspname, t.relname, i.oid, i.relname
      )
      SELECT
        ic1.schema_name AS "schema",
        ic1.table_name AS "table",
        ic1.index_name AS "index1Name",
        ic2.index_name AS "index2Name",
        ARRAY_TO_STRING(ic1.key_columns, ',') AS "index1KeyColumns",
        ARRAY_TO_STRING(ic2.key_columns, ',') AS "index2KeyColumns",
        CASE
          WHEN ic1.key_columns = ic2.key_columns THEN 'EXACT DUPLICATE'
          WHEN ic2.key_columns @> ic1.key_columns THEN 'SUBSET (index1 is prefix of index2)'
          WHEN ic1.key_columns @> ic2.key_columns THEN 'SUBSET (index2 is prefix of index1)'
          ELSE 'OVERLAPPING'
        END AS "duplicateType",
        pg_relation_size(ic1.index_oid) / 1024.0 / 1024.0 AS "index1SizeMB",
        pg_relation_size(ic2.index_oid) / 1024.0 / 1024.0 AS "index2SizeMB"
      FROM index_columns ic1
      INNER JOIN index_columns ic2
        ON ic1.table_oid = ic2.table_oid
        AND ic1.index_oid < ic2.index_oid
        AND (
          ic1.key_columns = ic2.key_columns
          OR ic2.key_columns @> ic1.key_columns
          OR ic1.key_columns @> ic2.key_columns
        )
      WHERE 1=1
    `;

    const params: Record<string, string> = {};

    if (table) {
      query += ` AND ic1.table_name = @table`;
      params.table = table;
    }

    query += `
      ORDER BY ic1.schema_name, ic1.table_name, ic1.index_name
    `;

    const result = await executeQuery(query, params, 100);

    // Calculate potential space savings
    const duplicates = result.rows.map((row) => {
      const r = row as {
        duplicateType: string;
        index1SizeMB: number;
        index2SizeMB: number;
        index1Name: string;
        index2Name: string;
      };
      return {
        ...r,
        recommendation:
          r.duplicateType === 'EXACT DUPLICATE'
            ? `Consider dropping one of these indexes. Suggested: DROP INDEX [${r.index2Name}]`
            : r.duplicateType === 'SAME KEY COLUMNS'
              ? 'Consider consolidating these indexes if possible'
              : r.duplicateType.startsWith('SUBSET')
                ? 'The larger index may cover queries for the smaller one'
                : 'Review if both indexes are necessary',
      };
    });

    const totalDuplicateSizeMB = duplicates.reduce((sum, row) => {
      if (row.duplicateType === 'EXACT DUPLICATE') {
        return sum + Math.min(row.index1SizeMB || 0, row.index2SizeMB || 0);
      }
      return sum;
    }, 0);

    return formatSuccess({
      duplicateIndexes: duplicates,
      count: result.rowCount,
      potentialSpaceSavingsMB: Math.round(totalDuplicateSizeMB * 100) / 100,
      note: 'Duplicate indexes waste space and slow down writes. Consider consolidating or removing redundant indexes.',
    });
  } catch (error) {
    return formatError(error);
  }
}

/**
 * Tool definition for analyze_duplicate_indexes
 */
export const analyzeDuplicateIndexesDefinition = {
  name: 'analyze_duplicate_indexes',
  description:
    'Find duplicate or overlapping indexes that could be consolidated or removed.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      table: {
        type: 'string',
        description: 'Filter for a specific table',
      },
    },
  },
};
