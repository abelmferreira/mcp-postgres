import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module
vi.mock('../../../src/db/index.js', () => ({
  executeQuery: vi.fn(),
}));

import { schemaListIndexes, schemaListIndexesDefinition } from '../../../src/tools/schema-list-indexes.js';
import { schemaListProcedures, schemaListProceduresDefinition } from '../../../src/tools/schema-list-procedures.js';
import { executeQuery } from '../../../src/db/index.js';

describe('schemaListIndexes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return list of indexes', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [
        {
            schema: 'public',
          table: 'users',
          indexName: 'PK_users',
          type: 'CLUSTERED',
          isUnique: true,
          isPrimaryKey: true,
          isDisabled: false,
          columns: 'id',
          includedColumns: null,
          rowCount: 1000,
          sizeMB: 10.5,
          seeks: 5000,
          scans: 100,
          lookups: 200,
          updates: 500,
          lastSeek: '2024-01-15T10:30:00',
          lastScan: '2024-01-14T15:00:00',
        },
        {
            schema: 'public',
          table: 'users',
          indexName: 'IX_Users_Email',
          type: 'NONCLUSTERED',
          isUnique: true,
          isPrimaryKey: false,
          isDisabled: false,
          columns: 'email',
          includedColumns: 'name, created_at',
          rowCount: 1000,
          sizeMB: 5.2,
          seeks: 8000,
          scans: 50,
          lookups: 0,
          updates: 300,
          lastSeek: '2024-01-15T12:00:00',
          lastScan: '2024-01-10T09:00:00',
        },
      ],
      rowCount: 2,
      fields: [],
      duration: 80,
    });

    const result = await schemaListIndexes({});

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.indexes).toHaveLength(2);
    expect(content.count).toBe(2);
    expect(content.indexes[0].indexName).toBe('PK_users');
    expect(content.indexes[1].includedColumns).toBe('name, created_at');
  });

  it('should filter by table name', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 50,
    });

    await schemaListIndexes({ table: 'users' });

    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('@table'),
      expect.objectContaining({ table: 'users' }),
      1000
    );
  });

  it('should filter by schema name', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 50,
    });

    await schemaListIndexes({ schema: 'public' });

    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('@schema'),
      expect.objectContaining({ schema: 'public' }),
      1000
    );
  });

  it('should filter by both table and schema', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 50,
    });

    await schemaListIndexes({ table: 'orders', schema: 'sales' });

    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('@table'),
      expect.objectContaining({ table: 'orders', schema: 'sales' }),
      1000
    );
  });

  it('should return empty list when no indexes found', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 30,
    });

    const result = await schemaListIndexes({});

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.indexes).toHaveLength(0);
    expect(content.count).toBe(0);
  });

  it('should handle database errors', async () => {
    vi.mocked(executeQuery).mockRejectedValue(new Error('Permission denied'));

    const result = await schemaListIndexes({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Permission denied');
  });
});

describe('schemaListIndexesDefinition', () => {
  it('should have correct name', () => {
    expect(schemaListIndexesDefinition.name).toBe('schema_list_indexes');
  });

  it('should have description about indexes', () => {
    expect(schemaListIndexesDefinition.description).toContain('indexes');
  });

  it('should have table property', () => {
    expect(schemaListIndexesDefinition.inputSchema.properties.table).toBeDefined();
    expect(schemaListIndexesDefinition.inputSchema.properties.table.type).toBe('string');
  });

  it('should have schema property', () => {
    expect(schemaListIndexesDefinition.inputSchema.properties.schema).toBeDefined();
    expect(schemaListIndexesDefinition.inputSchema.properties.schema.type).toBe('string');
  });

  it('should not require any parameters', () => {
    expect(schemaListIndexesDefinition.inputSchema.required).toBeUndefined();
  });
});

describe('schemaListProcedures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return list of stored procedures', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [
        {
          schema: 'public',
          name: 'sp_GetUsers',
          type: 'SQL_STORED_PROCEDURE',
          createdAt: '2023-06-01T10:00:00',
          modifiedAt: '2024-01-10T14:30:00',
          parameterCount: 2,
          definition: 'CREATE PROCEDURE public.sp_GetUsers @status INT, @limit INT AS SELECT * FROM users WHERE status = @status',
        },
        {
          schema: 'public',
          name: 'sp_UpdateOrder',
          type: 'SQL_STORED_PROCEDURE',
          createdAt: '2023-07-15T09:00:00',
          modifiedAt: '2023-12-20T11:00:00',
          parameterCount: 3,
          definition: 'CREATE PROCEDURE public.sp_UpdateOrder @orderId INT, @status VARCHAR(50), @notes TEXT AS UPDATE orders SET status = @status',
        },
      ],
      rowCount: 2,
      fields: [],
      duration: 70,
    });

    const result = await schemaListProcedures({});

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.procedures).toHaveLength(2);
    expect(content.count).toBe(2);
    expect(content.procedures[0].name).toBe('sp_GetUsers');
    expect(content.procedures[0].parameterCount).toBe(2);
  });

  it('should filter by schema', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 40,
    });

    await schemaListProcedures({ schema: 'public' });

    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('@schema'),
      expect.objectContaining({ schema: 'public' }),
      500
    );
  });

  it('should filter by pattern', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 40,
    });

    await schemaListProcedures({ pattern: 'sp_Get%' });

    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('@pattern'),
      expect.objectContaining({ pattern: 'sp_Get%' }),
      500
    );
  });

  it('should filter by both schema and pattern', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 40,
    });

    await schemaListProcedures({ schema: 'sales', pattern: 'sp_%' });

    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('@schema'),
      expect.objectContaining({ schema: 'sales', pattern: 'sp_%' }),
      500
    );
  });

  it('should truncate long procedure definitions', async () => {
    const longDefinition = 'CREATE PROCEDURE public.sp_LongProc AS ' + 'SELECT '.repeat(500);
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [
        {
          schema: 'public',
          name: 'sp_LongProc',
          type: 'SQL_STORED_PROCEDURE',
          createdAt: '2023-06-01T10:00:00',
          modifiedAt: '2024-01-10T14:30:00',
          parameterCount: 0,
          definition: longDefinition,
        },
      ],
      rowCount: 1,
      fields: [],
      duration: 60,
    });

    const result = await schemaListProcedures({});

    const content = JSON.parse(result.content[0].text);
    expect(content.procedures[0].definition).toContain('[truncated]');
    expect(content.procedures[0].definition.length).toBeLessThan(longDefinition.length);
  });

  it('should handle procedures without definition', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [
        {
          schema: 'public',
          name: 'sp_NoDefinition',
          type: 'SQL_STORED_PROCEDURE',
          createdAt: '2023-06-01T10:00:00',
          modifiedAt: '2024-01-10T14:30:00',
          parameterCount: 0,
          definition: null,
        },
      ],
      rowCount: 1,
      fields: [],
      duration: 40,
    });

    const result = await schemaListProcedures({});

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.procedures[0].definition).toBeNull();
  });

  it('should return empty list when no procedures found', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 30,
    });

    const result = await schemaListProcedures({});

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.procedures).toHaveLength(0);
    expect(content.count).toBe(0);
  });

  it('should handle database errors', async () => {
    vi.mocked(executeQuery).mockRejectedValue(new Error('Access denied'));

    const result = await schemaListProcedures({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Access denied');
  });
});

describe('schemaListProceduresDefinition', () => {
  it('should have correct name', () => {
    expect(schemaListProceduresDefinition.name).toBe('schema_list_procedures');
  });

  it('should have description about procedures', () => {
    expect(schemaListProceduresDefinition.description).toContain('procedures');
  });

  it('should have schema property', () => {
    expect(schemaListProceduresDefinition.inputSchema.properties.schema).toBeDefined();
    expect(schemaListProceduresDefinition.inputSchema.properties.schema.type).toBe('string');
  });

  it('should have pattern property', () => {
    expect(schemaListProceduresDefinition.inputSchema.properties.pattern).toBeDefined();
    expect(schemaListProceduresDefinition.inputSchema.properties.pattern.type).toBe('string');
  });

  it('should not require any parameters', () => {
    expect(schemaListProceduresDefinition.inputSchema.required).toBeUndefined();
  });
});
