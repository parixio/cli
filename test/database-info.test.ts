import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Body mirrors getDatabaseResponseSchema in the platform (apps/web/workers/routes/api/v1/get-database-route.ts):
// no gateway URL, and storageHealth from the latest replica report.
const databaseInfoBody = {
  database: {
    createdAt: '2026-11-01T00:00:00Z',
    id: 'db_1',
    name: 'ledger',
    organizationId: 'org_1',
    updatedAt: '2026-11-02T00:00:00Z',
  },
  decommissionState: null,
  latestProvisionJob: null,
  metricsSummary: null,
  profile: {
    architecture: 'aarch64',
    clusterConfigId: 'config-single',
    deploymentNetworkMode: 'shared',
    id: 'profile_1',
    providerId: 'gcp',
    regionId: 'region_1',
    selectedMemoryGb: 8,
    selectedNodeCount: 1,
    selectedStorageGb: 50,
    selectedVcpu: 2,
    status: 'ready',
    tigerbeetleVersion: '0.17.0',
  },
  provider: 'gcp',
  region: 'Singapore',
  storageHealth: {
    diskUsagePct: 90,
    machineId: 'machine_1',
    observedAt: '2026-11-11T00:00:00Z',
    status: 'critical',
    usagePct: 93,
    writesBlocked: true,
  },
};

let server: ReturnType<typeof Bun.serve>;
let home = '';

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname === '/api/v1/databases/db_1') {
        return Response.json(databaseInfoBody);
      }
      return new Response('not found', { status: 404 });
    },
  });

  home = mkdtempSync(join(tmpdir(), 'parix-cli-info-'));
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
    cmd: [process.execPath, 'src/cli.ts', ...args],
    env: { ...process.env, HOME: home, PARIX_BASE_URL: '' },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const exitCode = await child.exited;
  return { exitCode, output: `${await new Response(child.stdout).text()}${await new Response(child.stderr).text()}` };
}

describe('database info', () => {
  test('shows the fields the platform returns, including storage health', async () => {
    const result = await runCli(['database', 'info', 'db_1']);

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain('Gateway URL');
    expect(result.output).toMatch(/Cluster config\s+config-single/);
    expect(result.output).toMatch(/Architecture\s+aarch64/);
    expect(result.output).toMatch(/Storage health\s+critical/);
    expect(result.output).toContain('Storage used: 93%');
    expect(result.output).toContain('Writes blocked: yes');
    expect(result.output).toContain('rejected with HTTP 507');
  });
});

describe('database create help', () => {
  test('uses a cluster size id the platform accepts', async () => {
    const result = await runCli(['database', 'create', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('--cluster-size-id size-px-5');
    expect(result.output).not.toContain('size-hx-');
  });
});
