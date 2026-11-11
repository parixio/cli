import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Runs the real CLI with an isolated HOME against two mock Parix origins:
// `issuer` issued the stored session, `other` is only ever passed as a one-shot `--base-url`.

interface MockOrigin {
  requests: string[];
  server: ReturnType<typeof Bun.serve>;
  url: string;
}

function startMockOrigin(name: string, options: { listStatus?: number } = {}): MockOrigin {
  const requests: string[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(request) {
      const { pathname } = new URL(request.url);
      requests.push(`${request.method} ${pathname}`);
      if (pathname === '/api/auth/oauth2/token') {
        return Response.json({
          access_token: `access-from-${name}`,
          expires_in: 3600,
          refresh_token: `refresh-from-${name}`,
          scope: 'openid db:read',
          token_type: 'Bearer',
        });
      }
      if (pathname === '/api/auth/oauth2/userinfo') {
        return Response.json({ sub: 'user_123' });
      }
      if (pathname === '/api/v1/session') {
        return Response.json({
          auth: { organization: { id: 'org_1', memberRole: 'owner', name: 'Org', slug: 'org' } },
        });
      }
      if (pathname === '/api/v1/databases') {
        const status = options.listStatus ?? 200;
        return status === 200
          ? Response.json({ databases: [] })
          : Response.json(
              { type: 'about:blank', title: 'Unauthorized', status, detail: 'Authentication required.' },
              { status },
            );
      }
      return new Response('not found', { status: 404 });
    },
  });
  return { requests, server, url: `http://127.0.0.1:${server.port}` };
}

const origins: MockOrigin[] = [];
let home = '';

function sessionPath() {
  return join(home, '.config', 'parix', 'session.json');
}

function writeSession(baseUrl: string, accessTokenExpiresAt: string) {
  const directory = join(home, '.config', 'parix');
  mkdirSync(directory, { recursive: true, mode: 0o755 });
  chmodSync(directory, 0o755);
  writeFileSync(
    sessionPath(),
    JSON.stringify({
      version: 2,
      baseUrl,
      accessToken: 'access-original',
      accessTokenExpiresAt,
      refreshToken: 'refresh-original',
      scopes: ['openid', 'db:read'],
      tokenType: 'Bearer',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      user: { id: 'user_123', email: null, emailVerified: null, image: null, name: null },
      organization: { id: 'org_1', memberRole: 'owner', name: 'Org', slug: 'org' },
    }),
    { mode: 0o644 },
  );
  chmodSync(sessionPath(), 0o644);
}

async function runCli(args: string[]) {
  const child = Bun.spawn({
    cmd: [process.execPath, 'src/cli.ts', ...args],
    env: { ...process.env, HOME: home, PARIX_BASE_URL: '' },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const exitCode = await child.exited;
  return { exitCode, output: `${await new Response(child.stdout).text()}${await new Response(child.stderr).text()}` };
}

function mode(path: string) {
  return statSync(path).mode & 0o777;
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'parix-cli-session-'));
});

afterAll(() => {
  for (const origin of origins) {
    origin.server.stop(true);
  }
});

describe('session security', () => {
  test('a one-shot --base-url never receives the refresh token or replaces the stored origin', async () => {
    const issuer = startMockOrigin('issuer');
    const other = startMockOrigin('other');
    origins.push(issuer, other);
    writeSession(issuer.url, '2000-01-01T00:00:00.000Z');

    const result = await runCli(['database', 'list', '--base-url', other.url]);

    expect(result.exitCode).toBe(0);
    expect(issuer.requests).toContain('POST /api/auth/oauth2/token');
    expect(other.requests).not.toContain('POST /api/auth/oauth2/token');
    expect(other.requests).toContain('GET /api/v1/databases');

    const stored = JSON.parse(readFileSync(sessionPath(), 'utf8'));
    expect(stored.baseUrl).toBe(issuer.url);
    expect(stored.refreshToken).toBe('refresh-from-issuer');
    rmSync(home, { recursive: true, force: true });
  });

  test('a rewritten session file and its directory are readable only by the owner', async () => {
    const issuer = startMockOrigin('issuer');
    origins.push(issuer);
    writeSession(issuer.url, '2000-01-01T00:00:00.000Z');
    expect(mode(sessionPath())).toBe(0o644);

    const result = await runCli(['database', 'list']);

    expect(result.exitCode).toBe(0);
    expect(mode(sessionPath())).toBe(0o600);
    expect(mode(join(home, '.config', 'parix'))).toBe(0o700);
    rmSync(home, { recursive: true, force: true });
  });

  test('a 401 from another origin does not force a token refresh', async () => {
    const issuer = startMockOrigin('issuer');
    const other = startMockOrigin('other', { listStatus: 401 });
    origins.push(issuer, other);
    writeSession(issuer.url, '2099-01-01T00:00:00.000Z');

    const result = await runCli(['database', 'list', '--base-url', other.url]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Authentication required.');
    expect(issuer.requests).not.toContain('POST /api/auth/oauth2/token');
    expect(other.requests).not.toContain('POST /api/auth/oauth2/token');
    expect(JSON.parse(readFileSync(sessionPath(), 'utf8')).accessToken).toBe('access-original');
    rmSync(home, { recursive: true, force: true });
  });
});
