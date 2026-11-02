# MCP PostgreSQL

[![npm version](https://img.shields.io/npm/v/%40fabriciofs%2Fmcp-postgres?cacheSeconds=300)](https://www.npmjs.com/package/@fabriciofs/mcp-postgres)
[![Build Status](https://github.com/fabriciofs/mcp-postgres/actions/workflows/test.yml/badge.svg)](https://github.com/fabriciofs/mcp-postgres/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/fabriciofs/mcp-postgres/branch/main/graph/badge.svg)](https://codecov.io/gh/fabriciofs/mcp-postgres)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)

A Model Context Protocol (MCP) server for PostgreSQL integration with Claude Code. Query, monitor, and analyze your PostgreSQL databases directly from Claude.

## Features

- **Query Execution** - Execute SELECT queries with parameterized inputs
- **Schema Exploration** - Browse tables, columns, procedures, and indexes
- **Database Monitoring** - Track active queries, blocking sessions, wait stats, and connections
- **Performance Analysis** - Identify missing indexes, unused indexes, and fragmentation
- **Write Operations** - INSERT, UPDATE, DELETE when enabled (READONLY=false)

## Installation

### Option 1: From npm (recommended)

```bash
npx @fabriciofs/mcp-postgres
```

### Option 2: Global installation

```bash
npm install -g @fabriciofs/mcp-postgres
```

### Option 3: Clone and build locally

```bash
git clone https://github.com/fabriciofs/mcp-postgres.git
cd mcp-postgres
npm install
npm run build
```

## Configuration

### Claude Code Integration

Add to your Claude Code MCP settings (`~/.claude/settings.json` or project `.claude/settings.json`):

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@fabriciofs/mcp-postgres"],
      "env": {
        "SQL_CONNECTION_URL": "postgres://user:password@localhost:5432/database",
        "READONLY": "true"
      }
    }
  }
}
```

Or with individual connection parameters:

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@fabriciofs/mcp-postgres"],
      "env": {
        "SQL_SERVER": "localhost",
        "SQL_DATABASE": "mydb",
        "SQL_USER": "postgres",
        "SQL_PASSWORD": "yourpassword",
        "SQL_PORT": "5432",
        "SQL_SSL": "false",
        "READONLY": "true"
      }
    }
  }
}
```

### Environment Variables

#### Connection (choose one method)

**Method 1: Connection URL**
```bash
SQL_CONNECTION_URL=postgres://user:password@host:port/database?ssl=false
```

**Method 2: Individual Parameters**
```bash
SQL_SERVER=localhost
SQL_DATABASE=mydb
SQL_USER=postgres
SQL_PASSWORD=yourpassword
SQL_PORT=5432              # Optional, default: 5432
SQL_SSL=false              # Optional, default: false
```

#### Required Settings

| Variable | Description |
|----------|-------------|
| `READONLY` | **Required.** Set to `true` for read-only mode or `false` to enable write operations |

#### Optional Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `QUERY_TIMEOUT` | `30000` | Query timeout in milliseconds (max: 120000). Sent as `statement_timeout`; `idle_in_transaction_session_timeout` is set to this value + 5s |
| `MAX_ROWS` | `1000` | Hard cap for rows returned per query (max: 5000). A tool's `maxRows` above it is lowered to it |
| `POOL_MIN` | `2` | Minimum connection pool size |
| `POOL_MAX` | `10` | Maximum connection pool size |
| `LOG_LEVEL` | `info` | Log level: debug, info, warn, error |

## Available Tools

### Query Tools

| Tool | Description |
|------|-------------|
| `sql_execute` | Execute SELECT queries with parameterized inputs |

### Schema Tools

| Tool | Description |
|------|-------------|
| `schema_list_tables` | List all tables and views in the database |
| `schema_describe_table` | Get detailed table information (columns, indexes, foreign keys) |
| `schema_list_columns` | Search for columns across all tables |
| `schema_list_procedures` | List stored procedures |
| `schema_list_indexes` | List indexes with usage statistics |

### Monitor Tools

| Tool | Description |
|------|-------------|
| `monitor_active_queries` | Monitor currently running queries |
| `monitor_blocking` | Monitor blocking sessions and lock chains |
| `monitor_wait_stats` | Monitor wait statistics for performance bottlenecks |
| `monitor_database_size` | Monitor database size and file usage |
| `monitor_connections` | Monitor active connections |
| `monitor_performance_counters` | Monitor PostgreSQL performance metrics |

### Analysis Tools

| Tool | Description |
|------|-------------|
| `analyze_query` | Analyze query execution plan and statistics |
| `analyze_suggest_indexes` | Suggest missing indexes based on query patterns |
| `analyze_unused_indexes` | Find indexes that are not being used |
| `analyze_duplicate_indexes` | Find duplicate or overlapping indexes |
| `analyze_fragmentation` | Analyze index fragmentation levels |
| `analyze_statistics` | Analyze table statistics for stale data |

### Write Tools (READONLY=false only)

| Tool | Description |
|------|-------------|
| `sql_insert` | Insert a row into a table |
| `sql_update` | Update rows in a table |
| `sql_delete` | Delete rows from a table |

## Usage Examples

Once configured, you can ask Claude to interact with your database:

```
"List all tables in the database"
"Describe the Users table"
"Show me active queries running for more than 5 seconds"
"Find unused indexes in the Orders table"
"Analyze the fragmentation of all indexes"
"What are the top wait statistics?"
```

## Security Considerations

- **Always use READONLY=true in production** unless write access is explicitly required
- Even with READONLY=true, connect with a role that has only the privileges it needs
  (ideally `SELECT` only, not a superuser and without `pg_read_server_files`,
  `pg_write_server_files` or `pg_execute_server_program`)
- Store credentials securely using environment variables
- Use PostgreSQL roles with minimal required permissions
- Consider network security (VPN, firewall rules) for remote connections

### How READONLY=true is enforced

READONLY is enforced in layers, so a query that slips past one of them is still stopped by the database:

1. **Session default.** Every pooled connection is opened with the startup option
   `-c default_transaction_read_only=on`. It is applied by the server before any query
   runs (no race with a `SET` issued after connecting) and also covers queries that do not
   go through `sql_execute`.
   PgBouncer in transaction/statement mode rejects the `options` startup parameter unless
   it is in `ignore_startup_parameters`; layer 2 does not depend on it.
2. **READ ONLY transaction per query.** Each query runs on a dedicated connection as
   `BEGIN TRANSACTION READ ONLY` → `SELECT 1` → *query* → `ROLLBACK`. The `SELECT 1` takes the
   transaction snapshot: PostgreSQL only accepts `SET transaction_read_only = off` (or
   `set_config(...)`) before the first snapshot, so the user query can no longer turn the
   transaction read-write. The final `ROLLBACK` also reverts any session setting changed
   inside it (e.g. `set_config('default_transaction_read_only', 'off', false)`).
3. **Single statement.** The query is sent with the extended protocol (server-side portal),
   where PostgreSQL rejects more than one statement per call.
4. **Query validator** (first, cheapest filter, with clearer errors). It understands
   comments, standard/`E''`/dollar-quoted strings and quoted identifiers, and rejects:
   - queries that do not start with `SELECT`, `WITH` or `EXPLAIN`;
   - more than one statement (a trailing `;` is fine);
   - write/DDL keywords in the query code (`INSERT`, `UPDATE`, `DELETE`, `CREATE`, `DROP`,
     `ALTER`, `TRUNCATE`, `COPY`, `MERGE`, `GRANT`, `REVOKE`, ...), including data-modifying CTEs;
   - `SELECT ... INTO` and row-locking clauses (`FOR UPDATE/SHARE/NO KEY UPDATE/KEY SHARE`);
   - dangerous functions, even when written inside a string literal: server file access
     (`pg_read_file`, `pg_read_binary_file`, `pg_stat_file`, `pg_ls_*`, adminpack `pg_file_*`),
     large-object import/export/writes (`lo_import`, `lo_export`, `lo_unlink`, ...), `dblink*`
     (opens a new connection outside the read-only transaction), `set_config`,
     `pg_reload_conf`, `pg_terminate_backend`/`pg_cancel_backend`, replication/backup control,
     `pg_notify`, advisory locks (session locks survive `ROLLBACK`), `nextval`/`setval`.
   - unterminated strings, quoted identifiers or comments.

   Not blocked by the validator (left to the database layers above or to role privileges):
   `EXPLAIN ANALYZE SELECT ...` (it executes the query, but inside the READ ONLY transaction),
   `pg_sleep` (bounded by `statement_timeout`), functions that run SQL given as text such as
   `query_to_xml` (they run inside the same READ ONLY transaction), user-defined functions
   that write (rejected by the database), and `U&"..."` Unicode-escaped identifiers.

### Row limit

The row limit is applied on the server: the query runs through a portal and only
`maxRows + 1` rows are fetched (works for `SELECT`, `WITH` and `EXPLAIN` without rewriting
the query). The extra row only tells whether there is more data: results report
`truncated: true` in that case, and `rowCount` is the number of rows returned.

### Query log

Every executed query is logged at `info` level (stderr) with its duration, number of rows
returned, `truncated`, number of parameters and the first 200 characters of the query text.
Parameter values are never logged; avoid putting secrets as literals in the query text.

## Requirements

- Node.js >= 20.0.0
- PostgreSQL 12 or later
- Appropriate PostgreSQL permissions for the operations you want to perform

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Development mode (watch)
npm run dev

# Type check
npm run typecheck

# Tests (the real-PostgreSQL READONLY tests run only when TEST_PG_URL points to a
# disposable database where the user can create a table; otherwise they are skipped)
npm test
TEST_PG_URL=postgres://user:pass@host:5432/db npm test

# Run MCP Inspector
npm run inspector
```

## License

MIT License - see [LICENSE](LICENSE) file for details.
