import { describe, it, expect } from 'vitest';
import {
  formatSuccess,
  formatError,
  truncate,
  formatBytes,
  formatDuration,
  formatNumber,
  textContent,
  jsonContent,
} from '../../../src/utils/formatters.js';

describe('truncate', () => {
  it('should not truncate short strings', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('should truncate long strings', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('should use default maxLength of 500', () => {
    const longString = 'a'.repeat(600);
    const result = truncate(longString);
    expect(result.length).toBe(500);
    expect(result.endsWith('...')).toBe(true);
  });

  it('should handle exact length strings', () => {
    expect(truncate('12345', 5)).toBe('12345');
  });

  it('should handle empty strings', () => {
    expect(truncate('', 10)).toBe('');
  });
});

describe('formatBytes', () => {
  it('should format bytes', () => {
    expect(formatBytes(500)).toBe('500.00 B');
  });

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1536)).toBe('1.50 KB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.50 MB');
  });

  it('should format gigabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
  });

  it('should format terabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1.00 TB');
  });

  it('should handle zero', () => {
    expect(formatBytes(0)).toBe('0.00 B');
  });
});

describe('formatDuration', () => {
  it('should format milliseconds', () => {
    expect(formatDuration(100)).toBe('100ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('should format seconds', () => {
    expect(formatDuration(1000)).toBe('1s');
    expect(formatDuration(5000)).toBe('5s');
    expect(formatDuration(30000)).toBe('30s');
  });

  it('should format minutes and seconds', () => {
    expect(formatDuration(60000)).toBe('1m 0s');
    expect(formatDuration(90000)).toBe('1m 30s');
    expect(formatDuration(150000)).toBe('2m 30s');
  });

  it('should format hours, minutes, and seconds', () => {
    expect(formatDuration(3600000)).toBe('1h 0m 0s');
    expect(formatDuration(3661000)).toBe('1h 1m 1s');
    expect(formatDuration(7265000)).toBe('2h 1m 5s');
  });

  it('should handle zero', () => {
    expect(formatDuration(0)).toBe('0ms');
  });
});

describe('formatNumber', () => {
  it('should format small numbers', () => {
    expect(formatNumber(123)).toBe('123');
  });

  it('should format thousands', () => {
    expect(formatNumber(1234)).toBe('1,234');
    expect(formatNumber(12345)).toBe('12,345');
  });

  it('should format millions', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('should handle zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('should handle negative numbers', () => {
    expect(formatNumber(-1234)).toBe('-1,234');
  });

  it('should handle decimals', () => {
    // Decimal formatting depends on locale, just check it doesn't throw
    expect(() => formatNumber(1234.56)).not.toThrow();
  });
});

describe('formatSuccess', () => {
  it('should format string data', () => {
    const result = formatSuccess('test data');
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe('"test data"');
    expect(result.isError).toBeUndefined();
  });

  it('should format object data', () => {
    const result = formatSuccess({ name: 'test', value: 123 });
    expect(result.content[0].text).toContain('"name": "test"');
    expect(result.content[0].text).toContain('"value": 123');
  });

  it('should format array data', () => {
    const result = formatSuccess([1, 2, 3]);
    expect(result.content[0].text).toContain('[');
    expect(result.content[0].text).toContain('1');
  });

  it('should format null data', () => {
    const result = formatSuccess(null);
    expect(result.content[0].text).toBe('null');
  });

  it('should pretty print JSON', () => {
    const result = formatSuccess({ a: 1 });
    expect(result.content[0].text).toContain('\n');
  });
});

describe('formatError', () => {
  it('should format Error objects', () => {
    const result = formatError(new Error('test error'));
    expect(result.content[0].text).toBe('Error: test error');
    expect(result.isError).toBe(true);
  });

  it('should format string errors', () => {
    const result = formatError('string error');
    expect(result.isError).toBe(true);
  });

  it('should format unknown error types', () => {
    const result = formatError(undefined);
    expect(result.content[0].text).toContain('Error:');
    expect(result.isError).toBe(true);
  });

  it('should set isError flag', () => {
    const result = formatError(new Error('test'));
    expect(result.isError).toBe(true);
  });
});

describe('textContent', () => {
  it('should create text content array', () => {
    const result = textContent('hello');
    expect(result).toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('should handle empty string', () => {
    const result = textContent('');
    expect(result).toEqual([{ type: 'text', text: '' }]);
  });
});

describe('jsonContent', () => {
  it('should create JSON content array', () => {
    const result = jsonContent({ key: 'value' });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('text');
    expect(result[0].text).toContain('"key": "value"');
  });

  it('should pretty print JSON', () => {
    const result = jsonContent({ a: 1, b: 2 });
    expect(result[0].text).toContain('\n');
  });

  it('should handle arrays', () => {
    const result = jsonContent([1, 2, 3]);
    expect(result[0].text).toContain('[');
  });
});
