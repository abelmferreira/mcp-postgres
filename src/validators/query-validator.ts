/**
 * Result of query validation
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
  queryType?: string;
}

/**
 * Keywords that are blocked in READONLY mode.
 *
 * Checked against the query *code* only (comments and string literals are
 * removed first), so `WHERE action = 'DELETE'` is not a false positive.
 */
const BLOCKED_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'CREATE',
  'TRUNCATE',
  'COPY',
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
 * Functions that are blocked in READONLY mode.
 *
 * These either touch the server filesystem, open connections that are not
 * bound by the read-only transaction (dblink), change session settings, hold
 * locks beyond the transaction, or act on other backends / the cluster.
 * Entries are regex fragments matched against the function name (case
 * insensitive), optionally schema-qualified or double-quoted.
 *
 * Checked against the query text INCLUDING string literals, so a call hidden
 * in `query_to_xml('select pg_read_file(...)', ...)` is still caught.
 */
const BLOCKED_FUNCTIONS = [
  // Server filesystem
  'PG_READ_FILE',
  'PG_READ_BINARY_FILE',
  'PG_STAT_FILE',
  'PG_LS_\\w*',
  'PG_FILE_\\w+', // adminpack: pg_file_write, pg_file_rename, pg_file_unlink...
  // Large objects (server-side import/export and writes)
  'LO_IMPORT',
  'LO_EXPORT',
  'LO_CREATE',
  'LO_CREAT',
  'LO_UNLINK',
  'LO_FROM_BYTEA',
  'LO_PUT',
  'LO_TRUNCATE\\w*',
  'LOWRITE',
  // New connections are not bound by the read-only transaction
  'DBLINK\\w*',
  // Session/config changes
  'SET_CONFIG',
  'PG_RELOAD_CONF',
  // Other backends and cluster-level operations
  'PG_TERMINATE_BACKEND',
  'PG_CANCEL_BACKEND',
  'PG_ROTATE_LOGFILE',
  'PG_PROMOTE',
  'PG_SWITCH_WAL',
  'PG_CREATE_RESTORE_POINT',
  'PG_BACKUP_START',
  'PG_BACKUP_STOP',
  'PG_START_BACKUP',
  'PG_STOP_BACKUP',
  'PG_CREATE_\\w*REPLICATION_SLOT',
  'PG_DROP_REPLICATION_SLOT',
  'PG_COPY_\\w*REPLICATION_SLOT',
  'PG_REPLICATION_ORIGIN_\\w+',
  'PG_LOGICAL_EMIT_MESSAGE',
  'PG_IMPORT_SYSTEM_COLLATIONS',
  'PG_NOTIFY',
  // Session-level advisory locks survive ROLLBACK
  'PG_(?:TRY_)?ADVISORY_\\w+',
  // Sequence changes
  'NEXTVAL',
  'SETVAL',
];

const BLOCKED_FUNCTION_REGEX = new RegExp(
  `(?<![\\w$])"?(${BLOCKED_FUNCTIONS.join('|')})"?\\s*\\(`,
  'i'
);

/**
 * Keywords that are allowed to start a query in READONLY mode
 */
const ALLOWED_START_KEYWORDS = ['SELECT', 'WITH', 'EXPLAIN'];

/**
 * Lexed representation of a query.
 */
interface LexedQuery {
  /** Comments removed, string literals kept */
  text: string;
  /** Comments removed, string literals replaced by '' */
  code: string;
  /** True when a string literal, quoted identifier or comment is not closed */
  unterminated: boolean;
}

function isIdentChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_$\u0080-￿]/.test(ch);
}

/**
 * Minimal PostgreSQL lexer: understands `--` and nested block comments,
 * standard and E'' strings, dollar-quoted strings and quoted identifiers.
 * Regex-based comment stripping is not enough: in `SELECT '--', 1; DELETE ...`
 * a naive `--.*$` would swallow the second statement.
 */
function lexQuery(query: string): LexedQuery {
  let text = '';
  let code = '';
  let i = 0;
  const n = query.length;

  while (i < n) {
    const ch = query[i];
    const next = query[i + 1];

    // -- line comment
    if (ch === '-' && next === '-') {
      const end = query.indexOf('\n', i);
      i = end === -1 ? n : end;
      text += ' ';
      code += ' ';
      continue;
    }

    // /* block comment */ (PostgreSQL allows nesting)
    if (ch === '/' && next === '*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (query[i] === '/' && query[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (query[i] === '*' && query[i + 1] === '/') {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      if (depth > 0) {
        return { text, code, unterminated: true };
      }
      text += ' ';
      code += ' ';
      continue;
    }

    // 'string' or E'string'
    if (ch === "'") {
      const prev = query[i - 1];
      const escapes = (prev === 'E' || prev === 'e') && !isIdentChar(query[i - 2]);
      let j = i + 1;
      let closed = false;
      while (j < n) {
        if (escapes && query[j] === '\\') {
          j += 2;
          continue;
        }
        if (query[j] === "'") {
          if (query[j + 1] === "'") {
            j += 2;
            continue;
          }
          closed = true;
          break;
        }
        j++;
      }
      if (!closed) {
        return { text, code, unterminated: true };
      }
      text += query.slice(i, j + 1);
      code += "''";
      i = j + 1;
      continue;
    }

    // $tag$ dollar-quoted string $tag$ ($1 positional params are not tags)
    if (ch === '$' && !isIdentChar(query[i - 1])) {
      const match = /^\$(?:[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/.exec(
        query.slice(i)
      );
      if (match) {
        const tag = match[0];
        const end = query.indexOf(tag, i + tag.length);
        if (end === -1) {
          return { text, code, unterminated: true };
        }
        text += query.slice(i, end + tag.length);
        code += "''";
        i = end + tag.length;
        continue;
      }
    }

    // "quoted identifier" (kept in code: it is part of the statement)
    if (ch === '"') {
      let j = i + 1;
      let closed = false;
      while (j < n) {
        if (query[j] === '"') {
          if (query[j + 1] === '"') {
            j += 2;
            continue;
          }
          closed = true;
          break;
        }
        j++;
      }
      if (!closed) {
        return { text, code, unterminated: true };
      }
      const ident = query.slice(i, j + 1);
      text += ident;
      code += ident;
      i = j + 1;
      continue;
    }

    text += ch;
    code += ch;
    i++;
  }

  return { text, code, unterminated: false };
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * Normalize a query: comments removed, whitespace collapsed, upper case
 */
function normalizeQuery(query: string): string {
  return collapse(lexQuery(query).text);
}

/**
 * Check if query starts with an allowed keyword
 */
function startsWithAllowed(normalizedQuery: string): boolean {
  return ALLOWED_START_KEYWORDS.some((keyword) =>
    new RegExp(`^${keyword}\\b`).test(normalizedQuery)
  );
}

/**
 * Check for blocked keywords in the query code
 */
function findBlockedKeyword(normalizedCode: string): string | null {
  for (const keyword of BLOCKED_KEYWORDS) {
    // Word boundary avoids false positives, e.g. "UPDATED_AT" vs "UPDATE"
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(normalizedCode)) {
      return keyword;
    }
  }
  return null;
}

/**
 * Check for calls to blocked functions
 */
function findBlockedFunction(normalizedText: string): string | null {
  const match = BLOCKED_FUNCTION_REGEX.exec(normalizedText);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Only one statement is allowed. A trailing semicolon is tolerated.
 */
function hasMultipleStatements(code: string): boolean {
  return code
    .replace(/"(?:[^"]|"")*"/g, '""') // quoted identifiers may contain ';'
    .replace(/[\s;]+$/, '')
    .includes(';');
}

/**
 * Check for bypass patterns that could be used to execute dangerous operations
 */
function findBypassPattern(normalizedCode: string): string | null {
  const patterns: Array<{ pattern: RegExp; description: string }> = [
    // SELECT INTO (creates a new table)
    {
      pattern: /\bINTO\s+[#@]?\w+\s*\(/i,
      description: 'SELECT INTO creates tables',
    },
    {
      pattern: /\bSELECT\b.*\bINTO\s+[#@]?\w+/i,
      description: 'SELECT INTO creates tables',
    },
    // Row-locking clauses
    {
      pattern: /\bFOR\s+(UPDATE|DELETE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)\b/i,
      description: 'FOR UPDATE/SHARE locking clauses are not allowed',
    },
    // OPENQUERY with write operations
    {
      pattern: /\bOPENQUERY\s*\(/i,
      description: 'OPENQUERY is not allowed',
    },
  ];

  for (const { pattern, description } of patterns) {
    if (pattern.test(normalizedCode)) {
      return description;
    }
  }

  return null;
}

/**
 * Validate a query for READONLY mode
 *
 * This is only the first line of defense: in READONLY mode the database
 * session defaults to read-only and every query runs inside a READ ONLY
 * transaction (see src/db/connection.ts and src/db/execute.ts).
 *
 * @param query The SQL query to validate
 * @returns Validation result with valid flag and optional reason
 */
export function validateQuery(query: string): ValidationResult {
  const lexed = lexQuery(query);
  const normalized = collapse(lexed.text);
  const normalizedCode = collapse(lexed.code);

  if (lexed.unterminated) {
    return {
      valid: false,
      reason: 'Query has an unterminated string, quoted identifier or comment',
      queryType: 'INVALID',
    };
  }

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
  const blockedKeyword = findBlockedKeyword(normalizedCode);
  if (blockedKeyword) {
    return {
      valid: false,
      reason: `Keyword "${blockedKeyword}" is not allowed in READONLY mode`,
      queryType: blockedKeyword,
    };
  }

  // Check for blocked functions
  const blockedFunction = findBlockedFunction(normalized);
  if (blockedFunction) {
    return {
      valid: false,
      reason: `Function "${blockedFunction}" is not allowed in READONLY mode`,
      queryType: 'BLOCKED_FUNCTION',
    };
  }

  // Only a single statement
  if (hasMultipleStatements(lexed.code)) {
    return {
      valid: false,
      reason: 'Query contains blocked pattern: multiple statements are not allowed',
      queryType: 'BLOCKED_PATTERN',
    };
  }

  // Check for bypass patterns
  const bypassPattern = findBypassPattern(normalizedCode);
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
