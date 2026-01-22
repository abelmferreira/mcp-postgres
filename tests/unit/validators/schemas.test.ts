import { describe, it, expect } from 'vitest';
import {
  sqlParamValueSchema,
  sqlParamsSchema,
  paginationSchema,
  tableFilterSchema,
  sqlExecuteSchema,
  listTablesSchema,
  describeTableSchema,
  listColumnsSchema,
  activeQueriesSchema,
  waitStatsSchema,
  sqlInsertSchema,
  sqlUpdateSchema,
  sqlDeleteSchema,
} from '../../../src/validators/schemas.js';

describe('sqlParamValueSchema', () => {
  it('should accept string values', () => {
    expect(sqlParamValueSchema.parse('test')).toBe('test');
  });

  it('should accept number values', () => {
    expect(sqlParamValueSchema.parse(123)).toBe(123);
    expect(sqlParamValueSchema.parse(12.5)).toBe(12.5);
  });

  it('should accept boolean values', () => {
    expect(sqlParamValueSchema.parse(true)).toBe(true);
    expect(sqlParamValueSchema.parse(false)).toBe(false);
  });

  it('should accept null values', () => {
    expect(sqlParamValueSchema.parse(null)).toBe(null);
  });

  it('should reject objects', () => {
    expect(() => sqlParamValueSchema.parse({ foo: 'bar' })).toThrow();
  });

  it('should reject arrays', () => {
    expect(() => sqlParamValueSchema.parse([1, 2, 3])).toThrow();
  });

  it('should reject undefined', () => {
    expect(() => sqlParamValueSchema.parse(undefined)).toThrow();
  });
});

describe('sqlParamsSchema', () => {
  it('should accept empty object', () => {
    expect(sqlParamsSchema.parse({})).toEqual({});
  });

  it('should default to empty object when undefined', () => {
    expect(sqlParamsSchema.parse(undefined)).toEqual({});
  });

  it('should accept valid parameter object', () => {
    const params = { userId: 123, name: 'test', active: true };
    expect(sqlParamsSchema.parse(params)).toEqual(params);
  });

  it('should reject invalid parameter values', () => {
    expect(() => sqlParamsSchema.parse({ obj: { nested: true } })).toThrow();
  });
});

describe('paginationSchema', () => {
  it('should apply default values', () => {
    const result = paginationSchema.parse({});
    expect(result.limit).toBe(100);
    expect(result.offset).toBe(0);
  });

  it('should accept valid values', () => {
    const result = paginationSchema.parse({ limit: 50, offset: 10 });
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(10);
  });

  it('should reject negative limit', () => {
    expect(() => paginationSchema.parse({ limit: -1 })).toThrow();
  });

  it('should reject negative offset', () => {
    expect(() => paginationSchema.parse({ offset: -5 })).toThrow();
  });

  it('should reject limit over 5000', () => {
    expect(() => paginationSchema.parse({ limit: 6000 })).toThrow();
  });

  it('should reject non-integer limit', () => {
    expect(() => paginationSchema.parse({ limit: 10.5 })).toThrow();
  });
});

describe('tableFilterSchema', () => {
  it('should accept empty object', () => {
    const result = tableFilterSchema.parse({});
    expect(result).toEqual({});
  });

  it('should accept all optional fields', () => {
    const result = tableFilterSchema.parse({
      schema: 'public',
      table: 'users',
      pattern: '%user%',
    });
    expect(result.schema).toBe('public');
    expect(result.table).toBe('users');
    expect(result.pattern).toBe('%user%');
  });
});

describe('sqlExecuteSchema', () => {
  it('should require query', () => {
    expect(() => sqlExecuteSchema.parse({})).toThrow();
  });

  it('should reject empty query', () => {
    expect(() => sqlExecuteSchema.parse({ query: '' })).toThrow();
  });

  it('should apply defaults', () => {
    const result = sqlExecuteSchema.parse({ query: 'SELECT 1' });
    expect(result.params).toEqual({});
    expect(result.maxRows).toBe(100);
  });

  it('should accept full valid input', () => {
    const result = sqlExecuteSchema.parse({
      query: 'SELECT * FROM users WHERE id = @id',
      params: { id: 123 },
      maxRows: 500,
    });
    expect(result.query).toBe('SELECT * FROM users WHERE id = @id');
    expect(result.params).toEqual({ id: 123 });
    expect(result.maxRows).toBe(500);
  });

  it('should reject maxRows over 5000', () => {
    expect(() =>
      sqlExecuteSchema.parse({ query: 'SELECT 1', maxRows: 10000 })
    ).toThrow();
  });
});

describe('listTablesSchema', () => {
  it('should apply defaults', () => {
    const result = listTablesSchema.parse({});
    expect(result.type).toBe('ALL');
  });

  it('should accept valid type values', () => {
    expect(listTablesSchema.parse({ type: 'TABLE' }).type).toBe('TABLE');
    expect(listTablesSchema.parse({ type: 'VIEW' }).type).toBe('VIEW');
    expect(listTablesSchema.parse({ type: 'ALL' }).type).toBe('ALL');
  });

  it('should reject invalid type values', () => {
    expect(() => listTablesSchema.parse({ type: 'INVALID' })).toThrow();
  });
});

describe('describeTableSchema', () => {
  it('should require table name', () => {
    expect(() => describeTableSchema.parse({})).toThrow();
  });

  it('should reject empty table name', () => {
    expect(() => describeTableSchema.parse({ table: '' })).toThrow();
  });

  it('should apply default schema', () => {
    const result = describeTableSchema.parse({ table: 'users' });
    expect(result.schema).toBe('public');
  });

  it('should accept custom schema', () => {
    const result = describeTableSchema.parse({ table: 'users', schema: 'sales' });
    expect(result.schema).toBe('sales');
  });
});

describe('listColumnsSchema', () => {
  it('should accept empty object', () => {
    const result = listColumnsSchema.parse({});
    expect(result).toEqual({});
  });

  it('should accept all filters', () => {
    const result = listColumnsSchema.parse({
      pattern: '%id%',
      dataType: 'int',
      table: 'users',
      schema: 'public',
    });
    expect(result.pattern).toBe('%id%');
    expect(result.dataType).toBe('int');
  });
});

describe('activeQueriesSchema', () => {
  it('should apply defaults', () => {
    const result = activeQueriesSchema.parse({});
    expect(result.minDurationMs).toBe(0);
    expect(result.includeSystemQueries).toBe(false);
  });

  it('should accept valid values', () => {
    const result = activeQueriesSchema.parse({
      minDurationMs: 5000,
      includeSystemQueries: true,
    });
    expect(result.minDurationMs).toBe(5000);
    expect(result.includeSystemQueries).toBe(true);
  });

  it('should reject negative minDurationMs', () => {
    expect(() => activeQueriesSchema.parse({ minDurationMs: -100 })).toThrow();
  });
});

describe('waitStatsSchema', () => {
  it('should apply defaults', () => {
    const result = waitStatsSchema.parse({});
    expect(result.top).toBe(10);
    expect(result.excludeIdle).toBe(true);
  });

  it('should reject top over 100', () => {
    expect(() => waitStatsSchema.parse({ top: 150 })).toThrow();
  });
});

describe('sqlInsertSchema', () => {
  it('should require table and data', () => {
    expect(() => sqlInsertSchema.parse({})).toThrow();
  });

  it('should apply default schema', () => {
    const result = sqlInsertSchema.parse({
      table: 'users',
      data: { name: 'test' },
    });
    expect(result.schema).toBe('public');
  });

  it('should accept valid input', () => {
    const result = sqlInsertSchema.parse({
      table: 'users',
      schema: 'sales',
      data: { name: 'John', age: 30, active: true },
    });
    expect(result.table).toBe('users');
    expect(result.schema).toBe('sales');
    expect(result.data).toEqual({ name: 'John', age: 30, active: true });
  });
});

describe('sqlUpdateSchema', () => {
  it('should require table, data, and where', () => {
    expect(() => sqlUpdateSchema.parse({})).toThrow();
    expect(() => sqlUpdateSchema.parse({ table: 'users' })).toThrow();
    expect(() =>
      sqlUpdateSchema.parse({ table: 'users', data: { name: 'x' } })
    ).toThrow();
  });

  it('should reject empty where clause', () => {
    expect(() =>
      sqlUpdateSchema.parse({
        table: 'users',
        data: { name: 'x' },
        where: '',
      })
    ).toThrow();
  });

  it('should accept valid input', () => {
    const result = sqlUpdateSchema.parse({
      table: 'users',
      data: { name: 'John' },
      where: 'id = @id',
      params: { id: 123 },
    });
    expect(result.table).toBe('users');
    expect(result.where).toBe('id = @id');
    expect(result.params).toEqual({ id: 123 });
  });
});

describe('sqlDeleteSchema', () => {
  it('should require table and where', () => {
    expect(() => sqlDeleteSchema.parse({})).toThrow();
    expect(() => sqlDeleteSchema.parse({ table: 'users' })).toThrow();
  });

  it('should reject empty where clause', () => {
    expect(() =>
      sqlDeleteSchema.parse({
        table: 'users',
        where: '',
      })
    ).toThrow();
  });

  it('should accept valid input', () => {
    const result = sqlDeleteSchema.parse({
      table: 'users',
      where: 'id = @id',
      params: { id: 123 },
    });
    expect(result.table).toBe('users');
    expect(result.where).toBe('id = @id');
  });
});
