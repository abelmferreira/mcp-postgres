import { describe, it, expect } from 'vitest';
import { sqlConfig, READONLY_SESSION_OPTIONS } from '../../../src/db/connection.js';

describe('pool config in READONLY mode', () => {
  it('opens every session with default_transaction_read_only=on', () => {
    expect(READONLY_SESSION_OPTIONS).toBe('-c default_transaction_read_only=on');
    expect(sqlConfig.options).toBe(READONLY_SESSION_OPTIONS);
  });

  it('keeps statement_timeout and sets idle_in_transaction_session_timeout', () => {
    // QUERY_TIMEOUT=30000 in tests/setup.ts
    expect(sqlConfig.statement_timeout).toBe(30000);
    expect(sqlConfig.idle_in_transaction_session_timeout).toBe(35000);
  });
});
