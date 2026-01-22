import { describe, it, expect } from 'vitest';
import {
  McpError,
  QueryValidationError,
  ReadOnlyViolationError,
  ConnectionError,
  TimeoutError,
  MissingParameterError,
  InvalidOperationError,
  getErrorMessage,
} from '../../../src/utils/errors.js';

describe('McpError', () => {
  it('should create error with message and code', () => {
    const error = new McpError('test message', 'TEST_CODE');
    expect(error.message).toBe('test message');
    expect(error.code).toBe('TEST_CODE');
    expect(error.name).toBe('McpError');
  });

  it('should be instance of Error', () => {
    const error = new McpError('test', 'CODE');
    expect(error).toBeInstanceOf(Error);
  });

  it('should have stack trace', () => {
    const error = new McpError('test', 'CODE');
    expect(error.stack).toBeDefined();
  });
});

describe('QueryValidationError', () => {
  it('should create error with message', () => {
    const error = new QueryValidationError('invalid query');
    expect(error.message).toBe('invalid query');
    expect(error.code).toBe('QUERY_VALIDATION_ERROR');
    expect(error.name).toBe('QueryValidationError');
  });

  it('should store queryType', () => {
    const error = new QueryValidationError('invalid', 'DROP');
    expect(error.queryType).toBe('DROP');
  });

  it('should be instance of McpError', () => {
    const error = new QueryValidationError('test');
    expect(error).toBeInstanceOf(McpError);
  });
});

describe('ReadOnlyViolationError', () => {
  it('should create error with blocked keyword', () => {
    const error = new ReadOnlyViolationError('DELETE');
    expect(error.blockedKeyword).toBe('DELETE');
    expect(error.code).toBe('READONLY_VIOLATION');
    expect(error.name).toBe('ReadOnlyViolationError');
  });

  it('should include keyword in message', () => {
    const error = new ReadOnlyViolationError('INSERT');
    expect(error.message).toContain('INSERT');
    expect(error.message).toContain('READONLY mode');
  });

  it('should be instance of McpError', () => {
    const error = new ReadOnlyViolationError('UPDATE');
    expect(error).toBeInstanceOf(McpError);
  });
});

describe('ConnectionError', () => {
  it('should create error with message', () => {
    const error = new ConnectionError('connection failed');
    expect(error.message).toBe('connection failed');
    expect(error.code).toBe('CONNECTION_ERROR');
    expect(error.name).toBe('ConnectionError');
  });

  it('should be instance of McpError', () => {
    const error = new ConnectionError('test');
    expect(error).toBeInstanceOf(McpError);
  });
});

describe('TimeoutError', () => {
  it('should create error with timeout value', () => {
    const error = new TimeoutError(30000);
    expect(error.timeoutMs).toBe(30000);
    expect(error.code).toBe('TIMEOUT_ERROR');
    expect(error.name).toBe('TimeoutError');
  });

  it('should include timeout in message', () => {
    const error = new TimeoutError(5000);
    expect(error.message).toContain('5000ms');
  });

  it('should be instance of McpError', () => {
    const error = new TimeoutError(1000);
    expect(error).toBeInstanceOf(McpError);
  });
});

describe('MissingParameterError', () => {
  it('should create error with parameter name', () => {
    const error = new MissingParameterError('userId');
    expect(error.parameterName).toBe('userId');
    expect(error.code).toBe('MISSING_PARAMETER');
    expect(error.name).toBe('MissingParameterError');
  });

  it('should include parameter name in message', () => {
    const error = new MissingParameterError('query');
    expect(error.message).toContain('query');
  });

  it('should be instance of McpError', () => {
    const error = new MissingParameterError('test');
    expect(error).toBeInstanceOf(McpError);
  });
});

describe('InvalidOperationError', () => {
  it('should create error with message', () => {
    const error = new InvalidOperationError('cannot do this');
    expect(error.message).toBe('cannot do this');
    expect(error.code).toBe('INVALID_OPERATION');
    expect(error.name).toBe('InvalidOperationError');
  });

  it('should be instance of McpError', () => {
    const error = new InvalidOperationError('test');
    expect(error).toBeInstanceOf(McpError);
  });
});

describe('getErrorMessage', () => {
  describe('McpError handling', () => {
    it('should return message from McpError', () => {
      const error = new McpError('mcp error message', 'CODE');
      expect(getErrorMessage(error)).toBe('mcp error message');
    });

    it('should return message from QueryValidationError', () => {
      const error = new QueryValidationError('validation failed');
      expect(getErrorMessage(error)).toBe('validation failed');
    });

    it('should return message from ReadOnlyViolationError', () => {
      const error = new ReadOnlyViolationError('DELETE');
      expect(getErrorMessage(error)).toContain('DELETE');
    });
  });

  describe('regular Error handling', () => {
    it('should return message from Error', () => {
      const error = new Error('regular error');
      expect(getErrorMessage(error)).toBe('regular error');
    });

    it('should sanitize login failure messages', () => {
      const error = new Error("Login failed for user 'admin'");
      expect(getErrorMessage(error)).toBe("Login failed for user '***'");
      expect(getErrorMessage(error)).not.toContain('admin');
    });

    it('should sanitize password in messages', () => {
      const error = new Error('connection string: password=secret123');
      expect(getErrorMessage(error)).toContain('password=***');
      expect(getErrorMessage(error)).not.toContain('secret123');
    });

    it('should sanitize PASSWORD (case insensitive)', () => {
      const error = new Error('PASSWORD=mypassword, other stuff');
      // The regex replaces password= with password=*** (lowercase)
      expect(getErrorMessage(error)).toContain('password=***');
      expect(getErrorMessage(error)).not.toContain('mypassword');
    });
  });

  describe('unknown error handling', () => {
    it('should handle undefined', () => {
      expect(getErrorMessage(undefined)).toBe('An unknown error occurred');
    });

    it('should handle null', () => {
      expect(getErrorMessage(null)).toBe('An unknown error occurred');
    });

    it('should handle string', () => {
      expect(getErrorMessage('string error')).toBe('An unknown error occurred');
    });

    it('should handle number', () => {
      expect(getErrorMessage(404)).toBe('An unknown error occurred');
    });

    it('should handle object without message', () => {
      expect(getErrorMessage({ foo: 'bar' })).toBe('An unknown error occurred');
    });
  });
});
