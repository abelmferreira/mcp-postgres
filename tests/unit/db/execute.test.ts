import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildInsertQuery,
  buildUpdateQuery,
  buildDeleteQuery,
} from '../../../src/db/execute.js';

describe('buildInsertQuery', () => {
  it('should build INSERT query with single column', () => {
    const result = buildInsertQuery('public', 'users', { name: 'John' });

    expect(result.query).toContain('INSERT INTO "public"."users"');
    expect(result.query).toContain('"name"');
    expect(result.query).toContain('@name');
    expect(result.query).toContain('RETURNING');
    expect(result.params).toEqual({ name: 'John' });
  });

  it('should build INSERT query with multiple columns', () => {
    const data = { name: 'John', age: 30, active: true };
    const result = buildInsertQuery('public', 'users', data);

    expect(result.query).toContain('"name", "age", "active"');
    expect(result.query).toContain('@name, @age, @active');
    expect(result.params).toEqual(data);
  });

  it('should handle different schema', () => {
    const result = buildInsertQuery('sales', 'orders', { total: 100 });

    expect(result.query).toContain('"sales"."orders"');
  });

  it('should handle null values', () => {
    const result = buildInsertQuery('public', 'users', {
      name: 'John',
      email: null,
    });

    expect(result.params.email).toBeNull();
  });

  it('should handle numeric values', () => {
    const result = buildInsertQuery('public', 'products', {
      price: 19.99,
      quantity: 5,
    });

    expect(result.params.price).toBe(19.99);
    expect(result.params.quantity).toBe(5);
  });

  it('should handle boolean values', () => {
    const result = buildInsertQuery('public', 'users', {
      name: 'John',
      active: true,
      verified: false,
    });

    expect(result.params.active).toBe(true);
    expect(result.params.verified).toBe(false);
  });
});

describe('buildUpdateQuery', () => {
  it('should build UPDATE query with single column', () => {
    const result = buildUpdateQuery(
      'public',
      'users',
      { name: 'Jane' },
      'id = @id',
      { id: 1 }
    );

    expect(result.query).toContain('UPDATE "public"."users"');
    expect(result.query).toContain('SET "name" = @name');
    expect(result.query).toContain('WHERE id = @id');
    expect(result.query).toContain('RETURNING');
    expect(result.params).toEqual({ name: 'Jane', id: 1 });
  });

  it('should build UPDATE query with multiple columns', () => {
    const result = buildUpdateQuery(
      'public',
      'users',
      { name: 'Jane', age: 25 },
      'id = @id',
      { id: 1 }
    );

    expect(result.query).toContain('"name" = @name');
    expect(result.query).toContain('"age" = @age');
    expect(result.params).toEqual({ name: 'Jane', age: 25, id: 1 });
  });

  it('should handle complex WHERE clause', () => {
    const result = buildUpdateQuery(
      'public',
      'users',
      { status: 'inactive' },
      'id = @id AND tenant_id = @tenantId',
      { id: 1, tenantId: 100 }
    );

    expect(result.query).toContain('WHERE id = @id AND tenant_id = @tenantId');
    expect(result.params).toEqual({ status: 'inactive', id: 1, tenantId: 100 });
  });

  it('should handle different schema', () => {
    const result = buildUpdateQuery(
      'sales',
      'orders',
      { status: 'shipped' },
      'id = @id',
      { id: 1 }
    );

    expect(result.query).toContain('"sales"."orders"');
  });

  it('should merge data and where params', () => {
    const result = buildUpdateQuery(
      'public',
      'users',
      { name: 'Test', email: 'test@test.com' },
      'id = @userId',
      { userId: 123 }
    );

    expect(result.params).toHaveProperty('name', 'Test');
    expect(result.params).toHaveProperty('email', 'test@test.com');
    expect(result.params).toHaveProperty('userId', 123);
  });
});

describe('buildDeleteQuery', () => {
  it('should build DELETE query', () => {
    const result = buildDeleteQuery('public', 'users', 'id = @id', { id: 1 });

    expect(result.query).toContain('DELETE FROM "public"."users"');
    expect(result.query).toContain('WHERE id = @id');
    expect(result.query).toContain('RETURNING');
    expect(result.params).toEqual({ id: 1 });
  });

  it('should handle complex WHERE clause', () => {
    const result = buildDeleteQuery(
      'public',
      'logs',
      'created_at < @date AND type = @type',
      { date: '2024-01-01', type: 'debug' }
    );

    expect(result.query).toContain(
      'WHERE created_at < @date AND type = @type'
    );
    expect(result.params).toEqual({ date: '2024-01-01', type: 'debug' });
  });

  it('should handle different schema', () => {
    const result = buildDeleteQuery('audit', 'logs', 'id = @id', { id: 1 });

    expect(result.query).toContain('"audit"."logs"');
  });

  it('should handle multiple where params', () => {
    const result = buildDeleteQuery(
      'public',
      'items',
      'user_id = @userId AND item_id = @itemId',
      { userId: 1, itemId: 2 }
    );

    expect(result.params).toEqual({ userId: 1, itemId: 2 });
  });
});

describe('SQL injection protection in query builders', () => {
  it('should use bracket notation for table names', () => {
    const result = buildInsertQuery('public', 'users; DROP TABLE users--', {
      name: 'test',
    });

    // The brackets should be around the table name
    expect(result.query).toContain('"public"."users; DROP TABLE users--"');
    // The malicious table name is enclosed in brackets, preventing injection
  });

  it('should use parameterized values', () => {
    const result = buildInsertQuery('public', 'users', {
      name: "'; DROP TABLE users; --",
    });

    // Value should be in params, not directly in query
    expect(result.params.name).toBe("'; DROP TABLE users; --");
    expect(result.query).not.toContain('DROP TABLE');
  });

  it('should use @ parameters for UPDATE values', () => {
    const result = buildUpdateQuery(
      'public',
      'users',
      { name: "Robert'); DROP TABLE users;--" },
      'id = @id',
      { id: 1 }
    );

    expect(result.query).toContain('@name');
    expect(result.params.name).toBe("Robert'); DROP TABLE users;--");
    expect(result.query).not.toContain("Robert')");
  });
});
