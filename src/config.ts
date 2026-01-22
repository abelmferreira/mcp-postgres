import { z } from 'zod';

/**
 * Parsed connection URL components
 */
interface ParsedConnectionUrl {
  server: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

/**
 * Parse PostgreSQL connection URL
 * Format: postgres://user:password@host:port/database?param=value
 *
 * Supported query parameters:
 * - ssl (true/false/disable)
 */
function parseConnectionUrl(url: string): ParsedConnectionUrl {
  // Handle postgres:// and postgresql:// protocols
  const normalizedUrl = url.replace(/^(postgres|postgresql):\/\//, 'http://');

  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    throw new Error(`Invalid connection URL format: ${url}`);
  }

  const server = parsed.hostname;
  if (!server) {
    throw new Error('Connection URL must include a server/host');
  }

  const port = parsed.port ? parseInt(parsed.port, 10) : 5432;
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port in connection URL: ${parsed.port}`);
  }

  // Database is the pathname without leading slash
  const database = parsed.pathname.replace(/^\//, '');
  if (!database) {
    throw new Error('Connection URL must include a database name');
  }

  const user = decodeURIComponent(parsed.username);
  if (!user) {
    throw new Error('Connection URL must include a username');
  }

  const password = decodeURIComponent(parsed.password);
  if (!password) {
    throw new Error('Connection URL must include a password');
  }

  // Parse query parameters
  const params = parsed.searchParams;

  // Handle ssl parameter (true/false/disable)
  let ssl = false; // default
  const sslParam = params.get('ssl');
  if (sslParam !== null) {
    ssl = sslParam.toLowerCase() !== 'false' && sslParam.toLowerCase() !== 'disable';
  }

  return {
    server,
    port,
    database,
    user,
    password,
    ssl,
  };
}

/**
 * Environment variables schema with validation
 * Supports two modes:
 * 1. Connection URL: Set SQL_CONNECTION_URL with full connection string
 * 2. Individual parameters: Set SQL_SERVER, SQL_DATABASE, SQL_USER, SQL_PASSWORD
 */
const envSchema = z.object({
   // PostgreSQL Connection URL (Optional - alternative to individual params)
  SQL_CONNECTION_URL: z.string().optional(),

  // PostgreSQL Connection (Required if URL not provided)
  SQL_SERVER: z.string().optional(),
  SQL_DATABASE: z.string().optional(),
  SQL_USER: z.string().optional(),
  SQL_PASSWORD: z.string().optional(),

  // PostgreSQL Connection (Optional)
  SQL_PORT: z
    .string()
    .default('5432')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive().max(65535)),

  SQL_SSL: z
    .string()
    .default('false')
    .transform((val) => val.toLowerCase() === 'true'),

  // Operation Mode (REQUIRED)
  READONLY: z
    .string()
    .min(1, 'READONLY environment variable is required. Set to "true" for read-only mode or "false" for full access.')
    .refine((val) => val === 'true' || val === 'false', {
      message: 'READONLY must be "true" or "false"',
    })
    .transform((val) => val === 'true'),

  // Performance Settings (Optional)
  QUERY_TIMEOUT: z
    .string()
    .default('30000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive().max(120000)),

  MAX_ROWS: z
    .string()
    .default('1000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive().max(5000)),

  POOL_MIN: z
    .string()
    .default('2')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().nonnegative()),

  POOL_MAX: z
    .string()
    .default('10')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  // Logging (Optional)
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

/**
 * Final validated configuration type with resolved connection details
 */
export interface Config {
  SQL_SERVER: string;
  SQL_DATABASE: string;
  SQL_USER: string;
  SQL_PASSWORD: string;
  SQL_PORT: number;
  SQL_SSL: boolean;
  READONLY: boolean;
  QUERY_TIMEOUT: number;
  MAX_ROWS: number;
  POOL_MIN: number;
  POOL_MAX: number;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Load and validate configuration from environment variables
 * Supports both connection URL and individual parameters
 */
function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('[MCP] Configuration error:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    console.error('');
    console.error('[MCP] Please check your environment variables or .env file.');
    console.error('[MCP] See .env.example for required configuration.');
    process.exit(1);
  }

  const env = result.data;

  // Check if connection URL is provided
  if (env.SQL_CONNECTION_URL) {
    try {
      const parsed = parseConnectionUrl(env.SQL_CONNECTION_URL);
      return {
        SQL_SERVER: parsed.server,
        SQL_DATABASE: parsed.database,
        SQL_USER: parsed.user,
        SQL_PASSWORD: parsed.password,
        SQL_PORT: parsed.port,
        SQL_SSL: parsed.ssl,
        READONLY: env.READONLY,
        QUERY_TIMEOUT: env.QUERY_TIMEOUT,
        MAX_ROWS: env.MAX_ROWS,
        POOL_MIN: env.POOL_MIN,
        POOL_MAX: env.POOL_MAX,
        LOG_LEVEL: env.LOG_LEVEL,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[MCP] Configuration error:');
      console.error(`  - SQL_CONNECTION_URL: ${message}`);
      console.error('');
      console.error('[MCP] Connection URL format:');
      console.error('  postgres://user:password@host:port/database?ssl=true');
      process.exit(1);
    }
  }

  // Validate individual parameters are provided
  const missingParams: string[] = [];
  if (!env.SQL_SERVER) missingParams.push('SQL_SERVER');
  if (!env.SQL_DATABASE) missingParams.push('SQL_DATABASE');
  if (!env.SQL_USER) missingParams.push('SQL_USER');
  if (!env.SQL_PASSWORD) missingParams.push('SQL_PASSWORD');

  if (missingParams.length > 0) {
    console.error('[MCP] Configuration error:');
    console.error('  Either SQL_CONNECTION_URL or individual connection parameters are required.');
    console.error('');
    console.error('  Missing parameters:');
    for (const param of missingParams) {
      console.error(`    - ${param}`);
    }
    console.error('');
    console.error('[MCP] Option 1 - Use connection URL:');
    console.error('  SQL_CONNECTION_URL=postgres://user:password@host:port/database');
    console.error('');
    console.error('[MCP] Option 2 - Use individual parameters:');
    console.error('  SQL_SERVER, SQL_DATABASE, SQL_USER, SQL_PASSWORD');
    console.error('');
    console.error('[MCP] See .env.example for complete configuration options.');
    process.exit(1);
  }

  return {
    SQL_SERVER: env.SQL_SERVER!,
    SQL_DATABASE: env.SQL_DATABASE!,
    SQL_USER: env.SQL_USER!,
    SQL_PASSWORD: env.SQL_PASSWORD!,
    SQL_PORT: env.SQL_PORT,
    SQL_SSL: env.SQL_SSL,
    READONLY: env.READONLY,
    QUERY_TIMEOUT: env.QUERY_TIMEOUT,
    MAX_ROWS: env.MAX_ROWS,
    POOL_MIN: env.POOL_MIN,
    POOL_MAX: env.POOL_MAX,
    LOG_LEVEL: env.LOG_LEVEL,
  };
}

/**
 * Global configuration object
 */
export const config = loadConfig();
