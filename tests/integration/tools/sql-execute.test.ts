import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the connection module directly
vi.mock('../../../src/db/connection.js', async () => ({
  getPool: vi.fn(),
}));

import { executeQuery, executeScalar } from '../../../src/db/execute.js';
import { getPool } from '../../../src/db/connection.js';

import { createMockPool } from '../../mocks/pg-pool.js';

describe('executeQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute a simple SELECT query', async () => {
    const mockRequest = createMockPool({
      rows: [{ id: 1, name: 'Test' }],
      rowCount: 1,
      fields: [],
    });
    vi.mocked(getPool).mockResolvedValue(mockRequest as never);

    const result = await executeQuery('SELECT * FROM users');

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({ id: 1, name: 'Test' });
    expect(result.rowCount).toBe(1);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('should execute query with parameters', async () => {
    const mockRequest = createMockPool({
      rows: [{ id: 1, name: 'John' }],
      rowCount: 1,
      fields: [],
    });
    vi.mocked(getPool).mockResolvedValue(mockRequest as never);

    const result = await executeQuery(
      'SELECT * FROM users WHERE id = @id',
      { id: 1 }
    );

    expect(mockRequest.query).toHaveBeenCalled();
    expect(result.rows).toHaveLength(1);
  });

  it('should respect maxRows limit', async () => {
    const mockRequest = createMockPool({
      rows: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }],
      rowCount: 5,
      fields: [],
    });
    vi.mocked(getPool).mockResolvedValue(mockRequest as never);

    const result = await executeQuery('SELECT * FROM users', {}, 3);

    // the limit goes to the server: only limit + 1 rows are fetched
    expect(mockRequest.cursorReads).toEqual([4]);
    expect(result.rows).toHaveLength(3);
    expect(result.rowCount).toBe(3);
    expect(result.truncated).toBe(true);
  });

  it('should not flag truncated when rows fit the limit', async () => {
    const mockRequest = createMockPool({ rows: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    vi.mocked(getPool).mockResolvedValue(mockRequest as never);

    const result = await executeQuery('SELECT * FROM users', {}, 3);

    expect(result.rows).toHaveLength(3);
    expect(result.truncated).toBe(false);
  });

  it('should cap maxRows at MAX_ROWS', async () => {
    const mockRequest = createMockPool({ rows: [] });
    vi.mocked(getPool).mockResolvedValue(mockRequest as never);

    await executeQuery('SELECT * FROM users', {}, 999999);

    // MAX_ROWS=1000 in tests/setup.ts
    expect(mockRequest.cursorReads).toEqual([1001]);
  });

  it('should run inside a READ ONLY transaction and roll back', async () => {
    const mockRequest = createMockPool({ rows: [{ id: 1 }] });
    vi.mocked(getPool).mockResolvedValue(mockRequest as never);

    await executeQuery('SELECT * FROM users WHERE id = @id', { id: 1 });

    expect(mockRequest.statements).toEqual([
      'BEGIN TRANSACTION READ ONLY',
      'SELECT 1',
      'SELECT * FROM users WHERE id = $1',
      'ROLLBACK',
    ]);
    expect(mockRequest.client.release).toHaveBeenCalledWith(false);
  });

  it('should roll back and release the client when the query fails', async () => {
    const mockRequest = createMockPool(new Error('relation "nope" does not exist'));
    vi.mocked(getPool).mockResolvedValue(mockRequest as never);

    await expect(executeQuery('SELECT * FROM nope')).rejects.toThrow('does not exist');

    expect(mockRequest.statements.at(-1)).toBe('ROLLBACK');
    expect(mockRequest.client.release).toHaveBeenCalledTimes(1);
  });

  it('should handle empty results', async () => {
    const mockRequest = createMockPool({
      rows: [],
      rowCount: 0,
      fields: [],
    });
    vi.mocked(getPool).mockResolvedValue(mockRequest as never);

    const result = await executeQuery('SELECT * FROM users WHERE 1=0');

    expect(result.rows).toHaveLength(0);
    expect(result.rowCount).toBe(0);
  });

  it('should bind string parameters correctly', async () => {
    const mockRequest = createMockPool({ rows: [], rowCount: 0, fields: [] });
    vi.mocked(getPool).mockResolvedValue(mockRequest as never);

    await executeQuery('SELECT * FROM users WHERE name = @name', { name: 'John' });

    expect(mockRequest.query).toHaveBeenCalled();
  });

  it('should bind multiple parameters', async () => {
    const mockRequest = createMockPool({ rows: [], rowCount: 0, fields: [] });
    vi.mocked(getPool).mockResolvedValue(mockRequest as never);

    await executeQuery(
      'SELECT * FROM users WHERE id = @id AND score = @score',
      { id: 42, score: 98.5 }
    );

    expect(mockRequest.query).toHaveBeenCalled();
  });

  it('should bind boolean parameters', async () => {
    const mockRequest = createMockPool({ rows: [], rowCount: 0, fields: [] });
    vi.mocked(getPool).mockResolvedValue(mockRequest as never);

    await executeQuery('SELECT * FROM users WHERE active = @active', { active: true });

    expect(mockRequest.query).toHaveBeenCalled();
  });

  it('should bind null parameters', async () => {
    const mockRequest = createMockPool({ rows: [], rowCount: 0, fields: [] });
    vi.mocked(getPool).mockResolvedValue(mockRequest as never);

    await executeQuery('SELECT * FROM users WHERE email = @email', { email: null });

    expect(mockRequest.query).toHaveBeenCalled();
  });

  it('should reject INSERT queries in READONLY mode', async () => {
    await expect(
      executeQuery('INSERT INTO users (name) VALUES (@name)', { name: 'Test' })
    ).rejects.toThrow();
  });

  it('should reject DELETE queries in READONLY mode', async () => {
    await expect(
      executeQuery('DELETE FROM users WHERE id = @id', { id: 1 })
    ).rejects.toThrow();
  });

  it('should reject UPDATE queries in READONLY mode', async () => {
    await expect(
      executeQuery('UPDATE users SET name = @name', { name: 'Test' })
    ).rejects.toThrow();
  });

  it('should handle query timeout errors', async () => {
    const mockRequest = createMockPool(new Error('canceling statement due to statement timeout'));
    vi.mocked(getPool).mockResolvedValue(mockRequest as never);

    await expect(executeQuery('SELECT * FROM large_table')).rejects.toThrow(/timed out|timeout/i);
  });
});

describe('executeScalar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return single value', async () => {
    const mockRequest = createMockPool({
      rows: [{ count: 42 }],
      rowCount: 1,
      fields: [],
    });
    vi.mocked(getPool).mockResolvedValue(mockRequest as never);

    const result = await executeScalar<number>('SELECT COUNT(*) as count FROM users');

    expect(result).toBe(42);
  });

  it('should return null for empty result', async () => {
    const mockRequest = createMockPool({
      rows: [],
      rowCount: 0,
      fields: [],
    });
    vi.mocked(getPool).mockResolvedValue(mockRequest as never);

    const result = await executeScalar<number>('SELECT 1 WHERE 1=0');

    expect(result).toBeNull();
  });

  it('should return first column of first row', async () => {
    const mockRequest = createMockPool({
      rows: [{ a: 'first', b: 'second' }],
      rowCount: 1,
      fields: [],
    });
    vi.mocked(getPool).mockResolvedValue(mockRequest as never);

    const result = await executeScalar<string>('SELECT a, b FROM table1');

    expect(result).toBe('first');
  });
});
