import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the connection module directly
vi.mock('../../../src/db/connection.js', async () => ({
  getPool: vi.fn(),
}));

import { executeQuery, executeScalar } from '../../../src/db/execute.js';
import { getPool } from '../../../src/db/connection.js';

// Helper to create mock pool
function createMockPool(queryResult: { rows: unknown[]; rowCount: number; fields?: unknown[] }) {
  return {
    query: vi.fn().mockResolvedValue(queryResult),
  };
}

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

    expect(result.rows).toHaveLength(3);
    expect(result.rowCount).toBe(5);
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
    const mockRequest = {
      query: vi.fn().mockRejectedValue(new Error('Request timeout')),
    };
    vi.mocked(getPool).mockResolvedValue(mockRequest as never);

    await expect(executeQuery('SELECT * FROM large_table')).rejects.toThrow();
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
