/**
 * Result of query validation
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
  queryType?: string;
}

/**
 * Keywords that are blocked in READONLY mode
 */
const BLOCKED_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'CREATE',
  'TRUNCATE',
  'EXEC',
  'EXECUTE',
  'MERGE',
  'GRANT',
  'REVOKE',
  'DENY',
  'BACKUP',
  'RESTORE',
  'BULK',
  'OPENROWSET',
  'OPENDATASOURCE',
  'XP_',
  'SP_CONFIGURE',
  'SP_ADDLOGIN',
  'SP_DROPLOGIN',
  'DBCC',
  'SHUTDOWN',
  'KILL',
];

/**
 * Keywords that are allowed to start a query in READONLY mode
 */
const ALLOWED_START_KEYWORDS = ['SELECT', 'WITH', 'EXPLAIN'];

/**
 * Remove SQL comments from a query
 */
function removeComments(query: string): string {
  // Remove single-line comments (-- ...)
  let result = query.replace(/--.*$/gm, '');

  // Remove multi-line comments (/* ... */)
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');

  return result;
}

/**
 * Normalize a query for validation
 */
function normalizeQuery(query: string): string {
  return removeComments(query)
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Check if query starts with an allowed keyword
 */
function startsWithAllowed(normalizedQuery: string): boolean {
  return ALLOWED_START_KEYWORDS.some((keyword) =>
    normalizedQuery.startsWith(keyword)
  );
}

/**
 * Check for blocked keywords in the query
 */
function findBlockedKeyword(normalizedQuery: string): string | null {
  for (const keyword of BLOCKED_KEYWORDS) {
    // Use word boundary regex to avoid false positives
    // e.g., "UPDATED_AT" should not match "UPDATE"
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(normalizedQuery)) {
      return keyword;
    }
  }
  return null;
}

/**
 * Check for bypass patterns that could be used to execute dangerous operations
 */
function findBypassPattern(query: string): string | null {
  const patterns: Array<{ pattern: RegExp; description: string }> = [
    // Stacked queries
    {
      pattern: /;\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC)/i,
      description: 'Stacked query with write operation',
    },
    // SELECT INTO (creates a new table)
    {
      pattern: /\bINTO\s+[#@]?\w+\s*\(/i,
      description: 'SELECT INTO creates tables',
    },
    {
      pattern: /\bSELECT\b.*\bINTO\s+[#@]?\w+/i,
      description: 'SELECT INTO creates tables',
    },
    // FOR UPDATE/DELETE locks
    {
      pattern: /\bFOR\s+(UPDATE|DELETE)\b/i,
      description: 'FOR UPDATE/DELETE is not allowed',
    },
    // OPENQUERY with write operations
    {
      pattern: /\bOPENQUERY\s*\(/i,
      description: 'OPENQUERY is not allowed',
    },
  ];

  for (const { pattern, description } of patterns) {
    if (pattern.test(query)) {
      return description;
    }
  }

  return null;
}

/**
 * Validate a query for READONLY mode
 *
 * @param query The SQL query to validate
 * @returns Validation result with valid flag and optional reason
 */
export function validateQuery(query: string): ValidationResult {
  const normalized = normalizeQuery(query);

  // Check if query is empty
  if (!normalized) {
    return {
      valid: false,
      reason: 'Query is empty',
      queryType: 'EMPTY',
    };
  }

  // Check if query starts with allowed keyword
  if (!startsWithAllowed(normalized)) {
    const firstWord = normalized.split(' ')[0];
    return {
      valid: false,
      reason: `Query must start with SELECT or WITH (CTE). Found: ${firstWord}`,
      queryType: firstWord,
    };
  }

  // Check for blocked keywords
  const blockedKeyword = findBlockedKeyword(normalized);
  if (blockedKeyword) {
    return {
      valid: false,
      reason: `Keyword "${blockedKeyword}" is not allowed in READONLY mode`,
      queryType: blockedKeyword,
    };
  }

  // Check for bypass patterns
  const bypassPattern = findBypassPattern(query);
  if (bypassPattern) {
    return {
      valid: false,
      reason: `Query contains blocked pattern: ${bypassPattern}`,
      queryType: 'BLOCKED_PATTERN',
    };
  }

  return {
    valid: true,
    queryType: 'SELECT',
  };
}

/**
 * Check if a query is a write operation
 */
export function isWriteOperation(query: string): boolean {
  const normalized = normalizeQuery(query);
  const writeKeywords = ['INSERT', 'UPDATE', 'DELETE', 'MERGE'];

  return writeKeywords.some((keyword) => normalized.startsWith(keyword));
}

/**
 * Get the type of SQL operation from a query
 */
export function getQueryType(query: string): string {
  const normalized = normalizeQuery(query);
  const firstWord = normalized.split(' ')[0];

  // Handle special cases
  if (normalized.startsWith('WITH')) {
    return 'CTE';
  }

  if (normalized.startsWith('EXPLAIN')) {
    return 'EXPLAIN';
  }

  return firstWord;
}
