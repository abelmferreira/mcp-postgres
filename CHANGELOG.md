# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.1.0] - unreleased

First release of the fork, published as `@abelmferreira/mcp-postgres`
(npm) and `abelmferreira/mcp-postgres` (Docker Hub). Based on
`@fabriciofs/mcp-postgres` 1.0.1.

### Added

- Built-in SSH tunnel (`ssh2`), configured only through `SSH_*` variables; the
  host key is always pinned (`SSH_HOST_FINGERPRINT`).
- `ENV_FILE`: load a dotenv file before validating the configuration
  (variables already in the environment win).
- `truncated` flag in query results when more rows were available.
- Query log (duration, rows, `truncated`, parameter count, first 200
  characters of the query; parameter values are never logged).
- Docker image (multi-stage, non-root) and GitHub Actions for CI and
  publishing (npm Trusted Publishing with provenance, multi-arch image).

### Changed

- `READONLY=true` is enforced by the database too: sessions start with
  `default_transaction_read_only=on` and every query runs inside a
  `READ ONLY` transaction that is rolled back.
- Hardened query validator (comments, dollar-quoted strings, quoted
  identifiers, single statement, dangerous functions).
- Rows are limited on the server (portal fetching `maxRows + 1`); `maxRows`
  is capped by `MAX_ROWS`.
- **Behaviour change:** `rowCount` is now the number of rows returned, not
  the total the query would produce.
- `idle_in_transaction_session_timeout` is set to `QUERY_TIMEOUT` + 5s.
- The connection URL no longer appears in error messages.
- Minimum Node.js version is 20.12.
- The MCP handshake reports the package version.
