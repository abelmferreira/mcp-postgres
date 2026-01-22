import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/db/connection.js', () => ({
  getPool: vi.fn(),
}));

import { schemaListTables } from '../../../src/tools/schema-list-tables.js';
import { schemaDescribeTable } from '../../../src/tools/schema-describe-table.js';
import { schemaListColumns } from '../../../src/tools/schema-list-columns.js';
import { getPool } from '../../../src/db/connection.js';

function createMockPool() {
  return { query: vi.fn() };
}

describe('schemaListTables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return list of tables', async () => {
    const pool = createMockPool();
    vi.mocked(getPool).mockResolvedValue(pool as never);
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [
        { schema: 'public', name: 'users', type: 'TABLE', rowCount: 100 },
        { schema: 'public', name: 'orders', type: 'TABLE', rowCount: 500 },
      ],
      rowCount: 2,
      fields: [],
    });

    const result = await schemaListTables({});

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.isError).toBeUndefined();
  });

  it('should filter by schema', async () => {
    const pool = createMockPool();
    vi.mocked(getPool).mockResolvedValue(pool as never);
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [
        { schema: 'public', name: 'customers', type: 'TABLE', rowCount: 50 },
      ],
      rowCount: 1,
      fields: [],
    });

    const result = await schemaListTables({ schema: 'public' });

    expect(result.content).toHaveLength(1);
    expect(result.isError).toBeUndefined();
  });

  it('should filter by type TABLE', async () => {
    const pool = createMockPool();
    vi.mocked(getPool).mockResolvedValue(pool as never);
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [
        { schema: 'public', name: 'users', type: 'TABLE', rowCount: 100 },
      ],
      rowCount: 1,
      fields: [],
    });

    const result = await schemaListTables({ type: 'TABLE' });

    expect(result.content).toHaveLength(1);
    expect(result.isError).toBeUndefined();
  });

  it('should filter by type VIEW', async () => {
    const pool = createMockPool();
    vi.mocked(getPool).mockResolvedValue(pool as never);
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [
        { schema: 'public', name: 'active_users', type: 'VIEW', rowCount: 0 },
      ],
      rowCount: 1,
      fields: [],
    });

    const result = await schemaListTables({ type: 'VIEW' });

    expect(result.content).toHaveLength(1);
    expect(result.isError).toBeUndefined();
  });

  it('should handle empty results', async () => {
    const pool = createMockPool();
    vi.mocked(getPool).mockResolvedValue(pool as never);
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
    });

    const result = await schemaListTables({ schema: 'nonexistent' });

    expect(result.content).toHaveLength(1);
    expect(result.isError).toBeUndefined();
  });

  it('should handle pattern filter', async () => {
    const pool = createMockPool();
    vi.mocked(getPool).mockResolvedValue(pool as never);
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [
        { schema: 'public', name: 'user_profiles', type: 'TABLE', rowCount: 50 },
        { schema: 'public', name: 'user_settings', type: 'TABLE', rowCount: 30 },
      ],
      rowCount: 2,
      fields: [],
    });

    const result = await schemaListTables({ pattern: '%user%' });

    expect(result.content).toHaveLength(1);
    expect(result.isError).toBeUndefined();
  });
});

describe('schemaDescribeTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should describe table with columns', async () => {
    const pool = createMockPool();
    vi.mocked(getPool).mockResolvedValue(pool as never);
    (pool.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        rows: [
          { name: 'id', dataType: 'int', isNullable: false },
          { name: 'name', dataType: 'text', isNullable: true },
        ],
        rowCount: 2,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [{ column: 'id' }],
        rowCount: 1,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [{ rowCount: 10, sizeMB: 1 }],
        rowCount: 1,
        fields: [],
      });

    const result = await schemaDescribeTable({ table: 'users' });

    expect(result.content).toHaveLength(1);
    expect(result.isError).toBeUndefined();
  });

  it('should use default schema public', async () => {
    const pool = createMockPool();
    vi.mocked(getPool).mockResolvedValue(pool as never);
    (pool.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        rows: [
          { name: 'id', dataType: 'int', isNullable: false },
        ],
        rowCount: 1,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [{ column: 'id' }],
        rowCount: 1,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [{ rowCount: 10, sizeMB: 1 }],
        rowCount: 1,
        fields: [],
      });

    const result = await schemaDescribeTable({ table: 'users' });

    expect(result.content).toHaveLength(1);
    expect(result.isError).toBeUndefined();
  });

  it('should accept custom schema', async () => {
    const pool = createMockPool();
    vi.mocked(getPool).mockResolvedValue(pool as never);
    (pool.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        rows: [
          { name: 'id', dataType: 'int', isNullable: false },
        ],
        rowCount: 1,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [{ column: 'id' }],
        rowCount: 1,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [{ rowCount: 10, sizeMB: 1 }],
        rowCount: 1,
        fields: [],
      });

    const result = await schemaDescribeTable({ table: 'orders', schema: 'public' });

    expect(result.content).toHaveLength(1);
    expect(result.isError).toBeUndefined();
  });

  it('should handle validation error for empty table name', async () => {
    const result = await schemaDescribeTable({ table: '' });

    expect(result.isError).toBe(true);
  });
});

describe('schemaListColumns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return list of columns', async () => {
    const pool = createMockPool();
    vi.mocked(getPool).mockResolvedValue(pool as never);
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [
        { schema: 'public', table: 'users', column: 'id', dataType: 'int' },
        { schema: 'public', table: 'users', column: 'name', dataType: 'text' },
      ],
      rowCount: 2,
      fields: [],
    });

    const result = await schemaListColumns({});

    expect(result.content).toHaveLength(1);
    expect(result.isError).toBeUndefined();
  });

  it('should filter by pattern', async () => {
    const pool = createMockPool();
    vi.mocked(getPool).mockResolvedValue(pool as never);
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [
        { schema: 'public', table: 'users', column: 'user_id', dataType: 'int' },
        { schema: 'public', table: 'orders', column: 'user_id', dataType: 'int' },
      ],
      rowCount: 2,
      fields: [],
    });

    const result = await schemaListColumns({ pattern: '%user_id%' });

    expect(result.content).toHaveLength(1);
    expect(result.isError).toBeUndefined();
  });

  it('should filter by data type', async () => {
    const pool = createMockPool();
    vi.mocked(getPool).mockResolvedValue(pool as never);
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [
        { schema: 'public', table: 'users', column: 'created_at', dataType: 'timestamp' },
      ],
      rowCount: 1,
      fields: [],
    });

    const result = await schemaListColumns({ dataType: 'datetime' });

    expect(result.content).toHaveLength(1);
    expect(result.isError).toBeUndefined();
  });

  it('should filter by table name', async () => {
    const pool = createMockPool();
    vi.mocked(getPool).mockResolvedValue(pool as never);
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [
        { schema: 'public', table: 'users', column: 'id', dataType: 'int' },
      ],
      rowCount: 1,
      fields: [],
    });

    const result = await schemaListColumns({ table: 'users' });

    expect(result.content).toHaveLength(1);
    expect(result.isError).toBeUndefined();
  });
});
