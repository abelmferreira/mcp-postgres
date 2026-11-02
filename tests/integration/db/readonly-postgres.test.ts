/**
 * Integration test against a real PostgreSQL.
 *
 * Skipped unless TEST_PG_URL points to a disposable database, e.g.:
 *   TEST_PG_URL=postgres://postgres:<senha>@pg:5432/postgres
 * The user must be able to create a table (fixture is created and dropped
 * here through a separate read-write connection).
 *
 * The query validator is mocked to always accept, so these tests prove that
 * the DATABASE (session default + READ ONLY transaction) blocks the writes,
 * not the regex layer.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import pg from 'pg';

const TEST_PG_URL = process.env.TEST_PG_URL;
const TABLE = `mcp_ro_test_${process.pid}`;
const SEED_ROWS = 50;

type ExecuteModule = typeof import('../../../src/db/execute.js');
type ConnectionModule = typeof import('../../../src/db/connection.js');

describe.skipIf(!TEST_PG_URL)('READONLY mode against real PostgreSQL', () => {
  let admin: pg.Client;
  let execute: ExecuteModule;
  let connection: ConnectionModule;

  async function count(): Promise<number> {
    const res = await admin.query(`SELECT count(*)::int AS n FROM ${TABLE}`);
    return res.rows[0].n;
  }

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: TEST_PG_URL });
    await admin.connect();
    await admin.query(`DROP TABLE IF EXISTS ${TABLE}`);
    await admin.query(`DROP SEQUENCE IF EXISTS ${TABLE}_seq`);
    await admin.query(`CREATE TABLE ${TABLE} (id int PRIMARY KEY, name text)`);
    await admin.query(`CREATE SEQUENCE ${TABLE}_seq`);
    await admin.query(
      `INSERT INTO ${TABLE} SELECT g, 'row ' || g FROM generate_series(1, ${SEED_ROWS}) g`
    );

    process.env.SQL_CONNECTION_URL = TEST_PG_URL;
    process.env.READONLY = 'true';
    process.env.QUERY_TIMEOUT = '2000';
    process.env.POOL_MIN = '0';
    process.env.POOL_MAX = '1'; // same session every time: proves state does not leak

    vi.resetModules();
    vi.doMock('../../../src/validators/query-validator.js', () => ({
      validateQuery: () => ({ valid: true, queryType: 'SELECT' }),
    }));
    connection = await import('../../../src/db/connection.js');
    execute = await import('../../../src/db/execute.js');
  });

  afterAll(async () => {
    await connection?.closePool();
    if (admin) {
      await admin.query(`DROP TABLE IF EXISTS ${TABLE}`);
      await admin.query(`DROP SEQUENCE IF EXISTS ${TABLE}_seq`);
      await admin.end();
    }
    vi.doUnmock('../../../src/validators/query-validator.js');
  });

  it('runs SELECT normally', async () => {
    const result = await execute.executeQuery(`SELECT id FROM ${TABLE} WHERE id = @id`, { id: 7 });
    expect(result.rows).toEqual([{ id: 7 }]);
    expect(result.truncated).toBe(false);
  });

  it('session default is read-only even outside executeQuery', async () => {
    const pool = await connection.getPool();
    const res = await pool.query('SHOW default_transaction_read_only');
    expect(res.rows[0].default_transaction_read_only).toBe('on');
    await expect(pool.query(`INSERT INTO ${TABLE} VALUES (1000, 'x')`)).rejects.toThrow(
      /read-only transaction/
    );
  });

  it.each([
    [`INSERT INTO ${TABLE} VALUES (1001, 'x')`, /read-only transaction/],
    [`UPDATE ${TABLE} SET name = 'x'`, /read-only transaction/],
    [`DELETE FROM ${TABLE}`, /read-only transaction/],
    [`CREATE TABLE ${TABLE}_novo (a int)`, /read-only transaction/],
    [`WITH d AS (DELETE FROM ${TABLE} RETURNING *) SELECT count(*) FROM d`, /read-only transaction/],
    [`SET transaction_read_only = off; DELETE FROM ${TABLE}`, /multiple commands/],
    ['SET transaction_read_only = off', /must be set before any query/],
    [`SELECT set_config('transaction_read_only', 'off', true)`, /must be set before any query/],
    [`SELECT nextval('${TABLE}_seq')`, /read-only transaction/],
  ])('database rejects: %s', async (sql, expected) => {
    await expect(execute.executeQuery(sql)).rejects.toThrow(expected);
    expect(await count()).toBe(SEED_ROWS);
  });

  it('session settings changed inside the query are rolled back', async () => {
    await execute.executeQuery(
      `SELECT set_config('default_transaction_read_only', 'off', false)`
    );
    await expect(execute.executeQuery(`DELETE FROM ${TABLE}`)).rejects.toThrow(
      /read-only transaction/
    );
    const pool = await connection.getPool();
    const res = await pool.query('SHOW default_transaction_read_only');
    expect(res.rows[0].default_transaction_read_only).toBe('on');
    expect(await count()).toBe(SEED_ROWS);
  });

  it('applies the row limit on the server and flags truncated', async () => {
    const result = await execute.executeQuery(`SELECT id FROM ${TABLE} ORDER BY id`, {}, 10);
    expect(result.rows).toHaveLength(10);
    expect(result.rowCount).toBe(10);
    expect(result.truncated).toBe(true);
    expect(result.rows[9]).toEqual({ id: 10 });

    const exact = await execute.executeQuery(`SELECT id FROM ${TABLE}`, {}, SEED_ROWS);
    expect(exact.rows).toHaveLength(SEED_ROWS);
    expect(exact.truncated).toBe(false);
  });

  it('limit works for WITH and EXPLAIN', async () => {
    const cte = await execute.executeQuery(
      `WITH x AS (SELECT id FROM ${TABLE}) SELECT * FROM x`,
      {},
      5
    );
    expect(cte.rows).toHaveLength(5);
    expect(cte.truncated).toBe(true);

    const plan = await execute.executeQuery(`EXPLAIN SELECT * FROM ${TABLE}`, {}, 1);
    expect(plan.rows).toHaveLength(1);
    expect(plan.fields[0].name).toBe('QUERY PLAN');

    const json = await execute.executeQuery(`EXPLAIN (FORMAT JSON) SELECT * FROM ${TABLE}`, {}, 1);
    expect(json.truncated).toBe(false);
  });

  it('server-side limit does not materialize huge results', async () => {
    const result = await execute.executeQuery(
      'SELECT generate_series(1, 50000000) AS g',
      {},
      3
    );
    expect(result.rows).toHaveLength(3);
    expect(result.truncated).toBe(true);
    expect(result.duration).toBeLessThan(2000);
  });

  it('keeps statement_timeout', async () => {
    await expect(execute.executeQuery('SELECT pg_sleep(5)')).rejects.toThrow(/timed out/);
  });
});
