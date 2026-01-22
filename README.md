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
| `QUERY_TIMEOUT` | `30000` | Query timeout in milliseconds (max: 120000) |
| `MAX_ROWS` | `1000` | Maximum rows to return (max: 5000) |
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
- Store credentials securely using environment variables
- Use PostgreSQL roles with minimal required permissions
- Consider network security (VPN, firewall rules) for remote connections

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

# Run MCP Inspector
npm run inspector
```

## License

MIT License - see [LICENSE](LICENSE) file for details.
