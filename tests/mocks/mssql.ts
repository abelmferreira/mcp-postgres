import { vi } from 'vitest';

// Mock SQL types
export const NVarChar = vi.fn(() => 'NVarChar');
export const BigInt = vi.fn(() => 'BigInt');
export const Float = vi.fn(() => 'Float');
export const Bit = vi.fn(() => 'Bit');
export const Int = vi.fn(() => 'Int');
export const DateTime = vi.fn(() => 'DateTime');

// Mock request object
export const createMockRequest = () => {
  const inputs: Record<string, { type: unknown; value: unknown }> = {};

  return {
    input: vi.fn((name: string, type: unknown, value: unknown) => {
      inputs[name] = { type, value };
      return this;
    }),
    query: vi.fn(async () => ({
      recordset: [],
      recordsets: [[]],
      rowsAffected: [0],
      output: {},
    })),
    getInputs: () => inputs,
  };
};

// Mock connection pool
export const createMockPool = () => {
  const mockRequest = createMockRequest();

  return {
    connected: true,
    request: vi.fn(() => mockRequest),
    close: vi.fn(async () => {}),
    on: vi.fn(),
    _mockRequest: mockRequest,
  };
};

// Mock connect function
export const connect = vi.fn(async () => createMockPool());

// Default export matching mssql package structure
export default {
  connect,
  NVarChar,
  BigInt,
  Float,
  Bit,
  Int,
  DateTime,
};
