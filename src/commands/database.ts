import { confirm, isCancel, note, outro } from '@clack/prompts';
import { Command } from 'commander';
import { printJson, printKeyValues, printTable } from '../lib/output';
import { requestApiJson } from '../lib/parix-api';

interface BaseOptions {
  baseUrl?: string;
  json?: boolean;
}

interface CreateOptions extends BaseOptions {
  clusterConfigId?: string;
  clusterSizeId?: string;
  provider?: string;
  region?: string;
  storageGb?: string;
  storageTierId?: string;
}

interface ListOptions extends BaseOptions {
  limit?: string;
  search?: string;
}

interface RemoveOptions extends BaseOptions {
  yes?: boolean;
}

interface CreateCatalogResponse {
  catalog: {
    clusterConfigs: Array<{
      description: string | null;
      id: string;
      label: string;
      nodeCount: number;
    }>;
    clusterSizes: Array<{ id: string; label: string; memoryGb: number; vcpu: number }>;
    providers: Array<{
      id: string;
      label: string;
      regions: Array<{ code: string; id: string; label: string }>;
      slug: string;
    }>;
    storageTiers: Array<{
      description: string | null;
      id: string;
      label: string;
      priceMultiplier: number;
    }>;
  };
  ok: true;
}

interface CreateResponse {
  billing?: {
    checkoutUrl: string | null;
    code: string;
    message: string;
  };
  database?: {
    id: string;
    name: string;
  };
  job?: {
    id: string;
    workflowId: string | null;
  } | null;
  message: string;
  profile?: {
    id: string;
    status: string;
  } | null;
  provisioning?: {
    message: string | null;
    status: string;
  };
  success: boolean;
}

interface DatabaseListResponse {
  databases: Array<{
    createdAt: string;
    id: string;
    name: string;
    provider: string | null;
    region: string | null;
    status: string;
    updatedAt: string;
  }>;
  ok: true;
}

interface DatabaseInfoResponse {
  database: {
    createdAt: string;
    id: string;
    name: string;
    organizationId: string;
    updatedAt: string;
  };
  decommissionState: {
    createdAt: string;
    message: string | null;
    status: string;
    updatedAt: string;
    workflowId: string | null;
  } | null;
  gatewayUrl: string | null;
  latestProvisionJob: {
    completedAt: string | null;
    createdAt: string;
    error: string | null;
    gatewayUrl: string;
    id: string;
    provider: string;
    region: string;
    status: string;
    updatedAt: string;
    workflowId: string | null;
  } | null;
  metricsSummary: {
    cpuUsagePct: number | null;
    diskUsagePct: number | null;
    gatewayP95LatencyMs: number | null;
    lastCollectedAt: string | null;
    memoryUsagePct: number | null;
  } | null;
  ok: true;
  profile: {
    deploymentNetworkMode: string;
    gatewayUrl: string | null;
    id: string;
    providerId: string;
    regionId: string;
    selectedMemoryGb: number;
    selectedNodeCount: number;
    selectedStorageGb?: number | null;
    selectedVcpu: number;
    status: string;
    tigerbeetleCurrentVersion?: string | null;
    tigerbeetleVersion: string;
  } | null;
  provider: string | null;
  region: string | null;
}

interface RemoveResponse {
  databaseId: string;
  message: string;
  ok: true;
  status: 'queued';
  workflowId: string;
}

export function createDatabaseCommand() {
  const database = new Command('database')
    .description('Manage Parix databases')
    .addHelpText(
      'after',
      [
        '',
        'Examples:',
        '  parix database catalog --base-url http://localhost:5173',
        '  parix database create demo-ledger --provider gcp --region asia-southeast1',
        '  parix database list',
        '  parix database info id-123',
        '  parix database remove id-123 --yes',
      ].join('\n'),
    );

  database
    .command('catalog')
    .description('Show database creation catalog options')
    .option('-b, --base-url <url>', 'Parix base URL')
    .option('--json', 'Print raw JSON')
    .action(async (options: BaseOptions) => {
      const response = await requestApiJson<CreateCatalogResponse>({
        baseUrl: options.baseUrl,
        path: '/api/v1/catalog/create',
      });

      if (options.json) {
        printJson(response);
        return;
      }

      printTable({
        columns: ['Provider', 'Regions'],
        rows: response.catalog.providers.map((provider) => [
          provider.slug,
          provider.regions.map((region) => region.code).join(', '),
        ]),
      });
      note('Use `--provider <slug>` and `--region <code>` from this table.', 'Providers');

      printTable({
        columns: ['Config ID', 'Label', 'Nodes'],
        rows: response.catalog.clusterConfigs.map((config) => [config.id, config.label, String(config.nodeCount)]),
      });

      printTable({
        columns: ['Storage ID', 'Label', 'Multiplier'],
        rows: response.catalog.storageTiers.map((tier) => [tier.id, tier.label, `${tier.priceMultiplier}x`]),
      });

      printTable({
        columns: ['Size ID', 'Label', 'vCPU', 'Memory GB'],
        rows: response.catalog.clusterSizes.map((size) => [
          size.id,
          size.label,
          String(size.vcpu),
          String(size.memoryGb),
        ]),
      });
      outro('Done');
    });

  database
    .command('create')
    .description('Create a new database')
    .argument('<database>', 'Database name')
    .option('-b, --base-url <url>', 'Parix base URL')
    .option('--provider <slug>', 'Provider slug (for example: gcp, aws)')
    .option('--region <code>', 'Region code')
    .option('--cluster-config-id <id>', 'Cluster config id')
    .option('--storage-tier-id <id>', 'Storage tier id')
    .option('--cluster-size-id <id>', 'Cluster size id')
    .option('--storage-gb <n>', 'Storage size in GB')
    .option('--json', 'Print raw JSON')
    .addHelpText(
      'after',
      [
        '',
        'Examples:',
        '  parix database create payments-ledger --provider gcp --region asia-southeast1',
        '  parix database create payments-ledger --provider aws --region ap-southeast-1 --cluster-config-id config-single --cluster-size-id size-hx-5',
      ].join('\n'),
    )
    .action(async (databaseName: string, options: CreateOptions) => {
      const parsedStorageGb = options.storageGb ? Number.parseInt(options.storageGb, 10) : null;
      if (
        options.storageGb &&
        (typeof parsedStorageGb !== 'number' || !Number.isInteger(parsedStorageGb) || parsedStorageGb <= 0)
      ) {
        throw new Error('--storage-gb must be a positive integer.');
      }

      const response = await requestApiJson<CreateResponse>({
        baseUrl: options.baseUrl,
        body: JSON.stringify({
          clusterConfigId: options.clusterConfigId,
          clusterSizeId: options.clusterSizeId,
          name: databaseName,
          provider: options.provider,
          region: options.region,
          selectedStorageGb: parsedStorageGb ?? undefined,
          storageTierId: options.storageTierId,
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
        path: '/api/v1/databases',
      });

      if (options.json) {
        printJson(response);
        return;
      }

      if (!response.success) {
        note(
          [
            `Billing: ${response.billing?.message ?? response.message}`,
            `Checkout URL: ${response.billing?.checkoutUrl ?? '-'}`,
          ].join('\n'),
          'Provisioning blocked',
        );
        outro(response.message);
        return;
      }

      printKeyValues([
        ['Database ID', response.database?.id ?? '-'],
        ['Database Name', response.database?.name ?? databaseName],
        ['Profile ID', response.profile?.id ?? '-'],
        ['Profile status', response.profile?.status ?? '-'],
        ['Provisioning', response.provisioning?.status ?? '-'],
        ['Workflow ID', response.job?.workflowId ?? '-'],
      ]);
      if (response.provisioning) {
        note(
          [`Status: ${response.provisioning.status}`, `Message: ${response.provisioning.message ?? '-'}`].join('\n'),
          'Provisioning',
        );
      }
      outro(response.message);
    });

  database
    .command('list')
    .description('List databases in the active organization')
    .option('-b, --base-url <url>', 'Parix base URL')
    .option('--search <text>', 'Filter database names')
    .option('--limit <n>', 'Maximum number of rows to return')
    .option('--json', 'Print raw JSON')
    .addHelpText(
      'after',
      [
        '',
        'Examples:',
        '  parix database list',
        '  parix database list --search payments',
        '  parix database list --json',
      ].join('\n'),
    )
    .action(async (options: ListOptions) => {
      const query = new URLSearchParams();
      if (options.search) {
        query.set('search', options.search);
      }
      if (options.limit) {
        query.set('limit', options.limit);
      }

      const suffix = query.size > 0 ? `?${query.toString()}` : '';
      const response = await requestApiJson<DatabaseListResponse>({
        baseUrl: options.baseUrl,
        path: `/api/v1/databases${suffix}`,
      });

      if (options.json) {
        printJson(response);
        return;
      }

      if (response.databases.length === 0) {
        outro('No databases found');
        return;
      }

      printTable({
        columns: ['ID', 'Name', 'Region', 'Provider', 'Status', 'Updated'],
        rows: response.databases.map((database) => [
          database.id,
          database.name,
          database.region ?? '-',
          database.provider ?? '-',
          database.status,
          database.updatedAt,
        ]),
      });
      note(String(response.databases.length), 'Databases');
      outro('Done');
    });

  database
    .command('info')
    .description('Show database details')
    .argument('<database-id>', 'Database id')
    .option('-b, --base-url <url>', 'Parix base URL')
    .option('--json', 'Print raw JSON')
    .addHelpText(
      'after',
      ['', 'Examples:', '  parix database info db_123', '  parix database info db_123 --json'].join('\n'),
    )
    .action(async (databaseId: string, options: BaseOptions) => {
      const response = await requestApiJson<DatabaseInfoResponse>({
        baseUrl: options.baseUrl,
        path: `/api/v1/databases/${encodeURIComponent(databaseId)}`,
      });

      if (options.json) {
        printJson(response);
        return;
      }

      printKeyValues([
        ['Database ID', response.database.id],
        ['Database Name', response.database.name],
        ['Provider', response.provider ?? '-'],
        ['Region', response.region ?? '-'],
        ['Gateway URL', response.gatewayUrl ?? '-'],
        ['Status', response.decommissionState?.status ?? response.profile?.status ?? '-'],
        ['Version', response.profile?.tigerbeetleCurrentVersion ?? response.profile?.tigerbeetleVersion ?? '-'],
        ['Nodes', response.profile ? String(response.profile.selectedNodeCount) : '-'],
        ['CPU', response.profile ? String(response.profile.selectedVcpu) : '-'],
        ['Memory GB', response.profile ? String(response.profile.selectedMemoryGb) : '-'],
        ['Storage GB', response.profile?.selectedStorageGb != null ? String(response.profile.selectedStorageGb) : '-'],
        ['Updated', response.database.updatedAt],
      ]);

      if (response.metricsSummary) {
        note(
          [
            `CPU: ${response.metricsSummary.cpuUsagePct ?? '-'}%`,
            `Memory: ${response.metricsSummary.memoryUsagePct ?? '-'}%`,
            `Disk: ${response.metricsSummary.diskUsagePct ?? '-'}%`,
            `Gateway P95: ${response.metricsSummary.gatewayP95LatencyMs ?? '-'}ms`,
            `Last collected: ${response.metricsSummary.lastCollectedAt ?? '-'}`,
          ].join('\n'),
          'Metrics',
        );
      }

      if (response.latestProvisionJob) {
        note(
          [
            `Provision job: ${response.latestProvisionJob.id}`,
            `Provision status: ${response.latestProvisionJob.status}`,
            `Workflow ID: ${response.latestProvisionJob.workflowId ?? '-'}`,
          ].join('\n'),
          'Latest provision job',
        );
      }

      outro('Done');
    });

  database
    .command('remove')
    .description('Queue database deletion')
    .argument('<database-id>', 'Database id')
    .option('-b, --base-url <url>', 'Parix base URL')
    .option('--json', 'Print raw JSON')
    .option('-y, --yes', 'Skip confirmation prompt')
    .addHelpText(
      'after',
      ['', 'Examples:', '  parix database remove db_123', '  parix database remove db_123 --yes --json'].join('\n'),
    )
    .action(async (databaseId: string, options: RemoveOptions) => {
      if (!options.yes) {
        const confirmed = await confirm({
          message: `Queue deletion for ${databaseId}?`,
        });
        if (isCancel(confirmed) || !confirmed) {
          outro('Cancelled');
          return;
        }
      }

      const response = await requestApiJson<RemoveResponse>({
        baseUrl: options.baseUrl,
        method: 'DELETE',
        path: `/api/v1/databases/${encodeURIComponent(databaseId)}`,
      });

      if (options.json) {
        printJson(response);
        return;
      }

      printKeyValues([
        ['Database ID', response.databaseId],
        ['Status', response.status],
        ['Workflow ID', response.workflowId],
      ]);
      outro(response.message);
    });

  return database;
}
