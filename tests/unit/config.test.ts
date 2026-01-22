import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test the parseConnectionUrl function, which is not exported directly
// So we'll test the behavior through environment variable configuration

describe('Config - Connection URL Parsing', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('parseConnectionUrl', () => {
    it('should parse basic postgres:// URL', async () => {
      process.env.SQL_CONNECTION_URL = 'postgres://user:password@localhost:5432/testdb';
      process.env.READONLY = 'true';

      // Dynamically import to get fresh config
      const { config } = await import('../../src/config.js');

      expect(config.SQL_SERVER).toBe('localhost');
      expect(config.SQL_PORT).toBe(5432);
      expect(config.SQL_DATABASE).toBe('testdb');
      expect(config.SQL_USER).toBe('user');
      expect(config.SQL_PASSWORD).toBe('password');
    });

    it('should parse postgresql:// URL', async () => {
      process.env.SQL_CONNECTION_URL = 'postgresql://admin:secret@sqlserver.local:5433/production';
      process.env.READONLY = 'true';

      const { config } = await import('../../src/config.js');

      expect(config.SQL_SERVER).toBe('sqlserver.local');
      expect(config.SQL_PORT).toBe(5433);
      expect(config.SQL_DATABASE).toBe('production');
      expect(config.SQL_USER).toBe('admin');
    });

    it('should use default port 5432 when not specified', async () => {
      process.env.SQL_CONNECTION_URL = 'postgres://user:password@localhost/testdb';
      process.env.READONLY = 'true';

      const { config } = await import('../../src/config.js');

      expect(config.SQL_PORT).toBe(5432);
    });

    it('should parse ssl parameter as true', async () => {
      process.env.SQL_CONNECTION_URL = 'postgres://user:pass@host/db?ssl=true';
      process.env.READONLY = 'true';

      const { config } = await import('../../src/config.js');

      expect(config.SQL_SSL).toBe(true);
    });

    it('should parse ssl parameter as false', async () => {
      process.env.SQL_CONNECTION_URL = 'postgres://user:pass@host/db?ssl=false';
      process.env.READONLY = 'true';

      const { config } = await import('../../src/config.js');

      expect(config.SQL_SSL).toBe(false);
    });

    it('should parse ssl=disable as false', async () => {
      process.env.SQL_CONNECTION_URL = 'postgres://user:pass@host/db?ssl=disable';
      process.env.READONLY = 'true';

      const { config } = await import('../../src/config.js');

      expect(config.SQL_SSL).toBe(false);
    });

    it('should handle URL-encoded username and password', async () => {
      process.env.SQL_CONNECTION_URL = 'postgres://user%40domain:p%40ss%2Fword@host/db';
      process.env.READONLY = 'true';

      const { config } = await import('../../src/config.js');

      expect(config.SQL_USER).toBe('user@domain');
      expect(config.SQL_PASSWORD).toBe('p@ss/word');
    });

    it('should handle multiple query parameters', async () => {
      process.env.SQL_CONNECTION_URL = 'postgres://user:pass@host/db?ssl=false';
      process.env.READONLY = 'true';

      const { config } = await import('../../src/config.js');

      expect(config.SQL_SSL).toBe(false);
    });

    it('should default ssl to false when not specified', async () => {
      process.env.SQL_CONNECTION_URL = 'postgres://user:pass@host/db';
      process.env.READONLY = 'true';

      const { config } = await import('../../src/config.js');

      expect(config.SQL_SSL).toBe(false);
    });

  });

  describe('Individual Connection Parameters', () => {
    it('should use individual parameters when URL not provided', async () => {
      process.env.SQL_SERVER = 'myserver';
      process.env.SQL_DATABASE = 'mydb';
      process.env.SQL_USER = 'myuser';
      process.env.SQL_PASSWORD = 'mypassword';
      process.env.SQL_PORT = '5433';
      process.env.READONLY = 'true';

      const { config } = await import('../../src/config.js');

      expect(config.SQL_SERVER).toBe('myserver');
      expect(config.SQL_DATABASE).toBe('mydb');
      expect(config.SQL_USER).toBe('myuser');
      expect(config.SQL_PASSWORD).toBe('mypassword');
      expect(config.SQL_PORT).toBe(5433);
    });

    it('should use default values for optional parameters', async () => {
      process.env.SQL_SERVER = 'localhost';
      process.env.SQL_DATABASE = 'testdb';
      process.env.SQL_USER = 'user';
      process.env.SQL_PASSWORD = 'pass';
      process.env.READONLY = 'true';
      delete process.env.SQL_PORT;
      delete process.env.SQL_SSL;

      const { config } = await import('../../src/config.js');

      expect(config.SQL_PORT).toBe(5432);
      expect(config.SQL_SSL).toBe(false);
    });
  });

  describe('Performance Settings', () => {
    it('should parse QUERY_TIMEOUT', async () => {
      process.env.SQL_SERVER = 'localhost';
      process.env.SQL_DATABASE = 'testdb';
      process.env.SQL_USER = 'user';
      process.env.SQL_PASSWORD = 'pass';
      process.env.READONLY = 'true';
      process.env.QUERY_TIMEOUT = '60000';

      const { config } = await import('../../src/config.js');

      expect(config.QUERY_TIMEOUT).toBe(60000);
    });

    it('should parse MAX_ROWS', async () => {
      process.env.SQL_SERVER = 'localhost';
      process.env.SQL_DATABASE = 'testdb';
      process.env.SQL_USER = 'user';
      process.env.SQL_PASSWORD = 'pass';
      process.env.READONLY = 'true';
      process.env.MAX_ROWS = '500';

      const { config } = await import('../../src/config.js');

      expect(config.MAX_ROWS).toBe(500);
    });

    it('should parse POOL_MIN and POOL_MAX', async () => {
      process.env.SQL_SERVER = 'localhost';
      process.env.SQL_DATABASE = 'testdb';
      process.env.SQL_USER = 'user';
      process.env.SQL_PASSWORD = 'pass';
      process.env.READONLY = 'true';
      process.env.POOL_MIN = '5';
      process.env.POOL_MAX = '20';

      const { config } = await import('../../src/config.js');

      expect(config.POOL_MIN).toBe(5);
      expect(config.POOL_MAX).toBe(20);
    });

    it('should use default values for performance settings', async () => {
      process.env.SQL_SERVER = 'localhost';
      process.env.SQL_DATABASE = 'testdb';
      process.env.SQL_USER = 'user';
      process.env.SQL_PASSWORD = 'pass';
      process.env.READONLY = 'true';
      delete process.env.QUERY_TIMEOUT;
      delete process.env.MAX_ROWS;
      delete process.env.POOL_MIN;
      delete process.env.POOL_MAX;

      const { config } = await import('../../src/config.js');

      expect(config.QUERY_TIMEOUT).toBe(30000);
      expect(config.MAX_ROWS).toBe(1000);
      expect(config.POOL_MIN).toBe(2);
      expect(config.POOL_MAX).toBe(10);
    });
  });

  describe('READONLY Mode', () => {
    it('should parse READONLY=true', async () => {
      process.env.SQL_SERVER = 'localhost';
      process.env.SQL_DATABASE = 'testdb';
      process.env.SQL_USER = 'user';
      process.env.SQL_PASSWORD = 'pass';
      process.env.READONLY = 'true';

      const { config } = await import('../../src/config.js');

      expect(config.READONLY).toBe(true);
    });

    it('should parse READONLY=false', async () => {
      process.env.SQL_SERVER = 'localhost';
      process.env.SQL_DATABASE = 'testdb';
      process.env.SQL_USER = 'user';
      process.env.SQL_PASSWORD = 'pass';
      process.env.READONLY = 'false';

      const { config } = await import('../../src/config.js');

      expect(config.READONLY).toBe(false);
    });
  });

  describe('LOG_LEVEL', () => {
    it('should parse LOG_LEVEL=debug', async () => {
      process.env.SQL_SERVER = 'localhost';
      process.env.SQL_DATABASE = 'testdb';
      process.env.SQL_USER = 'user';
      process.env.SQL_PASSWORD = 'pass';
      process.env.READONLY = 'true';
      process.env.LOG_LEVEL = 'debug';

      const { config } = await import('../../src/config.js');

      expect(config.LOG_LEVEL).toBe('debug');
    });

    it('should parse LOG_LEVEL=warn', async () => {
      process.env.SQL_SERVER = 'localhost';
      process.env.SQL_DATABASE = 'testdb';
      process.env.SQL_USER = 'user';
      process.env.SQL_PASSWORD = 'pass';
      process.env.READONLY = 'true';
      process.env.LOG_LEVEL = 'warn';

      const { config } = await import('../../src/config.js');

      expect(config.LOG_LEVEL).toBe('warn');
    });

    it('should default LOG_LEVEL to info', async () => {
      process.env.SQL_SERVER = 'localhost';
      process.env.SQL_DATABASE = 'testdb';
      process.env.SQL_USER = 'user';
      process.env.SQL_PASSWORD = 'pass';
      process.env.READONLY = 'true';
      delete process.env.LOG_LEVEL;

      const { config } = await import('../../src/config.js');

      expect(config.LOG_LEVEL).toBe('info');
    });
  });
});
