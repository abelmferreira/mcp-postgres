import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pg before importing the module
vi.mock('pg', () => {
  class MockPool {
    query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0, fields: [] });
    on = vi.fn();
    end = vi.fn().mockResolvedValue(undefined);
  }

  return { Pool: MockPool };
});

describe('Database Connection', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset modules to clear singleton state
    vi.resetModules();
    // Re-mock pg after reset
    vi.doMock('pg', () => {
      class MockPool {
        query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0, fields: [] });
        on = vi.fn();
        end = vi.fn().mockResolvedValue(undefined);
      }

      return { Pool: MockPool };
    });
  });

  describe('getPool', () => {
    it('should create a connection pool', async () => {
      const { getPool } = await import('../../../src/db/connection.js');
      const pool = await getPool();

      expect(pool).toBeDefined();
      expect(pool.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should reuse existing pool on subsequent calls', async () => {
      const { getPool } = await import('../../../src/db/connection.js');

      const pool1 = await getPool();
      const pool2 = await getPool();

      expect(pool1).toBe(pool2);
      expect(pool1.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('isConnected', () => {
    it('should return connection status', async () => {
      const { getPool, isConnected } = await import('../../../src/db/connection.js');

      await getPool();
      const connected = isConnected();

      expect(typeof connected).toBe('boolean');
      expect(connected).toBe(true);
    });
  });

  describe('getPoolStats', () => {
    it('should return pool statistics', async () => {
      const { getPool, getPoolStats } = await import('../../../src/db/connection.js');

      await getPool();
      const stats = getPoolStats();

      expect(stats).toHaveProperty('min');
      expect(stats).toHaveProperty('max');
      expect(stats).toHaveProperty('connected');
      expect(stats.connected).toBe(true);
    });
  });

  describe('closePool', () => {
    it('should close the pool without error', async () => {
      const { getPool, closePool } = await import('../../../src/db/connection.js');

      await getPool();
      await expect(closePool()).resolves.not.toThrow();
    });
  });
});
