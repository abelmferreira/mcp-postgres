/**
 * End-to-end test of the built-in SSH tunnel against a real sshd + PostgreSQL.
 *
 * Skipped unless these variables point to DISPOSABLE servers (never production):
 *   TEST_SSH_HOST, TEST_SSH_PORT (default 22), TEST_SSH_USER, TEST_SSH_KEY_PATH,
 *   TEST_SSH_KEY_PASSPHRASE (optional), TEST_SSH_HOST_FINGERPRINT,
 *   TEST_PG_TUNNEL_URL  postgres URL of the database AS SEEN FROM THE SSH HOST
 *   TEST_PG_TUNNEL_SSL=true  the database accepts TLS: also test SSL through the tunnel
 *
 * scripts/e2e-ssh-tunnel.sh brings up throwaway sshd + postgres containers on an
 * internal docker network and runs this file (see README, "Development").
 *
 * Covers: query through the tunnel with READONLY session, wrong fingerprint is
 * refused, and the real process (src/index.ts) with ENV_FILE precedence, missing
 * ENV_FILE => exit 1, clean shutdown on SIGTERM and no secret in the logs.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const E = process.env;
const enabled = Boolean(E.TEST_SSH_HOST && E.TEST_PG_TUNNEL_URL);

type ConnectionModule = typeof import('../../../src/db/connection.js');

const ROOT = path.resolve(__dirname, '../../..');
const VITE_NODE = path.join(ROOT, 'node_modules', '.bin', 'vite-node');

function sshEnv(fingerprint = E.TEST_SSH_HOST_FINGERPRINT ?? ''): Record<string, string> {
  return {
    SSH_HOST: E.TEST_SSH_HOST ?? '',
    SSH_PORT: E.TEST_SSH_PORT ?? '22',
    SSH_USER: E.TEST_SSH_USER ?? '',
    SSH_KEY_PATH: E.TEST_SSH_KEY_PATH ?? '',
    ...(E.TEST_SSH_KEY_PASSPHRASE ? { SSH_KEY_PASSPHRASE: E.TEST_SSH_KEY_PASSPHRASE } : {}),
    SSH_HOST_FINGERPRINT: fingerprint,
  };
}

/** Values that must never show up in logs or error messages */
function secrets(): string[] {
  const url = new URL((E.TEST_PG_TUNNEL_URL ?? '').replace(/^postgres(ql)?:/, 'http:'));
  const list = [decodeURIComponent(url.password)];
  if (E.TEST_SSH_KEY_PASSPHRASE) list.push(E.TEST_SSH_KEY_PASSPHRASE);
  // a line from the middle of the private key body
  const keyLines = readFileSync(E.TEST_SSH_KEY_PATH ?? '', 'utf8').split('\n').filter((l) => l.length > 40);
  if (keyLines.length > 1) list.push(keyLines[1]);
  return list.filter((s) => s.length >= 6);
}

function expectNoSecrets(text: string): void {
  for (const secret of secrets()) {
    expect(text.includes(secret), 'a secret leaked into the output').toBe(false);
  }
}

async function loadConnection(extra: Record<string, string>): Promise<ConnectionModule> {
  vi.resetModules();
  for (const [k, v] of Object.entries({
    SQL_CONNECTION_URL: E.TEST_PG_TUNNEL_URL ?? '',
    READONLY: 'true',
    POOL_MIN: '0',
    POOL_MAX: '2',
    ...extra,
  })) {
    process.env[k] = v;
  }
  return import('../../../src/db/connection.js');
}

/**
 * Run the real server entry point with a clean environment (nothing from the
 * test setup leaks in). Resolves when `until` shows up on stderr (then sends
 * SIGTERM) or when the process exits on its own.
 */
function runServer(
  env: Record<string, string>,
  until?: RegExp
): Promise<{ code: number | null; stdout: string; stderr: string; reached: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn(VITE_NODE, ['src/index.ts'], {
      cwd: ROOT,
      env: { PATH: E.PATH ?? '', HOME: E.HOME ?? '/tmp', ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let reached = false;
    const timer = setTimeout(() => child.kill('SIGKILL'), 40000);
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => {
      stderr += d.toString();
      if (until && !reached && until.test(stderr)) {
        reached = true;
        child.kill('SIGTERM');
      }
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, reached });
    });
  });
}

describe.skipIf(!enabled)('SSH tunnel against real sshd + PostgreSQL', () => {
  let dir: string;
  let connection: ConnectionModule | null = null;
  const saved = { ...process.env };

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'mcp-pg-e2e-'));
  });

  afterAll(async () => {
    await connection?.closePool();
    rmSync(dir, { recursive: true, force: true });
    process.env = saved;
  });

  it('runs queries through the tunnel, READONLY session included', async () => {
    connection = await loadConnection(sshEnv());
    const pool = await connection.getPool();
    const res = await pool.query(
      "SELECT current_setting('default_transaction_read_only') AS ro, current_database() AS db"
    );
    expect(res.rows[0].ro).toBe('on');
    // several connections at once go through the same SSH session
    const many = await Promise.all([1, 2, 3].map((i) => pool.query('SELECT $1::int AS n', [i])));
    expect(many.map((r) => r.rows[0].n)).toEqual([1, 2, 3]);
    await connection.closePool();
    connection = null;
  });

  it.skipIf(E.TEST_PG_TUNNEL_SSL !== 'true')('negotiates PostgreSQL TLS end to end inside the tunnel', async () => {
    connection = await loadConnection({ ...sshEnv(), SQL_CONNECTION_URL: `${E.TEST_PG_TUNNEL_URL}?ssl=true` });
    const pool = await connection.getPool();
    const res = await pool.query('SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()');
    expect(res.rows[0].ssl).toBe(true);
    await connection.closePool();
    connection = null;
  });

  it('refuses a host key that does not match SSH_HOST_FINGERPRINT, without leaking secrets', async () => {
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args.join(' '));
    });
    try {
      connection = await loadConnection(sshEnv('SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'));
      let message = '';
      await connection.getPool().catch((err: Error) => (message = err.message));
      expect(message).toMatch(/Failed to connect to PostgreSQL: .*verification failed/i);
      expectNoSecrets(message);
      expectNoSecrets(errors.join('\n'));
    } finally {
      spy.mockRestore();
      connection = null;
    }
  });

  it('server process: missing ENV_FILE exits with 1 and prints no values', async () => {
    const r = await runServer({ ENV_FILE: path.join(dir, 'does-not-exist.env'), READONLY: 'true' });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/ENV_FILE ".*does-not-exist\.env" could not be read \(file not found\)/);
    expect(r.stdout).toBe('');
  }, 60000);

  it('server process: SSH_HOST without the fingerprint fails early with a clear message', async () => {
    const env = { ...sshEnv(), SQL_CONNECTION_URL: E.TEST_PG_TUNNEL_URL ?? '', READONLY: 'true' };
    delete (env as Record<string, string>).SSH_HOST_FINGERPRINT;
    const r = await runServer(env);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('SSH_HOST is set but these are missing:');
    expect(r.stderr).toContain('- SSH_HOST_FINGERPRINT');
    expectNoSecrets(r.stderr);
  }, 60000);

  it('server process: ENV_FILE + env block precedence, tunnel up, clean SIGTERM, no secret in logs', async () => {
    const url = new URL((E.TEST_PG_TUNNEL_URL ?? '').replace(/^postgres(ql)?:/, 'http:'));
    const envFile = path.join(dir, 'project.env');
    writeFileSync(
      envFile,
      [
        '# project .env',
        `SQL_SERVER=${url.hostname}`,
        `SQL_PORT=${url.port || '5432'}`,
        'SQL_DATABASE=wrong_database_from_file',
        `SQL_USER=${decodeURIComponent(url.username)}`,
        `SQL_PASSWORD="${decodeURIComponent(url.password)}"`,
        'READONLY=false',
        'LOG_LEVEL=info',
        ...Object.entries(sshEnv()).map(([k, v]) => `${k}=${v}`),
      ].join('\n')
    );

    // the "env" block of .mcp.json wins: right database and READONLY=true
    const r = await runServer(
      { ENV_FILE: envFile, SQL_DATABASE: url.pathname.replace(/^\//, ''), READONLY: 'true' },
      /MCP server running/
    );

    expect(r.reached).toBe(true);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('SSH tunnel ready');
    expect(r.stderr).toContain('"readonly":true');
    expect(r.stderr).toContain('"viaSshTunnel":true');
    expect(r.stderr).not.toContain('wrong_database_from_file');
    expect(r.stderr).toContain('Connection pool closed');
    expectNoSecrets(r.stderr + r.stdout);
  }, 60000);
});
