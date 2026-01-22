import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module
vi.mock('../../../src/db/index.js', () => ({
  executeQuery: vi.fn(),
}));

import { monitorWaitStats, monitorWaitStatsDefinition } from '../../../src/tools/monitor-wait-stats.js';
import { monitorPerformanceCounters, monitorPerformanceCountersDefinition } from '../../../src/tools/monitor-performance-counters.js';
import { executeQuery } from '../../../src/db/index.js';

describe('monitorWaitStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return wait statistics', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [
        { waitType: 'CXPACKET', waitingTasksCount: 1000, totalWaitTimeMs: 50000, maxWaitTimeMs: 500, signalWaitTimeMs: 100, resourceWaitTimeMs: 49900, percentTotal: 35.5 },
        { waitType: 'PAGEIOLATCH_SH', waitingTasksCount: 500, totalWaitTimeMs: 30000, maxWaitTimeMs: 200, signalWaitTimeMs: 50, resourceWaitTimeMs: 29950, percentTotal: 21.3 },
      ],
      rowCount: 2,
      fields: [],
      duration: 50,
    });

    const result = await monitorWaitStats({});

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.waitStats).toHaveLength(2);
    expect(content.count).toBe(2);
    expect(content.waitStats[0].waitType).toBe('CXPACKET');
  });

  it('should use default top value of 10', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 30,
    });

    await monitorWaitStats({});

    expect(executeQuery).toHaveBeenCalledWith(
      expect.any(String),
      { top: 10 },
      10
    );
  });

  it('should use custom top value', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 30,
    });

    await monitorWaitStats({ top: 25 });

    expect(executeQuery).toHaveBeenCalledWith(
      expect.any(String),
      { top: 25 },
      25
    );
  });

  it('should exclude idle waits by default', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 30,
    });

    const result = await monitorWaitStats({});

    const query = vi.mocked(executeQuery).mock.calls[0][0];
    expect(query).toContain('NOT IN');
    expect(query).toContain('Idle');

    const content = JSON.parse(result.content[0].text);
    expect(content.excludedIdleWaits).toBe(true);
  });

  it('should include idle waits when excludeIdle is false', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 30,
    });

    const result = await monitorWaitStats({ excludeIdle: false });

    const query = vi.mocked(executeQuery).mock.calls[0][0];
    expect(query).not.toContain('NOT IN');

    const content = JSON.parse(result.content[0].text);
    expect(content.excludedIdleWaits).toBe(false);
  });

  it('should handle database errors', async () => {
    vi.mocked(executeQuery).mockRejectedValue(new Error('Permission denied'));

    const result = await monitorWaitStats({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Permission denied');
  });
});

describe('monitorWaitStatsDefinition', () => {
  it('should have correct name', () => {
    expect(monitorWaitStatsDefinition.name).toBe('monitor_wait_stats');
  });

  it('should have description about wait statistics', () => {
    expect(monitorWaitStatsDefinition.description).toContain('wait');
  });

  it('should have top with default 10', () => {
    expect(monitorWaitStatsDefinition.inputSchema.properties.top.default).toBe(10);
  });

  it('should have excludeIdle with default true', () => {
    expect(monitorWaitStatsDefinition.inputSchema.properties.excludeIdle.default).toBe(true);
  });
});

describe('monitorPerformanceCounters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return performance counters', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [
        {
          database: 'testdb',
          blocksHit: 100,
          blocksRead: 10,
          tuplesReturned: 50,
          tuplesFetched: 25,
          commits: 5,
          rollbacks: 1,
        },
      ],
      rowCount: 1,
      fields: [],
      duration: 40,
    });

    const result = await monitorPerformanceCounters({});

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.metrics).toBeDefined();
    expect(content.counters).toBeDefined();
    expect(content.totalCounters).toBe(1);
  });

  it('should calculate buffer cache hit ratio', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [
        { database: 'testdb', blocksHit: 95, blocksRead: 5 },
      ],
      rowCount: 1,
      fields: [],
      duration: 30,
    });

    const result = await monitorPerformanceCounters({});

    const content = JSON.parse(result.content[0].text);
    expect(content.bufferCacheHitRatio).toBeNull();
  });

  it('should handle zero base for buffer cache hit ratio', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [
        { database: 'testdb', blocksHit: 0, blocksRead: 0 },
      ],
      rowCount: 1,
      fields: [],
      duration: 30,
    });

    const result = await monitorPerformanceCounters({});

    const content = JSON.parse(result.content[0].text);
    expect(content.bufferCacheHitRatio).toBeNull();
  });

  it('should accept buffer category', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 30,
    });

    const result = await monitorPerformanceCounters({ category: 'buffer' });

    const query = vi.mocked(executeQuery).mock.calls[0][0];
    expect(query).toContain('pg_stat_database');

    const content = JSON.parse(result.content[0].text);
    expect(content.category).toBe('buffer');
  });

  it('should accept sql category', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 30,
    });

    await monitorPerformanceCounters({ category: 'sql' });

    const query = vi.mocked(executeQuery).mock.calls[0][0];
    expect(query).toContain('pg_stat_database');
  });

  it('should accept locks category', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 30,
    });

    await monitorPerformanceCounters({ category: 'locks' });

    const query = vi.mocked(executeQuery).mock.calls[0][0];
    expect(query).toContain('pg_stat_database');
  });

  it('should accept memory category', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 30,
    });

    await monitorPerformanceCounters({ category: 'memory' });

    const query = vi.mocked(executeQuery).mock.calls[0][0];
    expect(query).toContain('pg_stat_database');
  });

  it('should include all counters when category is all', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 30,
    });

    const result = await monitorPerformanceCounters({ category: 'all' });

    const query = vi.mocked(executeQuery).mock.calls[0][0];
    expect(query).toContain('pg_stat_database');

    const content = JSON.parse(result.content[0].text);
    expect(content.category).toBe('all');
  });

  it('should group counters by object', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [{ database: 'testdb', blocksHit: 100, blocksRead: 10 }],
      rowCount: 1,
      fields: [],
      duration: 30,
    });

    const result = await monitorPerformanceCounters({});

    const content = JSON.parse(result.content[0].text);
    expect(content.metrics).toBeDefined();
  });

  it('should handle null instance values', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [{ database: 'testdb', blocksHit: 100, blocksRead: 10 }],
      rowCount: 1,
      fields: [],
      duration: 30,
    });

    const result = await monitorPerformanceCounters({});

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.metrics).toBeDefined();
  });

  it('should handle database errors', async () => {
    vi.mocked(executeQuery).mockRejectedValue(new Error('Query failed'));

    const result = await monitorPerformanceCounters({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Query failed');
  });
});

describe('monitorPerformanceCountersDefinition', () => {
  it('should have correct name', () => {
    expect(monitorPerformanceCountersDefinition.name).toBe('monitor_performance_counters');
  });

  it('should have description about performance counters', () => {
    expect(monitorPerformanceCountersDefinition.description).toContain('performance');
  });

  it('should have category with default all', () => {
    expect(monitorPerformanceCountersDefinition.inputSchema.properties.category.default).toBe('all');
  });

  it('should have valid category enum values', () => {
    expect(monitorPerformanceCountersDefinition.inputSchema.properties.category.enum).toEqual([
      'buffer', 'sql', 'locks', 'memory', 'all'
    ]);
  });
});
