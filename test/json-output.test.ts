import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Large enough that the pipe write is still queued at exit unless stdout is flushed.
const databases = Array.from({ length: 5_000 }, (_, index) => ({
  createdAt: '2026-11-01T00:00:00Z',
  id: `db_${index}`,
  name: `ledger-${index}`,
  provider: 'gcp',
  region: 'asia-southeast1',
  status: 'ready',
  updatedAt: '2026-11-01T00:00:00Z',
}));

let server: ReturnType<typeof Bun.serve>;
let home = '';

beforeAll(() => {
  const build = Bun.spawnSync({ cmd: ['bun', 'run', 'build'], stdout: 'ignore', stderr: 'pipe' });
  if (build.exitCode !== 0) {
    throw new Error(build.stderr.toString());
  }

  server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname === '/api/v1/databases') {
        return Response.json({ databases });
      }
      if (pathname === '/api/v1/databases/db_1/tb/query_accounts') {
        return Response.json({
          clusterId: '0',
          databaseId: 'db_1',
          databaseName: 'ledger',
          docsUrl: 'https://docs.tigerbeetle.com/reference/requests/query_accounts/',
          message: 'Query accounts completed',
          mode: 'live',
          operation: 'query_accounts',
          operationLabel: 'Query accounts',
          persisted: true,
          provider: 'gcp',
          replicaCount: 1,
          responsePayload: [{ id: '1000', ledger: 1, code: 1 }],
          targetHost: 'gateway.internal',
        });
      }
      return Response.json(
        { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Database not found.' },
        { status: 404 },
      );
    },
  });

  home = mkdtempSync(join(tmpdir(), 'parix-cli-json-'));
  mkdirSync(join(home, '.config', 'parix'), { recursive: true });
  writeFileSync(
    join(home, '.config', 'parix', 'session.json'),
    JSON.stringify({
      version: 2,
      baseUrl: `http://127.0.0.1:${server.port}`,
      accessToken: 'access-token',
      accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
      refreshToken: 'refresh-token',
      scopes: ['db:read'],
      tokenType: 'Bearer',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      user: { id: 'user_123', email: null, emailVerified: null, image: null, name: null },
      organization: { id: 'org_1', memberRole: 'owner', name: 'Org', slug: 'org' },
    }),
  );
});

afterAll(() => {
  server.stop(true);
  rmSync(home, { recursive: true, force: true });
});

async function runCli(args: string[]) {
  const child = Bun.spawn({
    cmd: ['node', 'dist/cli.cjs', ...args],
    env: { ...process.env, HOME: home, PARIX_BASE_URL: '' },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const exitCode = await child.exited;
  return {
    exitCode,
    stderr: await new Response(child.stderr).text(),
    stdout: await new Response(child.stdout).text(),
  };
}

describe('--json output', () => {
  test('prints the complete response as plain, parseable JSON', async () => {
    const result = await runCli(['database', 'list', '--json']);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.databases).toHaveLength(databases.length);
    expect(parsed.databases.at(-1).id).toBe('db_4999');
  });

  test('prints a TigerBeetle response as plain JSON', async () => {
    const result = await runCli(['tb', 'query-accounts', 'db_1', '--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).responsePayload).toEqual([{ id: '1000', ledger: 1, code: 1 }]);
  });

  test('keeps stdout empty and reports the error on stderr when the request fails', async () => {
    const result = await runCli(['database', 'info', 'missing', '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Database not found.');
  });
});
