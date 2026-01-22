import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module
vi.mock('../../../src/db/index.js', () => ({
  executeQuery: vi.fn(),
}));

import { analyzeQuery, analyzeQueryDefinition } from '../../../src/tools/analyze-query.js';
import { executeQuery } from '../../../src/db/index.js';

describe('analyzeQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should analyze query and return statistics', async () => {
    // Mock stats query
      vi.mocked(executeQuery).mockResolvedValue({
        rows: [
          {
            executionCount: 100,
            totalElapsedTimeMs: 5000,
            avgElapsedTimeMs: 50,
            totalRows: 10000,
          },
        ],
        rowCount: 1,
        fields: [],
        duration: 30,
      });

    const result = await analyzeQuery({
      query: 'SELECT * FROM users WHERE id = @id',
      includeExecutionPlan: false,
    });

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.statistics).toBeDefined();
      expect(content.statistics.executionCount).toBe(100);
  });

  it('should handle query with parameters', async () => {
      vi.mocked(executeQuery).mockResolvedValue({
        rows: [],
        rowCount: 0,
        fields: [],
        duration: 10,
      });

    const result = await analyzeQuery({
      query: 'SELECT * FROM users WHERE id = @id',
      params: { id: 123 },
      includeExecutionPlan: false,
    });

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.warnings).toContain('No cached statistics found for this query');
  });

  it('should include execution plan when requested', async () => {
    // First call: EXPLAIN plan
    // Second call: stats query
    vi.mocked(executeQuery)
      .mockResolvedValueOnce({
        rows: [{ 'QUERY PLAN': [{ Plan: { 'Plan Rows': 100, 'Total Cost': 0.5 } }] }],
        rowCount: 1,
        fields: [],
        duration: 50,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0, fields: [], duration: 10 });

    const result = await analyzeQuery({
      query: 'SELECT * FROM users',
      includeExecutionPlan: true,
    });

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.estimatedPlan).toBeDefined();
    expect(content.estimatedPlan.estimatedRows).toBe(100);
    expect(content.estimatedPlan.estimatedCost).toBe(0.5);
  });

  it('should parse missing index from execution plan', async () => {
    vi.mocked(executeQuery)
      .mockResolvedValueOnce({
        rows: [{ 'QUERY PLAN': [{ Plan: { 'Plan Rows': 1, 'Total Cost': 0.1 } }] }],
        rowCount: 1,
        fields: [],
        duration: 50,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0, fields: [], duration: 10 });

    const result = await analyzeQuery({
      query: 'SELECT * FROM users WHERE name = @name',
      includeExecutionPlan: true,
    });

    const content = JSON.parse(result.content[0].text);
    expect(content.estimatedPlan.estimatedRows).toBe(1);
  });

  it('should detect table scans in execution plan', async () => {
    vi.mocked(executeQuery)
      .mockResolvedValueOnce({
        rows: [{ 'QUERY PLAN': [{ Plan: { 'Node Type': 'Seq Scan' } }] }],
        rowCount: 1,
        fields: [],
        duration: 50,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0, fields: [], duration: 10 });

    const result = await analyzeQuery({
      query: 'SELECT * FROM large_table',
      includeExecutionPlan: true,
    });

    const content = JSON.parse(result.content[0].text);
    expect(content.estimatedPlan.scanOperations).toBe(1);
    expect(content.estimatedPlan.potentialIssue).toContain('scan');
  });

  it('should detect parallelism in execution plan', async () => {
    vi.mocked(executeQuery)
      .mockResolvedValueOnce({
        rows: [{ 'QUERY PLAN': [{ Plan: { 'Parallel Aware': true } }] }],
        rowCount: 1,
        fields: [],
        duration: 50,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0, fields: [], duration: 10 });

    const result = await analyzeQuery({
      query: 'SELECT * FROM users',
      includeExecutionPlan: true,
    });

    const content = JSON.parse(result.content[0].text);
    expect(content.estimatedPlan.usesParallelism).toBe(true);
  });

  it('should detect sort operations in execution plan', async () => {
    vi.mocked(executeQuery)
      .mockResolvedValueOnce({
        rows: [{ 'QUERY PLAN': [{ Plan: { 'Node Type': 'Sort' } }] }],
        rowCount: 1,
        fields: [],
        duration: 50,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0, fields: [], duration: 10 });

    const result = await analyzeQuery({
      query: 'SELECT * FROM users ORDER BY name, date',
      includeExecutionPlan: true,
    });

    const content = JSON.parse(result.content[0].text);
    expect(content.estimatedPlan.raw).toBeDefined();
  });

  it('should truncate long execution plan XML', async () => {
    vi.mocked(executeQuery)
      .mockResolvedValueOnce({
        rows: [{ 'QUERY PLAN': [{ Plan: { 'Plan Rows': 1 } }] }],
        rowCount: 1,
        fields: [],
        duration: 50,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0, fields: [], duration: 10 });

    const result = await analyzeQuery({
      query: 'SELECT * FROM users',
      includeExecutionPlan: true,
    });

    const content = JSON.parse(result.content[0].text);
    expect(content.estimatedPlan.raw).toBeDefined();
  });

  it('should handle execution plan errors gracefully', async () => {
    vi.mocked(executeQuery)
      .mockRejectedValueOnce(new Error('Explain permission denied'))
      .mockResolvedValueOnce({ rows: [], rowCount: 0, fields: [], duration: 10 });

    const result = await analyzeQuery({
      query: 'SELECT * FROM users',
      includeExecutionPlan: true,
    });

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.warnings).toBeDefined();
    expect(content.warnings.some((w: string) => w.includes('Could not get execution plan'))).toBe(true);
  });

  it('should handle statistics query errors gracefully', async () => {
    vi.mocked(executeQuery).mockRejectedValue(new Error('Stats error'));

    const result = await analyzeQuery({
      query: 'SELECT * FROM users',
      includeExecutionPlan: false,
    });

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.warnings).toContain('Could not retrieve query statistics');
  });

  it('should handle validation errors', async () => {
    const result = await analyzeQuery({
      query: '', // Invalid empty query
    });

    expect(result.isError).toBe(true);
  });
});

describe('analyzeQueryDefinition', () => {
  it('should have correct name', () => {
    expect(analyzeQueryDefinition.name).toBe('analyze_query');
  });

  it('should have description about analysis', () => {
    expect(analyzeQueryDefinition.description).toContain('execution plan');
  });

  it('should have query as required', () => {
    expect(analyzeQueryDefinition.inputSchema.required).toContain('query');
  });

  it('should have includeExecutionPlan with default true', () => {
    expect(analyzeQueryDefinition.inputSchema.properties.includeExecutionPlan.default).toBe(true);
  });

  it('should have params with default empty object', () => {
    expect(analyzeQueryDefinition.inputSchema.properties.params.default).toEqual({});
  });
});
