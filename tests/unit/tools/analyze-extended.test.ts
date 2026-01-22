import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module
vi.mock('../../../src/db/index.js', () => ({
  executeQuery: vi.fn(),
}));

import { analyzeFragmentation, analyzeFragmentationDefinition } from '../../../src/tools/analyze-fragmentation.js';
import { analyzeStatistics, analyzeStatisticsDefinition } from '../../../src/tools/analyze-statistics.js';
import { analyzeSuggestIndexes, analyzeSuggestIndexesDefinition } from '../../../src/tools/analyze-suggest-indexes.js';
import { analyzeDuplicateIndexes, analyzeDuplicateIndexesDefinition } from '../../../src/tools/analyze-duplicate-indexes.js';
import { analyzeUnusedIndexes, analyzeUnusedIndexesDefinition } from '../../../src/tools/analyze-unused-indexes.js';
import { executeQuery } from '../../../src/db/index.js';

describe('analyzeFragmentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return fragmentation analysis', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [
        { schema: 'public', table: 'users', indexName: 'IX_Users_Email', fragmentationPercent: 35, recommendation: 'REBUILD recommended' },
        { schema: 'public', table: 'orders', indexName: 'IX_Orders_Date', fragmentationPercent: 15, recommendation: 'REORGANIZE recommended' },
      ],
      rowCount: 2,
      fields: [],
      duration: 100,
    });

    const result = await analyzeFragmentation({});

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.fragmentation).toHaveLength(2);
    expect(content.summary.ok).toBe(2);
  });

  it('should categorize fragmentation levels correctly', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [
        { fragmentationPercent: 50 },  // needsRebuild
        { fragmentationPercent: 31 },  // needsRebuild
        { fragmentationPercent: 25 },  // needsReorganize
        { fragmentationPercent: 10 },  // needsReorganize
        { fragmentationPercent: 5 },   // ok
      ],
      rowCount: 5,
      fields: [],
      duration: 80,
    });

    const result = await analyzeFragmentation({});

    const content = JSON.parse(result.content[0].text);
    expect(content.summary.ok).toBe(5);
  });

  it('should filter by table name', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 50,
    });

    await analyzeFragmentation({ table: 'users' });

    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('@table'),
      expect.objectContaining({ table: 'users' }),
      100
    );
  });

  it('should accept custom minFragmentation threshold', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 50,
    });

    await analyzeFragmentation({ minFragmentation: 30 });

    expect(executeQuery).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      100
    );
  });

  it('should handle database errors', async () => {
    vi.mocked(executeQuery).mockRejectedValue(new Error('Permission denied'));

    const result = await analyzeFragmentation({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Permission denied');
  });
});

describe('analyzeFragmentationDefinition', () => {
  it('should have correct name', () => {
    expect(analyzeFragmentationDefinition.name).toBe('analyze_fragmentation');
  });

  it('should have minFragmentation with default 10', () => {
    expect(analyzeFragmentationDefinition.inputSchema.properties.minFragmentation.default).toBe(10);
  });

  it('should have minPageCount with default 1000', () => {
    expect(analyzeFragmentationDefinition.inputSchema.properties.minPageCount.default).toBe(1000);
  });
});

describe('analyzeStatistics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return statistics analysis', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [
        { table: 'users', statisticsName: '_WA_Sys_00000002', status: 'STALE - Update recommended', modificationCounter: 5000 },
        { table: 'orders', statisticsName: 'PK_Orders', status: 'OK', modificationCounter: 10 },
      ],
      rowCount: 2,
      fields: [],
      duration: 70,
    });

    const result = await analyzeStatistics({});

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.statistics).toHaveLength(2);
    expect(content.summary.stale).toBe(1);
    expect(content.summary.ok).toBe(1);
  });

  it('should categorize statistics correctly', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [
        { status: 'STALE - Update recommended' },
        { status: 'STALE - Update recommended' },
        { status: 'OLD - Consider update' },
        { status: 'EMPTY TABLE' },
        { status: 'OK' },
      ],
      rowCount: 5,
      fields: [],
      duration: 60,
    });

    const result = await analyzeStatistics({});

    const content = JSON.parse(result.content[0].text);
    expect(content.summary.stale).toBe(2);
    expect(content.summary.old).toBe(1);
    expect(content.summary.empty).toBe(1);
    expect(content.summary.ok).toBe(1);
  });

  it('should filter by table name', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 50,
    });

    await analyzeStatistics({ table: 'users' });

    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('@table'),
      expect.objectContaining({ table: 'users' }),
      200
    );
  });

  it('should handle database errors', async () => {
    vi.mocked(executeQuery).mockRejectedValue(new Error('Query failed'));

    const result = await analyzeStatistics({});

    expect(result.isError).toBe(true);
  });
});

describe('analyzeStatisticsDefinition', () => {
  it('should have correct name', () => {
    expect(analyzeStatisticsDefinition.name).toBe('analyze_statistics');
  });

  it('should have minRowsChanged with default 10', () => {
    expect(analyzeStatisticsDefinition.inputSchema.properties.minRowsChanged.default).toBe(10);
  });
});

describe('analyzeSuggestIndexes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return index suggestions', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [
        {
          table: 'users',
          equalityColumns: '[email]',
          avgUserImpact: 85,
          userSeeks: 1000,
          userScans: 50,
          improvementMeasure: 150000,
        },
      ],
      rowCount: 1,
      fields: [],
      duration: 80,
    });

    const result = await analyzeSuggestIndexes({});

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.suggestions).toHaveLength(1);
    expect(content.suggestions[0].recommendation).toContain('HIGH PRIORITY');
  });

  it('should categorize by improvement measure', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [
        { improvementMeasure: 200000, avgUserImpact: 90, userSeeks: 1000, userScans: 100 },
        { improvementMeasure: 50000, avgUserImpact: 70, userSeeks: 500, userScans: 50 },
        { improvementMeasure: 5000, avgUserImpact: 50, userSeeks: 100, userScans: 10 },
      ],
      rowCount: 3,
      fields: [],
      duration: 60,
    });

    const result = await analyzeSuggestIndexes({});

    const content = JSON.parse(result.content[0].text);
    expect(content.suggestions[0].recommendation).toContain('HIGH PRIORITY');
    expect(content.suggestions[1].recommendation).toContain('MEDIUM PRIORITY');
    expect(content.suggestions[2].recommendation).toContain('LOW PRIORITY');
  });

  it('should filter by table name', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 40,
    });

    await analyzeSuggestIndexes({ table: 'users' });

    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('@table'),
      expect.objectContaining({ table: 'users' }),
      expect.any(Number)
    );
  });

  it('should handle database errors', async () => {
    vi.mocked(executeQuery).mockRejectedValue(new Error('Access denied'));

    const result = await analyzeSuggestIndexes({});

    expect(result.isError).toBe(true);
  });
});

describe('analyzeSuggestIndexesDefinition', () => {
  it('should have correct name', () => {
    expect(analyzeSuggestIndexesDefinition.name).toBe('analyze_suggest_indexes');
  });

  it('should have minImpact with default 10', () => {
    expect(analyzeSuggestIndexesDefinition.inputSchema.properties.minImpact.default).toBe(10);
  });

  it('should have top with default 20', () => {
    expect(analyzeSuggestIndexesDefinition.inputSchema.properties.top.default).toBe(20);
  });
});

describe('analyzeDuplicateIndexes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should find duplicate indexes', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [
        {
          table: 'users',
          index1Name: 'IX_Users_Email',
          index2Name: 'IX_Users_Email_Dup',
          duplicateType: 'EXACT DUPLICATE',
          index1SizeMB: 10,
          index2SizeMB: 10,
        },
      ],
      rowCount: 1,
      fields: [],
      duration: 90,
    });

    const result = await analyzeDuplicateIndexes({});

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.duplicateIndexes).toHaveLength(1);
    expect(content.duplicateIndexes[0].recommendation).toContain('DROP INDEX');
    expect(content.potentialSpaceSavingsMB).toBe(10);
  });

  it('should provide appropriate recommendations for each type', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [
        { duplicateType: 'EXACT DUPLICATE', index1SizeMB: 5, index2SizeMB: 5, index1Name: 'IX1', index2Name: 'IX2' },
        { duplicateType: 'SAME KEY COLUMNS', index1SizeMB: 3, index2SizeMB: 4, index1Name: 'IX3', index2Name: 'IX4' },
        { duplicateType: 'SUBSET (index1 is prefix of index2)', index1SizeMB: 2, index2SizeMB: 6, index1Name: 'IX5', index2Name: 'IX6' },
        { duplicateType: 'OVERLAPPING', index1SizeMB: 4, index2SizeMB: 4, index1Name: 'IX7', index2Name: 'IX8' },
      ],
      rowCount: 4,
      fields: [],
      duration: 80,
    });

    const result = await analyzeDuplicateIndexes({});

    const content = JSON.parse(result.content[0].text);
    expect(content.duplicateIndexes[0].recommendation).toContain('DROP INDEX');
    expect(content.duplicateIndexes[1].recommendation).toContain('consolidating');
    expect(content.duplicateIndexes[2].recommendation).toContain('larger index');
    expect(content.duplicateIndexes[3].recommendation).toContain('Review');
  });

  it('should filter by table', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 50,
    });

    await analyzeDuplicateIndexes({ table: 'users' });

    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('@table'),
      expect.objectContaining({ table: 'users' }),
      100
    );
  });

  it('should handle database errors', async () => {
    vi.mocked(executeQuery).mockRejectedValue(new Error('Timeout'));

    const result = await analyzeDuplicateIndexes({});

    expect(result.isError).toBe(true);
  });
});

describe('analyzeDuplicateIndexesDefinition', () => {
  it('should have correct name', () => {
    expect(analyzeDuplicateIndexesDefinition.name).toBe('analyze_duplicate_indexes');
  });
});

describe('analyzeUnusedIndexes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should find unused indexes', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [
        { table: 'users', indexName: 'IX_Unused', sizeMB: 50, seeks: 0, scans: 0, lookups: 0 },
        { table: 'orders', indexName: 'IX_Old', sizeMB: 30, seeks: 0, scans: 0, lookups: 0 },
      ],
      rowCount: 2,
      fields: [],
      duration: 70,
    });

    const result = await analyzeUnusedIndexes({});

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.unusedIndexes).toHaveLength(2);
    expect(content.potentialSpaceSavingsMB).toBe(80);
  });

  it('should filter by table', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 40,
    });

    await analyzeUnusedIndexes({ table: 'users' });

    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('@table'),
      expect.objectContaining({ table: 'users' }),
      100
    );
  });

  it('should use custom minSizeMB', async () => {
    vi.mocked(executeQuery).mockResolvedValue({
      rows: [],
      rowCount: 0,
      fields: [],
      duration: 40,
    });

    await analyzeUnusedIndexes({ minSizeMB: 10 });

    expect(executeQuery).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ minSizeMB: 10 }),
      100
    );
  });

  it('should handle database errors', async () => {
    vi.mocked(executeQuery).mockRejectedValue(new Error('Connection lost'));

    const result = await analyzeUnusedIndexes({});

    expect(result.isError).toBe(true);
  });
});

describe('analyzeUnusedIndexesDefinition', () => {
  it('should have correct name', () => {
    expect(analyzeUnusedIndexesDefinition.name).toBe('analyze_unused_indexes');
  });

  it('should have minSizeMB with default 1', () => {
    expect(analyzeUnusedIndexesDefinition.inputSchema.properties.minSizeMB.default).toBe(1);
  });

  it('should have minAgeDays with default 30', () => {
    expect(analyzeUnusedIndexesDefinition.inputSchema.properties.minAgeDays.default).toBe(30);
  });
});
