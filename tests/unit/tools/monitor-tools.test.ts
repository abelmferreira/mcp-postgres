import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module
vi.mock('../../../src/db/index.js', () => ({
  executeQuery: vi.fn(),
}));

import { monitorActiveQueries, monitorActiveQueriesDefinition } from '../../../src/tools/monitor-active-queries.js';
import { monitorBlocking, monitorBlockingDefinition } from '../../../src/tools/monitor-blocking.js';
import { monitorConnections, monitorConnectionsDefinition } from '../../../src/tools/monitor-connections.js';
import { monitorDatabaseSize, monitorDatabaseSizeDefinition } from '../../../src/tools/monitor-database-size.js';
import { executeQuery } from '../../../src/db/index.js';

describe('monitorActiveQueries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return active queries', async () => {
    const mockResult = {
      rows: [
        {
          sessionId: 55,
          status: 'running',
          command: 'SELECT',
          database: 'testdb',
          cpuTimeMs: 100,
          elapsedTimeMs: 500,
          loginName: 'testuser',
          currentStatement: 'SELECT * FROM users',
          fullQuery: 'SELECT * FROM users WHERE active = 1',
        },
      ],
      rowCount: 1,
      fields: [],
      duration: 20,
    };
    vi.mocked(executeQuery).mockResolvedValue(mockResult);

    const result = await monitorActiveQueries({});

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.activeQueries).toHaveLength(1);
    expect(content.count).toBe(1);
    expect(content.activeQueries[0].sessionId).toBe(55);
  });

  it('should filter by minDurationMs', async () => {
    const mockResult = {
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 10,
    };
    vi.mocked(executeQuery).mockResolvedValue(mockResult);

    await monitorActiveQueries({ minDurationMs: 5000 });

    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('@minDurationMs'),
      { minDurationMs: 5000 },
      100
    );
  });

  it('should use default minDurationMs of 0', async () => {
    const mockResult = {
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 10,
    };
    vi.mocked(executeQuery).mockResolvedValue(mockResult);

    await monitorActiveQueries({});

    expect(executeQuery).toHaveBeenCalledWith(
      expect.any(String),
      { minDurationMs: 0 },
      100
    );
  });

  it('should include system queries when requested', async () => {
    const mockResult = {
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 10,
    };
    vi.mocked(executeQuery).mockResolvedValue(mockResult);

    await monitorActiveQueries({ includeSystemQueries: true });

    const query = vi.mocked(executeQuery).mock.calls[0][0];
    // Should NOT contain the postgres filter
    expect(query).not.toContain('usename NOT IN');
  });

  it('should exclude system queries by default', async () => {
    const mockResult = {
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 10,
    };
    vi.mocked(executeQuery).mockResolvedValue(mockResult);

    await monitorActiveQueries({});

    const query = vi.mocked(executeQuery).mock.calls[0][0];
    expect(query).toContain('usename NOT IN');
  });

  it('should truncate long fullQuery', async () => {
    const longQuery = 'SELECT ' + 'a'.repeat(3000);
    const mockResult = {
      rows: [
        {
          sessionId: 1,
          fullQuery: longQuery,
          currentStatement: 'SELECT a',
        },
      ],
      rowCount: 1,
      fields: [],
      duration: 10,
    };
    vi.mocked(executeQuery).mockResolvedValue(mockResult);

    const result = await monitorActiveQueries({});

    const content = JSON.parse(result.content[0].text);
    expect(content.activeQueries[0].fullQuery).toContain('[truncated]');
    expect(content.activeQueries[0].fullQuery.length).toBeLessThan(3000);
  });

  it('should truncate long currentStatement', async () => {
    const longStatement = 'SELECT ' + 'b'.repeat(1500);
    const mockResult = {
      rows: [
        {
          sessionId: 1,
          fullQuery: 'short',
          currentStatement: longStatement,
        },
      ],
      rowCount: 1,
      fields: [],
      duration: 10,
    };
    vi.mocked(executeQuery).mockResolvedValue(mockResult);

    const result = await monitorActiveQueries({});

    const content = JSON.parse(result.content[0].text);
    expect(content.activeQueries[0].currentStatement).toContain('[truncated]');
    expect(content.activeQueries[0].currentStatement.length).toBeLessThan(1500);
  });

  it('should handle empty results', async () => {
    const mockResult = {
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 5,
    };
    vi.mocked(executeQuery).mockResolvedValue(mockResult);

    const result = await monitorActiveQueries({});

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.activeQueries).toHaveLength(0);
    expect(content.count).toBe(0);
  });

  it('should handle database errors', async () => {
    vi.mocked(executeQuery).mockRejectedValue(new Error('Permission denied'));

    const result = await monitorActiveQueries({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Permission denied');
  });
});

describe('monitorActiveQueriesDefinition', () => {
  it('should have correct name', () => {
    expect(monitorActiveQueriesDefinition.name).toBe('monitor_active_queries');
  });

  it('should have description about monitoring', () => {
    expect(monitorActiveQueriesDefinition.description).toContain('running queries');
  });

  it('should have minDurationMs with default 0', () => {
    expect(monitorActiveQueriesDefinition.inputSchema.properties.minDurationMs.default).toBe(0);
  });

  it('should have includeSystemQueries with default false', () => {
    expect(monitorActiveQueriesDefinition.inputSchema.properties.includeSystemQueries.default).toBe(false);
  });

  it('should not require any parameters', () => {
    expect(monitorActiveQueriesDefinition.inputSchema.required).toBeUndefined();
  });
});

describe('monitorBlocking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return blocking information', async () => {
    vi.mocked(executeQuery).mockResolvedValueOnce({
      rows: [
        {
          blockedSessionId: 55,
          blockingSessionId: 60,
          blockedQuery: 'UPDATE users SET status = 1',
          blockingQuery: 'SELECT * FROM users',
        },
      ],
      rowCount: 1,
      fields: [],
      duration: 30,
    });

    const result = await monitorBlocking();

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.blocking).toHaveLength(1);
    expect(content.headBlockers).toContain(60);
    expect(content.count).toBe(1);
  });

  it('should return empty blocking info when no blocking', async () => {
    vi.mocked(executeQuery).mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 20,
    });

    const result = await monitorBlocking();

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.blocking).toHaveLength(0);
    expect(content.headBlockers).toHaveLength(0);
  });

  it('should truncate long blocked queries', async () => {
    const longQuery = 'UPDATE ' + 'x'.repeat(1500);
    vi.mocked(executeQuery)
      .mockResolvedValueOnce({
        rows: [{ blockedQuery: longQuery, blockingQuery: 'short' }],
        rowCount: 1,
        fields: [],
        duration: 20,
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        fields: [],
        duration: 10,
      });

    const result = await monitorBlocking();

    const content = JSON.parse(result.content[0].text);
    expect(content.blocking[0].blockedQuery).toContain('[truncated]');
  });

  it('should truncate long blocking queries', async () => {
    const longQuery = 'SELECT ' + 'y'.repeat(1500);
    vi.mocked(executeQuery)
      .mockResolvedValueOnce({
        rows: [{ blockedQuery: 'short', blockingQuery: longQuery }],
        rowCount: 1,
        fields: [],
        duration: 20,
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        fields: [],
        duration: 10,
      });

    const result = await monitorBlocking();

    const content = JSON.parse(result.content[0].text);
    expect(content.blocking[0].blockingQuery).toContain('[truncated]');
  });

  it('should handle database errors', async () => {
    vi.mocked(executeQuery).mockRejectedValue(new Error('Query failed'));

    const result = await monitorBlocking();

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Query failed');
  });
});

describe('monitorBlockingDefinition', () => {
  it('should have correct name', () => {
    expect(monitorBlockingDefinition.name).toBe('monitor_blocking');
  });

  it('should have description about blocking', () => {
    expect(monitorBlockingDefinition.description).toContain('blocking');
  });
});

describe('monitorConnections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return connection information', async () => {
    vi.mocked(executeQuery)
      .mockResolvedValueOnce({
        rows: [{ totalConnections: 50, activeConnections: 10, sleepingConnections: 40 }],
        rowCount: 1,
        fields: [],
        duration: 20,
      })
      .mockResolvedValueOnce({
        rows: [{ loginName: 'app_user', connections: 30, active: 5 }],
        rowCount: 1,
        fields: [],
        duration: 15,
      })
      .mockResolvedValueOnce({
        rows: [{ hostName: 'web-server-01', connections: 20, active: 3 }],
        rowCount: 1,
        fields: [],
        duration: 15,
      })
      .mockResolvedValueOnce({
        rows: [{ programName: 'NodeApp', connections: 25, active: 8 }],
        rowCount: 1,
        fields: [],
        duration: 15,
      })
      .mockResolvedValueOnce({
        rows: [{ sessionId: 55, loginName: 'app_user', status: 'running' }],
        rowCount: 1,
        fields: [],
        duration: 20,
      });

    const result = await monitorConnections();

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.summary.totalConnections).toBe(50);
    expect(content.byLogin).toHaveLength(1);
    expect(content.byHost).toHaveLength(1);
    expect(content.byProgram).toHaveLength(1);
    expect(content.details).toHaveLength(1);
  });

  it('should handle database errors', async () => {
    vi.mocked(executeQuery).mockRejectedValue(new Error('Connection failed'));

    const result = await monitorConnections();

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Connection failed');
  });
});

describe('monitorConnectionsDefinition', () => {
  it('should have correct name', () => {
    expect(monitorConnectionsDefinition.name).toBe('monitor_connections');
  });

  it('should have description about connections', () => {
    expect(monitorConnectionsDefinition.description).toContain('connections');
  });
});

describe('monitorDatabaseSize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return database size information', async () => {
    vi.mocked(executeQuery)
      .mockResolvedValueOnce({
        rows: [{ database: 'testdb', dataSizeMB: 100, logSizeMB: 50, totalSizeMB: 150 }],
        rowCount: 1,
        fields: [],
        duration: 20,
      })
      .mockResolvedValueOnce({
        rows: [{ fileName: 'testdb', fileType: 'ROWS', sizeMB: 100, usedMB: 80 }],
        rowCount: 1,
        fields: [],
        duration: 15,
      })
      .mockResolvedValueOnce({
        rows: [{ schema: 'dbo', table: 'users', rowCount: 10000, totalSizeMB: 50 }],
        rowCount: 1,
        fields: [],
        duration: 25,
      });

    const result = await monitorDatabaseSize();

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.summary.database).toBe('testdb');
    expect(content.summary.totalSizeMB).toBe(150);
    expect(content.files).toHaveLength(1);
    expect(content.largestTables).toHaveLength(1);
  });

  it('should handle database errors', async () => {
    vi.mocked(executeQuery).mockRejectedValue(new Error('Access denied'));

    const result = await monitorDatabaseSize();

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Access denied');
  });
});

describe('monitorDatabaseSizeDefinition', () => {
  it('should have correct name', () => {
    expect(monitorDatabaseSizeDefinition.name).toBe('monitor_database_size');
  });

  it('should have description about database size', () => {
    expect(monitorDatabaseSizeDefinition.description).toContain('size');
  });
});
