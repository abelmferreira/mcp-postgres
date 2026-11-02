# MCP PostgreSQL

[![npm version](https://img.shields.io/npm/v/%40abelmferreira%2Fmcp-postgres?cacheSeconds=300)](https://www.npmjs.com/package/@abelmferreira/mcp-postgres)
[![CI](https://github.com/abelmferreira/mcp-postgres/actions/workflows/ci.yml/badge.svg)](https://github.com/abelmferreira/mcp-postgres/actions/workflows/ci.yml)
[![Docker Image Version](https://img.shields.io/docker/v/abelmferreira/mcp-postgres?sort=semver&label=docker)](https://hub.docker.com/r/abelmferreira/mcp-postgres)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.12-green.svg)](https://nodejs.org/)

A Model Context Protocol (MCP) server for PostgreSQL integration with Claude Code. Query, monitor, and analyze your PostgreSQL databases directly from Claude.

> This is a fork of [`@fabriciofs/mcp-postgres`](https://github.com/fabriciofs/mcp-postgres) (MIT) by fabriciofs.
> It adds a database-enforced read-only mode, a built-in SSH tunnel, `ENV_FILE` support and a Docker image.
> See [CHANGELOG.md](CHANGELOG.md) for the differences.

## Features

- **Query Execution** - Execute SELECT queries with parameterized inputs
- **Schema Exploration** - Browse tables, columns, procedures, and indexes
- **Database Monitoring** - Track active queries, blocking sessions, wait stats, and connections
- **Performance Analysis** - Identify missing indexes, unused indexes, and fragmentation
- **Built-in SSH tunnel** - reach a database behind a bastion host with nothing but environment variables; the host key is always pinned
- **Write Operations** - INSERT, UPDATE, DELETE when enabled (READONLY=false)

## Installation

### Option 1: From npm (recommended)

```bash
npx @abelmferreira/mcp-postgres
```

### Option 2: Global installation

```bash
npm install -g @abelmferreira/mcp-postgres
```

### Option 3: Clone and build locally

```bash
git clone https://github.com/abelmferreira/mcp-postgres.git
cd mcp-postgres
npm install
npm run build
```

### Option 4: Docker

```bash
docker run -i --rm --env-file .env abelmferreira/mcp-postgres
```

See [Running with Docker](#running-with-docker) below.

## Configuration

### Claude Code Integration

Add to your Claude Code MCP settings (`~/.claude/settings.json` or project `.claude/settings.json`):

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@abelmferreira/mcp-postgres"],
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
      "args": ["-y", "@abelmferreira/mcp-postgres"],
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

### Through an SSH tunnel (environment variables only)

When `SSH_HOST` is set the server opens the tunnel itself (an in-process `ssh -L` on a random `127.0.0.1` port). No `ssh` binary, helper script or Docker is needed. `SQL_SERVER:SQL_PORT` is the database address **as seen from the SSH host**.

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@abelmferreira/mcp-postgres"],
      "env": {
        "SQL_SERVER": "192.0.2.10",
        "SQL_PORT": "5432",
        "SQL_DATABASE": "mydb",
        "SQL_USER": "readonly_user",
        "SQL_PASSWORD": "password",
        "READONLY": "true",
        "SSH_HOST": "bastion.example.com",
        "SSH_USER": "tunnel",
        "SSH_KEY_PATH": "~/.ssh/mcp_tunnel_key",
        "SSH_HOST_FINGERPRINT": "SHA256:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

- `SSH_KEY_PATH` is a path on the machine running the MCP server. `~` is expanded; relative paths are resolved against the working directory chosen by the MCP client, so prefer absolute or `~/` paths.
- Encrypted keys need `SSH_KEY_PASSPHRASE`. A dedicated key without passphrase, restricted on the server (see below), is usually simpler.
- `SSH_HOST_FINGERPRINT` is mandatory: the host key is always verified and there is no "trust on first use". Get it with `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the server, or `ssh-keyscan bastion.example.com | ssh-keygen -lf -` (and confirm it through another channel). A comma separated list is accepted (one per host key algorithm).
- The SSH session is opened before the first use of the pool (at startup), so a bad key, host or fingerprint fails fast with a clear message on stderr. It is re-established automatically if it drops, and closed together with the pool (SIGINT/SIGTERM).
- **SSL through the tunnel** (`SQL_SSL=true`): TLS is negotiated end to end with PostgreSQL inside the tunnel. The pool connects to `127.0.0.1`, but the TLS `servername` (SNI) is still `SQL_SERVER` when it is a hostname, so a proxy/pooler that routes on SNI keeps working. As without the tunnel, the server certificate is **not** verified (`rejectUnauthorized: false`).

**Restrict the tunnel key on the SSH server.** In `~/.ssh/authorized_keys` of the tunnel user:

```
restrict,port-forwarding,permitopen="192.0.2.10:5432",command="/usr/sbin/nologin" ssh-ed25519 AAAA... mcp-tunnel
```

`restrict` disables everything (PTY, agent/X11 forwarding, user rc), `port-forwarding` re-enables only local forwarding, and `permitopen` limits it to the database address. `restrict` alone does **not** stop the key from running commands or opening a shell, so `command="/usr/sbin/nologin"` is needed to make it useless for anything but the tunnel.

### Pointing to a project `.env` file (`ENV_FILE`)

Keep the configuration in a `.env` file of your project (git-ignored) and point the server at it:

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@abelmferreira/mcp-postgres"],
      "env": {
        "ENV_FILE": "/path/to/project/.env"
      }
    }
  }
}
```

- The file uses the usual dotenv syntax (`KEY=value`, `# comments`, quotes) and may contain any variable from the [tables below](#environment-variables), including `SSH_*`.
- Variables set in the `env` block **win** over the file (same precedence as `node --env-file`), so you can share one file and override, for example, `READONLY` per client.
- `~` is expanded; relative paths are resolved against the working directory of the server process.
- A missing or unreadable file stops the server with an error on stderr (exit code 1). Values are never logged.

### Running with Docker

The image `abelmferreira/mcp-postgres` (linux/amd64 and linux/arm64) runs the same server as the npm package, as the unprivileged `node` user (uid 1000). MCP talks over stdio, so always pass `-i`; no port is published.

```bash
docker run -i --rm --env-file .env abelmferreira/mcp-postgres
```

`.mcp.json` (or Claude Code settings):

```json
{
  "mcpServers": {
    "postgres": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "--env-file", "/path/to/project/.env",
        "abelmferreira/mcp-postgres"
      ]
    }
  }
}
```

- Inside the container `localhost` is the container itself. To reach a database on the host use `host.docker.internal` (add `--add-host=host.docker.internal:host-gateway` on Linux) or `--network host`.
- `docker --env-file` does not strip quotes and has no `#` inline comments: write `KEY=value` lines without quotes. Alternatively mount the file and use `ENV_FILE`, which uses the dotenv syntax:

  ```bash
  docker run -i --rm \
    -v /path/to/project/.env:/config/.env:ro \
    -e ENV_FILE=/config/.env \
    abelmferreira/mcp-postgres
  ```

- **SSH tunnel** works in the container as well. Mount the private key read-only and point `SSH_KEY_PATH` to the path inside the container:

  ```bash
  docker run -i --rm \
    --env-file /path/to/project/.env \
    -v ~/.ssh/mcp_tunnel_key:/run/secrets/ssh_key:ro \
    -e SSH_KEY_PATH=/run/secrets/ssh_key \
    abelmferreira/mcp-postgres
  ```

  The key must be readable by uid 1000. If the file is `0600` and owned by another uid, add `--user "$(id -u):$(id -g)"`.
- The server exits when the client closes stdin or stops the container (SIGINT/SIGTERM), closing the pool and the tunnel.

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
| `ENV_FILE` | - | Path of a dotenv file to load first. Variables already in the environment win. `~` and relative paths are supported |

#### SSH tunnel (optional)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SSH_HOST` | no | - | Enables the built-in SSH tunnel. `SQL_SERVER:SQL_PORT` is then the database address as seen from the SSH host |
| `SSH_PORT` | no | `22` | SSH port |
| `SSH_USER` | with `SSH_HOST` | - | SSH user |
| `SSH_KEY_PATH` | with `SSH_HOST` | - | Private key path (`~` supported) |
| `SSH_KEY_PASSPHRASE` | no | - | Passphrase of an encrypted key |
| `SSH_HOST_FINGERPRINT` | with `SSH_HOST` | - | Pinned host key fingerprint(s), `SHA256:...`, comma separated |

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
- With the SSH tunnel the host key is always verified (`SSH_HOST_FINGERPRINT`), the local end listens on `127.0.0.1` only, and the key, passphrase and database password never appear in logs or error messages

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

- Node.js >= 20.12.0
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

# End-to-end test of the SSH tunnel (sshd + postgres:18-alpine in throwaway
# containers on internal docker networks, random password, per-run keys).
# Without the TEST_SSH_* variables that test is skipped by `npm test`.
./scripts/e2e-ssh-tunnel.sh

# Run MCP Inspector
npm run inspector

# Docker: unit tests inside the build, then the runtime image
docker build --target test .
docker build -t mcp-postgres:local .
```

## Publishing

Releases are published by GitHub Actions when a `v*` tag is pushed. The tag must match `version` in `package.json` (e.g. `v1.1.0`), otherwise the workflows fail.

1. Update `version` in `package.json` (and `package-lock.json`) and `CHANGELOG.md`, commit.
2. `git tag v1.1.0 && git push origin v1.1.0`.
3. `publish-npm.yml` runs the tests and publishes `@abelmferreira/mcp-postgres` to npm with
   [Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (OIDC, no npm token stored in
   the repository) and provenance.
4. `publish-docker.yml` builds `abelmferreira/mcp-postgres` for linux/amd64 and linux/arm64 and
   pushes the tags `X.Y.Z`, `X.Y`, `X` and `latest` (pre-releases such as `v1.2.0-rc.1` only get
   their own tag).

The npm trusted publisher is configured on npmjs.com (package settings) with owner
`abelmferreira`, repository `mcp-postgres` and workflow `publish-npm.yml`.

The first publish has to be manual and has pitfalls (provenance, 2FA bypass token); see [docs/RELEASING.md](docs/RELEASING.md).

## License

MIT License - see [LICENSE](LICENSE) file for details. Original work by fabriciofs
([`@fabriciofs/mcp-postgres`](https://github.com/fabriciofs/mcp-postgres)); fork maintained by Abel Ferreira.
