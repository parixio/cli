import type { PayloadOverrideOptions, TbOperationName } from '../lib/tb-payloads';
import { note, outro } from '@clack/prompts';
import { Command } from 'commander';
import { printJson } from '../lib/output';
import { requestApiJson } from '../lib/parix-api';
import {
  buildAccountFilterPayload,
  buildCreateAccountsPayload,
  buildCreateTransfersPayload,
  buildLookupPayload,
  buildQueryPayload,
  resolveTbPayload,
} from '../lib/tb-payloads';

interface BaseTbOptions extends PayloadOverrideOptions {
  baseUrl?: string;
  json?: boolean;
}

interface CreateAccountsOptions extends BaseTbOptions {
  code?: string;
  flag?: string[];
  id?: string;
  ledger?: string;
  timestamp?: string;
  userData128?: string;
  userData32?: string;
  userData64?: string;
}

interface CreateTransfersOptions extends BaseTbOptions {
  amount?: string;
  code?: string;
  flag?: string[];
  from?: string;
  id?: string;
  ledger?: string;
  pendingId?: string;
  timestamp?: string;
  timeout?: string;
  to?: string;
  userData128?: string;
  userData32?: string;
  userData64?: string;
}

interface LookupOptions extends BaseTbOptions {
  id?: string[];
  ids?: string;
}

interface FilterOptions extends BaseTbOptions {
  accountId?: string;
  code?: string;
  flag?: string[];
  limit?: string;
  timestampMax?: string;
  timestampMin?: string;
  userData128?: string;
  userData32?: string;
  userData64?: string;
}

interface QueryOptions extends BaseTbOptions {
  code?: string;
  flag?: string[];
  ledger?: string;
  limit?: string;
  timestampMax?: string;
  timestampMin?: string;
  userData128?: string;
  userData32?: string;
  userData64?: string;
}

interface TbResponse {
  clusterId: string;
  databaseId: string;
  databaseName: string;
  docsUrl: string;
  message: string;
  mode: string;
  ok: true;
  operation: string;
  operationLabel: string;
  persisted: boolean;
  provider: string;
  replicaCount: number;
  requestPayload: unknown;
  responsePayload: unknown;
  targetHost: string;
}

export function createTbCommand() {
  const tb = new Command('tb')
    .description('Run TigerBeetle operations against a database')
    .addHelpText(
      'after',
      [
        '',
        'Examples:',
        '  parix tb create-accounts db_123 --id 1000 --ledger 1 --code 1',
        '  parix tb create-transfers db_123 --id 2000 --from 1000 --to 1001 --amount 1 --ledger 1 --code 1',
        '  parix tb lookup-accounts db_123 --id 1000 --id 1001',
        '  parix tb query-transfers db_123 --limit 10 --json',
        '  parix tb create-transfers db_123 --file ./transfer.json',
      ].join('\n'),
    );

  addCreateAccountsCommand(tb);
  addCreateTransfersCommand(tb);
  addLookupCommand(tb, 'lookup-accounts', 'lookup_accounts', 'Lookup accounts');
  addLookupCommand(tb, 'lookup-transfers', 'lookup_transfers', 'Lookup transfers');
  addAccountFilterCommand(tb, 'get-account-transfers', 'get_account_transfers', 'Get account transfers');
  addAccountFilterCommand(tb, 'get-account-balances', 'get_account_balances', 'Get account balances');
  addQueryCommand(tb, 'query-accounts', 'query_accounts', 'Query accounts');
  addQueryCommand(tb, 'query-transfers', 'query_transfers', 'Query transfers');

  return tb;
}

function addCreateAccountsCommand(parent: Command) {
  parent
    .command('create-accounts')
    .description('Create TigerBeetle accounts')
    .argument('<database-id>', 'Database id')
    .option('-b, --base-url <url>', 'Parix base URL')
    .option('--json', 'Print raw JSON')
    .option('--payload <json>', 'Raw JSON payload override')
    .option('--file <path>', 'Read JSON payload from file')
    .option('--id <id>', 'Account id (defaults to generated id)')
    .option('--ledger <ledger>', 'Ledger id')
    .option('--code <code>', 'Account code')
    .option('--flag <flag>', 'Account flag name or bitfield value', collectValues, [])
    .option('--timestamp <nanoseconds>', 'Imported timestamp, greater than 0 and less than 2^63')
    .option('--user-data-128 <value>', 'user_data_128')
    .option('--user-data-64 <value>', 'user_data_64')
    .option('--user-data-32 <value>', 'user_data_32')
    .addHelpText(
      'after',
      [
        '',
        'Examples:',
        '  parix tb create-accounts db_123 --id 1000 --ledger 1 --code 1',
        '  parix tb create-accounts db_123 --payload "[{\"id\":\"1000\",\"ledger\":\"1\",\"code\":\"1\",\"flags\":\"0\"}]"',
      ].join('\n'),
    )
    .action(async (databaseId: string, options: CreateAccountsOptions) => {
      const payload = await resolveTbPayload(options, () =>
        buildCreateAccountsPayload({
          code: options.code,
          flags: options.flag,
          id: options.id,
          ledger: options.ledger,
          timestamp: options.timestamp,
          userData128: options.userData128,
          userData32: options.userData32,
          userData64: options.userData64,
        }),
      );
      await executeTbOperation(databaseId, 'create_accounts', payload, options);
    });
}

function addCreateTransfersCommand(parent: Command) {
  parent
    .command('create-transfers')
    .description('Create TigerBeetle transfers')
    .argument('<database-id>', 'Database id')
    .option('-b, --base-url <url>', 'Parix base URL')
    .option('--json', 'Print raw JSON')
    .option('--payload <json>', 'Raw JSON payload override')
    .option('--file <path>', 'Read JSON payload from file')
    .option('--id <id>', 'Transfer id (defaults to generated id)')
    .option('--from <id>', 'Debit account id')
    .option('--to <id>', 'Credit account id')
    .option('--amount <amount>', 'Transfer amount')
    .option('--ledger <ledger>', 'Ledger id')
    .option('--code <code>', 'Transfer code')
    .option('--flag <flag>', 'Transfer flag name or bitfield value', collectValues, [])
    .option('--pending-id <id>', 'Pending transfer id')
    .option('--timeout <seconds>', 'Pending transfer timeout in seconds')
    .option('--timestamp <nanoseconds>', 'Imported timestamp, greater than 0 and less than 2^63')
    .option('--user-data-128 <value>', 'user_data_128')
    .option('--user-data-64 <value>', 'user_data_64')
    .option('--user-data-32 <value>', 'user_data_32')
    .addHelpText(
      'after',
      [
        '',
        'Examples:',
        '  parix tb create-transfers db_123 --id 2000 --from 1000 --to 1001 --amount 1 --ledger 1 --code 1',
        '  parix tb create-transfers db_123 --id 2001 --pending-id 2000 --amount 25 --flag post_pending_transfer',
        '  parix tb create-transfers db_123 --id 2001 --pending-id 2000 --flag void_pending_transfer',
        '  parix tb create-transfers db_123 --file ./transfer.json',
      ].join('\n'),
    )
    .action(async (databaseId: string, options: CreateTransfersOptions) => {
      const payload = await resolveTbPayload(options, () =>
        buildCreateTransfersPayload({
          amount: options.amount,
          code: options.code,
          creditAccountId: options.to,
          debitAccountId: options.from,
          flags: options.flag,
          id: options.id,
          ledger: options.ledger,
          pendingId: options.pendingId,
          timestamp: options.timestamp,
          timeout: options.timeout,
          userData128: options.userData128,
          userData32: options.userData32,
          userData64: options.userData64,
        }),
      );
      await executeTbOperation(databaseId, 'create_transfers', payload, options);
    });
}

function addLookupCommand(parent: Command, name: string, operation: TbOperationName, description: string) {
  parent
    .command(name)
    .description(description)
    .argument('<database-id>', 'Database id')
    .option('-b, --base-url <url>', 'Parix base URL')
    .option('--json', 'Print raw JSON')
    .option('--payload <json>', 'Raw JSON payload override')
    .option('--file <path>', 'Read JSON payload from file')
    .option('--id <id>', 'ID to lookup', collectValues, [])
    .option('--ids <ids>', 'Comma-separated IDs to lookup')
    .addHelpText(
      'after',
      [
        '',
        'Examples:',
        `  parix tb ${name} db_123 --id 1000 --id 1001`,
        `  parix tb ${name} db_123 --ids 1000,1001`,
      ].join('\n'),
    )
    .action(async (databaseId: string, options: LookupOptions) => {
      const payload = await resolveTbPayload(options, () =>
        buildLookupPayload({
          id: options.id,
          ids: options.ids,
        }),
      );
      await executeTbOperation(databaseId, operation, payload, options);
    });
}

function addAccountFilterCommand(parent: Command, name: string, operation: TbOperationName, description: string) {
  parent
    .command(name)
    .description(description)
    .argument('<database-id>', 'Database id')
    .option('-b, --base-url <url>', 'Parix base URL')
    .option('--json', 'Print raw JSON')
    .option('--payload <json>', 'Raw JSON payload override')
    .option('--file <path>', 'Read JSON payload from file')
    .option('--account-id <id>', 'Account id')
    .option('--limit <limit>', 'Maximum row count', '100')
    .option('--flag <flag>', 'Filter flag name or bitfield value', collectValues, [])
    .option('--timestamp-min <value>', 'Minimum timestamp')
    .option('--timestamp-max <value>', 'Maximum timestamp')
    .option('--user-data-128 <value>', 'user_data_128')
    .option('--user-data-64 <value>', 'user_data_64')
    .option('--user-data-32 <value>', 'user_data_32')
    .option('--code <code>', 'Filter code')
    .addHelpText(
      'after',
      [
        '',
        'Examples:',
        `  parix tb ${name} db_123 --account-id 1000 --limit 10 --flag debits`,
        `  parix tb ${name} db_123 --file ./filter.json`,
      ].join('\n'),
    )
    .action(async (databaseId: string, options: FilterOptions) => {
      const payload = await resolveTbPayload(options, () =>
        buildAccountFilterPayload({
          accountId: options.accountId,
          code: options.code,
          flags: options.flag,
          limit: options.limit,
          timestampMax: options.timestampMax,
          timestampMin: options.timestampMin,
          userData128: options.userData128,
          userData32: options.userData32,
          userData64: options.userData64,
        }),
      );
      await executeTbOperation(databaseId, operation, payload, options);
    });
}

function addQueryCommand(parent: Command, name: string, operation: TbOperationName, description: string) {
  parent
    .command(name)
    .description(description)
    .argument('<database-id>', 'Database id')
    .option('-b, --base-url <url>', 'Parix base URL')
    .option('--json', 'Print raw JSON')
    .option('--payload <json>', 'Raw JSON payload override')
    .option('--file <path>', 'Read JSON payload from file')
    .option('--limit <limit>', 'Maximum row count', '100')
    .option('--flag <flag>', 'Query flag name or bitfield value', collectValues, [])
    .option('--ledger <ledger>', 'Filter ledger')
    .option('--code <code>', 'Filter code')
    .option('--timestamp-min <value>', 'Minimum timestamp')
    .option('--timestamp-max <value>', 'Maximum timestamp')
    .option('--user-data-128 <value>', 'user_data_128')
    .option('--user-data-64 <value>', 'user_data_64')
    .option('--user-data-32 <value>', 'user_data_32')
    .addHelpText(
      'after',
      [
        '',
        'Examples:',
        `  parix tb ${name} db_123 --limit 10`,
        `  parix tb ${name} db_123 --ledger 1 --limit 10 --json`,
      ].join('\n'),
    )
    .action(async (databaseId: string, options: QueryOptions) => {
      const payload = await resolveTbPayload(options, () =>
        buildQueryPayload({
          code: options.code,
          flags: options.flag,
          ledger: options.ledger,
          limit: options.limit,
          timestampMax: options.timestampMax,
          timestampMin: options.timestampMin,
          userData128: options.userData128,
          userData32: options.userData32,
          userData64: options.userData64,
        }),
      );
      await executeTbOperation(databaseId, operation, payload, options);
    });
}

async function executeTbOperation(
  databaseId: string,
  operation: TbOperationName,
  payload: unknown,
  options: BaseTbOptions,
) {
  const response = await requestApiJson<TbResponse>({
    baseUrl: options.baseUrl,
    body: JSON.stringify(payload),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
    path: `/api/v1/databases/${encodeURIComponent(databaseId)}/tb/${operation}`,
  });

  if (options.json) {
    printJson(response);
    return;
  }

  note(response.docsUrl, 'TigerBeetle docs');
  note(
    [
      `Operation: ${response.operationLabel}`,
      `Database: ${response.databaseName}`,
      `Provider: ${response.provider}`,
      `Cluster ID: ${response.clusterId}`,
      `Target host: ${response.targetHost}`,
      `Replicas: ${String(response.replicaCount)}`,
      `Mode: ${response.mode}`,
      `Persisted: ${String(response.persisted)}`,
    ].join('\n'),
    'Execution',
  );

  if (Array.isArray(response.responsePayload)) {
    note(String(response.responsePayload.length), 'Rows returned');
  }

  printJson(response.responsePayload);
  outro(response.message);
}

function collectValues(value: string, previous: string[]) {
  previous.push(value);
  return previous;
}
