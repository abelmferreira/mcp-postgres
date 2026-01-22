import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module
vi.mock('../../../src/db/index.js', () => ({
  executeWrite: vi.fn(),
  buildInsertQuery: vi.fn(),
  buildUpdateQuery: vi.fn(),
  buildDeleteQuery: vi.fn(),
}));

// Mock config module - default to READONLY=true
vi.mock('../../../src/config.js', () => ({
  config: {
    READONLY: true,
    SQL_SERVER: 'localhost',
    SQL_DATABASE: 'testdb',
  },
}));

import { sqlInsert, sqlInsertDefinition } from '../../../src/tools/sql-insert.js';
import { sqlUpdate, sqlUpdateDefinition } from '../../../src/tools/sql-update.js';
import { sqlDelete, sqlDeleteDefinition } from '../../../src/tools/sql-delete.js';
import { executeWrite, buildInsertQuery, buildUpdateQuery, buildDeleteQuery } from '../../../src/db/index.js';
import { config } from '../../../src/config.js';

describe('sqlInsert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to READONLY mode for each test
    (config as { READONLY: boolean }).READONLY = true;
  });

  it('should reject INSERT in READONLY mode', async () => {
    const result = await sqlInsert({
      table: 'users',
      data: { name: 'John' },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('READONLY');
  });

  it('should execute INSERT when READONLY=false', async () => {
    (config as { READONLY: boolean }).READONLY = false;

    vi.mocked(buildInsertQuery).mockReturnValue({
      query: 'INSERT INTO "public"."users" ("name") VALUES (@p0) RETURNING *',
      params: { p0: 'John' },
    });
    vi.mocked(executeWrite).mockResolvedValue({
      affectedRows: 1,
      duration: 25,
    });

    const result = await sqlInsert({
      table: 'users',
      data: { name: 'John' },
    });

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.success).toBe(true);
    expect(content.affectedRows).toBe(1);
  });

  it('should use default schema public', async () => {
    (config as { READONLY: boolean }).READONLY = false;

    vi.mocked(buildInsertQuery).mockReturnValue({
      query: 'INSERT INTO "public"."users" ("name") VALUES (@p0) RETURNING *',
      params: { p0: 'John' },
    });
    vi.mocked(executeWrite).mockResolvedValue({
      affectedRows: 1,
      duration: 25,
    });

    await sqlInsert({
      table: 'users',
      data: { name: 'John' },
    });

    expect(buildInsertQuery).toHaveBeenCalledWith('public', 'users', { name: 'John' });
  });

  it('should accept custom schema', async () => {
    (config as { READONLY: boolean }).READONLY = false;

    vi.mocked(buildInsertQuery).mockReturnValue({
      query: 'INSERT INTO "sales"."orders" ("total") VALUES (@p0) RETURNING *',
      params: { p0: 100 },
    });
    vi.mocked(executeWrite).mockResolvedValue({
      affectedRows: 1,
      duration: 25,
    });

    await sqlInsert({
      table: 'orders',
      schema: 'sales',
      data: { total: 100 },
    });

    expect(buildInsertQuery).toHaveBeenCalledWith('sales', 'orders', { total: 100 });
  });

  it('should reject empty data object', async () => {
    (config as { READONLY: boolean }).READONLY = false;

    const result = await sqlInsert({
      table: 'users',
      data: {},
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('empty');
  });

  it('should handle database errors', async () => {
    (config as { READONLY: boolean }).READONLY = false;

    vi.mocked(buildInsertQuery).mockReturnValue({
      query: 'INSERT INTO "public"."users" ("name") VALUES (@p0) RETURNING *',
      params: { p0: 'John' },
    });
    vi.mocked(executeWrite).mockRejectedValue(new Error('Constraint violation'));

    const result = await sqlInsert({
      table: 'users',
      data: { name: 'John' },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Constraint violation');
  });
});

describe('sqlInsertDefinition', () => {
  it('should have correct name', () => {
    expect(sqlInsertDefinition.name).toBe('sql_insert');
  });

  it('should have table and data as required', () => {
    expect(sqlInsertDefinition.inputSchema.required).toContain('table');
    expect(sqlInsertDefinition.inputSchema.required).toContain('data');
  });

  it('should have schema with default public', () => {
    expect(sqlInsertDefinition.inputSchema.properties.schema.default).toBe('public');
  });
});

describe('sqlUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (config as { READONLY: boolean }).READONLY = true;
  });

  it('should reject UPDATE in READONLY mode', async () => {
    const result = await sqlUpdate({
      table: 'users',
      data: { name: 'Jane' },
      where: 'id = @id',
      params: { id: 1 },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('READONLY');
  });

  it('should execute UPDATE when READONLY=false', async () => {
    (config as { READONLY: boolean }).READONLY = false;

    vi.mocked(buildUpdateQuery).mockReturnValue({
      query: 'UPDATE "public"."users" SET "name" = @p0 WHERE id = @id RETURNING *',
      params: { p0: 'Jane', id: 1 },
    });
    vi.mocked(executeWrite).mockResolvedValue({
      affectedRows: 1,
      duration: 30,
    });

    const result = await sqlUpdate({
      table: 'users',
      data: { name: 'Jane' },
      where: 'id = @id',
      params: { id: 1 },
    });

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.success).toBe(true);
    expect(content.affectedRows).toBe(1);
  });

  it('should reject empty data object', async () => {
    (config as { READONLY: boolean }).READONLY = false;

    const result = await sqlUpdate({
      table: 'users',
      data: {},
      where: 'id = @id',
      params: { id: 1 },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('empty');
  });

  it('should pass params to buildUpdateQuery', async () => {
    (config as { READONLY: boolean }).READONLY = false;

    vi.mocked(buildUpdateQuery).mockReturnValue({
      query: 'UPDATE "public"."users" SET "status" = @p0 WHERE active = @active RETURNING *',
      params: { p0: 'inactive', active: true },
    });
    vi.mocked(executeWrite).mockResolvedValue({
      affectedRows: 5,
      duration: 50,
    });

    await sqlUpdate({
      table: 'users',
      data: { status: 'inactive' },
      where: 'active = @active',
      params: { active: true },
    });

    expect(buildUpdateQuery).toHaveBeenCalledWith(
      'public',
      'users',
      { status: 'inactive' },
      'active = @active',
      { active: true }
    );
  });
});

describe('sqlUpdateDefinition', () => {
  it('should have correct name', () => {
    expect(sqlUpdateDefinition.name).toBe('sql_update');
  });

  it('should require table, data, and where', () => {
    expect(sqlUpdateDefinition.inputSchema.required).toContain('table');
    expect(sqlUpdateDefinition.inputSchema.required).toContain('data');
    expect(sqlUpdateDefinition.inputSchema.required).toContain('where');
  });

  it('should have params with default empty object', () => {
    expect(sqlUpdateDefinition.inputSchema.properties.params.default).toEqual({});
  });
});

describe('sqlDelete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (config as { READONLY: boolean }).READONLY = true;
  });

  it('should reject DELETE in READONLY mode', async () => {
    const result = await sqlDelete({
      table: 'users',
      where: 'id = @id',
      params: { id: 1 },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('READONLY');
  });

  it('should execute DELETE when READONLY=false', async () => {
    (config as { READONLY: boolean }).READONLY = false;

    vi.mocked(buildDeleteQuery).mockReturnValue({
      query: 'DELETE FROM "public"."users" WHERE id = @id RETURNING *',
      params: { id: 1 },
    });
    vi.mocked(executeWrite).mockResolvedValue({
      affectedRows: 1,
      duration: 15,
    });

    const result = await sqlDelete({
      table: 'users',
      where: 'id = @id',
      params: { id: 1 },
    });

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.success).toBe(true);
    expect(content.affectedRows).toBe(1);
  });

  it('should use custom schema', async () => {
    (config as { READONLY: boolean }).READONLY = false;

    vi.mocked(buildDeleteQuery).mockReturnValue({
      query: 'DELETE FROM "archive"."old_data" WHERE date < @date RETURNING *',
      params: { date: '2020-01-01' },
    });
    vi.mocked(executeWrite).mockResolvedValue({
      affectedRows: 100,
      duration: 200,
    });

    await sqlDelete({
      table: 'old_data',
      schema: 'archive',
      where: 'date < @date',
      params: { date: '2020-01-01' },
    });

    expect(buildDeleteQuery).toHaveBeenCalledWith(
      'archive',
      'old_data',
      'date < @date',
      { date: '2020-01-01' }
    );
  });

  it('should handle database errors', async () => {
    (config as { READONLY: boolean }).READONLY = false;

    vi.mocked(buildDeleteQuery).mockReturnValue({
      query: 'DELETE FROM "public"."users" WHERE id = @id RETURNING *',
      params: { id: 1 },
    });
    vi.mocked(executeWrite).mockRejectedValue(new Error('Foreign key constraint'));

    const result = await sqlDelete({
      table: 'users',
      where: 'id = @id',
      params: { id: 1 },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Foreign key constraint');
  });
});

describe('sqlDeleteDefinition', () => {
  it('should have correct name', () => {
    expect(sqlDeleteDefinition.name).toBe('sql_delete');
  });

  it('should require table and where', () => {
    expect(sqlDeleteDefinition.inputSchema.required).toContain('table');
    expect(sqlDeleteDefinition.inputSchema.required).toContain('where');
  });

  it('should have schema with default public', () => {
    expect(sqlDeleteDefinition.inputSchema.properties.schema.default).toBe('public');
  });
});
