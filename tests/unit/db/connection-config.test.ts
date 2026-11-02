import { describe, it, expect, afterEach, vi } from 'vitest';
import { sqlConfig, READONLY_SESSION_OPTIONS } from '../../../src/db/connection.js';

describe('pool config in READONLY mode', () => {
  it('opens every session with default_transaction_read_only=on', () => {
    expect(READONLY_SESSION_OPTIONS).toBe('-c default_transaction_read_only=on');
    expect(sqlConfig.options).toBe(READONLY_SESSION_OPTIONS);
  });

  it('keeps statement_timeout and sets idle_in_transaction_session_timeout', () => {
    // QUERY_TIMEOUT=30000 in tests/setup.ts
    expect(sqlConfig.statement_timeout).toBe(30000);
    expect(sqlConfig.idle_in_transaction_session_timeout).toBe(35000);
  });
});

describe('pool config through the SSH tunnel', () => {
  it('connects to the local tunnel end and keeps READONLY options', async () => {
    const { buildPoolConfig } = await import('../../../src/db/connection.js');
    const cfg = buildPoolConfig('127.0.0.1', 40000, true);
    expect(cfg.host).toBe('127.0.0.1');
    expect(cfg.port).toBe(40000);
    expect(cfg.options).toBe(READONLY_SESSION_OPTIONS);
    expect(cfg.ssl).toBe(false); // SQL_SSL=false in tests/setup.ts
  });

  describe('with SQL_SSL=true', () => {
    const originalEnv = process.env;
    afterEach(() => {
      process.env = originalEnv;
      vi.resetModules();
    });

    async function load(server: string) {
      vi.resetModules();
      process.env = { ...originalEnv, SQL_SSL: 'true', SQL_SERVER: server };
      return import('../../../src/db/connection.js');
    }

    it('sends the real SQL_SERVER as TLS servername when going through the tunnel', async () => {
      const { buildPoolConfig } = await load('db.internal.example');
      expect(buildPoolConfig('127.0.0.1', 40000, true).ssl).toEqual({
        rejectUnauthorized: false,
        servername: 'db.internal.example',
      });
      // direct connection: pg derives the servername from the host itself
      expect(buildPoolConfig('db.internal.example', 5432).ssl).toEqual({ rejectUnauthorized: false });
    });

    it('does not set a servername when SQL_SERVER is an IP address (SNI forbids it)', async () => {
      const { buildPoolConfig } = await load('192.0.2.10');
      expect(buildPoolConfig('127.0.0.1', 40000, true).ssl).toEqual({ rejectUnauthorized: false });
    });
  });
});
