import { vi } from 'vitest';

interface MockQueryResult {
  rows: unknown[];
  rowCount?: number;
  fields?: unknown[];
}

/**
 * Mock of a pg Pool for executeQuery().
 *
 * executeQuery() takes a client from the pool, may run BEGIN/SELECT 1/ROLLBACK
 * with client.query(text) and runs the user query through a pg-cursor
 * (client.query(cursor) + cursor.read(n) + cursor.close()). The mock cursor
 * honours the requested row count, like a server-side portal would.
 *
 * `query` is the client's query spy (kept under this name for the old tests).
 */
export function createMockPool(result: MockQueryResult | Error) {
  const cursorReads: number[] = [];
  const statements: string[] = [];

  const query = vi.fn((arg: unknown) => {
    if (arg && typeof arg === 'object' && typeof (arg as { submit?: unknown }).submit === 'function') {
      const cursor = arg as {
        text: string;
        read: (n: number, cb: (err: Error | undefined, rows: unknown[], res: unknown) => void) => void;
        close: () => Promise<void>;
      };
      statements.push(cursor.text);
      cursor.read = (n, cb) => {
        cursorReads.push(n);
        setImmediate(() => {
          if (result instanceof Error) {
            cb(result, [], undefined);
            return;
          }
          cb(undefined, result.rows.slice(0, n), { fields: result.fields ?? [] });
        });
      };
      cursor.close = vi.fn().mockResolvedValue(undefined);
      return cursor;
    }
    statements.push(String(arg));
    return Promise.resolve({ rows: [], rowCount: 0, fields: [] });
  });

  const client = { query, release: vi.fn() };

  return {
    query,
    client,
    connect: vi.fn().mockResolvedValue(client),
    cursorReads,
    statements,
  };
}

/**
 * Pool mock where `query` is a plain vi.fn() programmed by the test with
 * mockResolvedValue / mockResolvedValueOnce / mockRejectedValue: each user
 * query run through executeQuery() consumes one call, as before the switch
 * to a dedicated client + cursor. BEGIN/SELECT 1/ROLLBACK do not touch it.
 */
export function createProgrammablePool() {
  const query = vi.fn();

  const clientQuery = (arg: unknown) => {
    if (arg && typeof arg === 'object' && typeof (arg as { submit?: unknown }).submit === 'function') {
      const cursor = arg as {
        text: string;
        values: unknown[] | null;
        read: (n: number, cb: (err: Error | undefined, rows: unknown[], res: unknown) => void) => void;
        close: () => Promise<void>;
      };
      // call synchronously to keep the order of mockResolvedValueOnce
      const pending = Promise.resolve().then(() => query(cursor.text, cursor.values));
      pending.catch(() => undefined);
      cursor.read = (n, cb) => {
        pending.then(
          (res: { rows?: unknown[]; fields?: unknown[] } | undefined) =>
            cb(undefined, (res?.rows ?? []).slice(0, n), { fields: res?.fields ?? [] }),
          (err: Error) => cb(err, [], undefined)
        );
      };
      cursor.close = () => Promise.resolve();
      return cursor;
    }
    return Promise.resolve({ rows: [], rowCount: 0, fields: [] });
  };

  const client = { query: vi.fn(clientQuery), release: vi.fn() };

  return { query, client, connect: vi.fn().mockResolvedValue(client) };
}
