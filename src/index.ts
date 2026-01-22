#!/usr/bin/env node

import { runServer } from './server.js';

/**
 * MCP PostgreSQL Entry Point
 *
 * This MCP server connects Claude Code to PostgreSQL databases with:
 * - READONLY mode enforcement (mandatory)
 * - Query execution with parameterized inputs
 * - Schema exploration (tables, columns, procedures, indexes)
 * - Database monitoring (active queries, blocking, wait stats, connections)
 * - Performance analysis (missing indexes, unused indexes, fragmentation)
 * - Write operations (INSERT, UPDATE, DELETE) when READONLY=false
 */
runServer().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
