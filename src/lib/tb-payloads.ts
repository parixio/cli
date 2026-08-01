import { readFile } from 'node:fs/promises';

const SPLIT_IDS_REGEX = /[\s,]+/;
const DECIMAL_INTEGER_REGEX = /^\d+$/;
const LINKED_FLAG = 1n;
const ACCOUNT_IMPORTED_FLAG = 16n;
const TRANSFER_PENDING_FLAG = 2n;
const TRANSFER_POST_PENDING_FLAG = 4n;
const TRANSFER_VOID_PENDING_FLAG = 8n;
const TRANSFER_IMPORTED_FLAG = 256n;
const TIGERBEETLE_TIMESTAMP_MAX_EXCLUSIVE = 1n << 63n;
const IMPORTED_TIMESTAMP_ERROR =
  '--timestamp must be a decimal integer greater than 0 and less than 2^63 when --flag imported is used.';

interface FlagSet {
  allowedMask: bigint;
  label: string;
  nameToBit: ReadonlyMap<string, bigint>;
}

const ACCOUNT_FLAG_SET: FlagSet = {
  allowedMask: 63n,
  label: 'account',
  nameToBit: new Map([
    ['linked', LINKED_FLAG],
    ['debits_must_not_exceed_credits', 2n],
    ['credits_must_not_exceed_debits', 4n],
    ['history', 8n],
    ['imported', ACCOUNT_IMPORTED_FLAG],
    ['closed', 32n],
  ]),
};

const TRANSFER_FLAG_SET: FlagSet = {
  allowedMask: 511n,
  label: 'transfer',
  nameToBit: new Map([
    ['linked', LINKED_FLAG],
    ['pending', TRANSFER_PENDING_FLAG],
    ['post_pending_transfer', TRANSFER_POST_PENDING_FLAG],
    ['void_pending_transfer', TRANSFER_VOID_PENDING_FLAG],
    ['balancing_debit', 16n],
    ['balancing_credit', 32n],
    ['closing_debit', 64n],
    ['closing_credit', 128n],
    ['imported', TRANSFER_IMPORTED_FLAG],
  ]),
};

const ACCOUNT_FILTER_FLAG_SET: FlagSet = {
  allowedMask: 7n,
  label: 'account filter',
  nameToBit: new Map([
    ['debits', 1n],
    ['credits', 2n],
    ['reversed', 4n],
  ]),
};

const QUERY_FILTER_FLAG_SET: FlagSet = {
  allowedMask: 1n,
  label: 'query filter',
  nameToBit: new Map([['reversed', 1n]]),
};

export const tbOperationNames = [
  'create_accounts',
  'create_transfers',
  'lookup_accounts',
  'lookup_transfers',
  'get_account_transfers',
  'get_account_balances',
  'query_accounts',
  'query_transfers',
] as const;

export type TbOperationName = (typeof tbOperationNames)[number];

export interface PayloadOverrideOptions {
  file?: string;
  payload?: string;
}

export async function resolveTbPayload<T>(options: PayloadOverrideOptions, buildFromFlags: () => T) {
  if (options.file) {
    return JSON.parse(await readFile(options.file, 'utf8')) as T;
  }

  if (options.payload) {
    return JSON.parse(options.payload) as T;
  }

  return buildFromFlags();
}

export function buildCreateAccountsPayload(options: {
  code?: string;
  flags?: string[];
  id?: string;
  ledger?: string;
  timestamp?: string;
  userData128?: string;
  userData32?: string;
  userData64?: string;
}) {
  const flags = flagsBitfield(options.flags, ACCOUNT_FLAG_SET);
  rejectLinkedSingleEvent(flags);
  const isImported = flagIsSet(flags, ACCOUNT_IMPORTED_FLAG);
  if (!isImported && valueIsNonZero(options.timestamp)) {
    throw new Error('--timestamp requires --flag imported when nonzero.');
  }

  return [
    omitEmpty({
      code: requiredValue(options.code, '--code'),
      flags,
      id: options.id ?? randomTbId(),
      ledger: requiredValue(options.ledger, '--ledger'),
      timestamp: isImported ? requiredImportedTimestamp(options.timestamp) : options.timestamp,
      user_data_128: options.userData128,
      user_data_32: options.userData32,
      user_data_64: options.userData64,
    }),
  ];
}

export function buildCreateTransfersPayload(options: {
  amount?: string;
  code?: string;
  creditAccountId?: string;
  debitAccountId?: string;
  flags?: string[];
  id?: string;
  ledger?: string;
  pendingId?: string;
  timestamp?: string;
  timeout?: string;
  userData128?: string;
  userData32?: string;
  userData64?: string;
}) {
  const flags = flagsBitfield(options.flags, TRANSFER_FLAG_SET);
  rejectLinkedSingleEvent(flags);

  const isPending = flagIsSet(flags, TRANSFER_PENDING_FLAG);
  const isPostPending = flagIsSet(flags, TRANSFER_POST_PENDING_FLAG);
  const isVoidPending = flagIsSet(flags, TRANSFER_VOID_PENDING_FLAG);
  const isImported = flagIsSet(flags, TRANSFER_IMPORTED_FLAG);
  const lifecycleModeCount = Number(isPending) + Number(isPostPending) + Number(isVoidPending);
  if (lifecycleModeCount > 1) {
    throw new Error('The pending, post_pending_transfer, and void_pending_transfer flags cannot be combined.');
  }

  const resolvesPending = isPostPending || isVoidPending;
  if (!isImported && valueIsNonZero(options.timestamp)) {
    throw new Error('--timestamp requires --flag imported when nonzero.');
  }
  if (valueIsNonZero(options.timeout)) {
    if (isImported) {
      throw new Error('--timeout must be zero or omitted with --flag imported.');
    }
    if (!isPending) {
      throw new Error('--timeout requires --flag pending when nonzero.');
    }
  }
  if (!resolvesPending && valueIsNonZero(options.pendingId)) {
    throw new Error('--pending-id requires --flag post_pending_transfer or --flag void_pending_transfer when nonzero.');
  }

  return [
    omitEmpty({
      amount: isVoidPending ? valueOrZero(options.amount) : requiredValue(options.amount, '--amount'),
      code: resolvesPending ? valueOrZero(options.code) : requiredValue(options.code, '--code'),
      credit_account_id: resolvesPending
        ? valueOrZero(options.creditAccountId)
        : requiredValue(options.creditAccountId, '--to'),
      debit_account_id: resolvesPending
        ? valueOrZero(options.debitAccountId)
        : requiredValue(options.debitAccountId, '--from'),
      flags,
      id: options.id ?? randomTbId(),
      ledger: resolvesPending ? valueOrZero(options.ledger) : requiredValue(options.ledger, '--ledger'),
      pending_id: resolvesPending ? requiredValue(options.pendingId, '--pending-id') : options.pendingId,
      timestamp: isImported ? requiredImportedTimestamp(options.timestamp) : options.timestamp,
      timeout: options.timeout,
      user_data_128: options.userData128,
      user_data_32: options.userData32,
      user_data_64: options.userData64,
    }),
  ];
}

export function buildLookupPayload(options: { id?: string[]; ids?: string }) {
  const ids = [...(options.id ?? []), ...splitIds(options.ids)];

  if (ids.length === 0) {
    throw new Error('Provide at least one `--id` or `--ids` value.');
  }

  return ids;
}

export function buildAccountFilterPayload(options: {
  accountId?: string;
  code?: string;
  flags?: string[];
  limit?: string;
  timestampMax?: string;
  timestampMin?: string;
  userData128?: string;
  userData32?: string;
  userData64?: string;
}) {
  return omitEmpty({
    account_id: requiredValue(options.accountId, '--account-id'),
    code: options.code,
    flags: flagsBitfield(options.flags, ACCOUNT_FILTER_FLAG_SET),
    limit: requiredValue(options.limit, '--limit'),
    timestamp_max: options.timestampMax,
    timestamp_min: options.timestampMin,
    user_data_128: options.userData128,
    user_data_32: options.userData32,
    user_data_64: options.userData64,
  });
}

export function buildQueryPayload(options: {
  code?: string;
  flags?: string[];
  ledger?: string;
  limit?: string;
  timestampMax?: string;
  timestampMin?: string;
  userData128?: string;
  userData32?: string;
  userData64?: string;
}) {
  return omitEmpty({
    code: options.code,
    flags: flagsBitfield(options.flags, QUERY_FILTER_FLAG_SET),
    ledger: options.ledger,
    limit: requiredValue(options.limit, '--limit'),
    timestamp_max: options.timestampMax,
    timestamp_min: options.timestampMin,
    user_data_128: options.userData128,
    user_data_32: options.userData32,
    user_data_64: options.userData64,
  });
}

function flagsBitfield(flags: string[] | undefined, flagSet: FlagSet) {
  if (!flags || flags.length === 0) {
    return '0';
  }

  let bitfield = 0n;
  for (const flag of flags) {
    const normalized = flag.trim();
    if (!normalized) {
      continue;
    }

    if (DECIMAL_INTEGER_REGEX.test(normalized)) {
      const direct = BigInt(normalized);
      if ((direct & ~flagSet.allowedMask) !== 0n) {
        throw new Error(`Unsupported ${flagSet.label} flag bitfield: ${flag}`);
      }
      bitfield |= direct;
      continue;
    }

    const bit = flagSet.nameToBit.get(normalized);
    if (bit === undefined) {
      throw new Error(`Unsupported ${flagSet.label} flag: ${flag}`);
    }
    bitfield |= bit;
  }

  return bitfield.toString();
}

function flagIsSet(flags: string, flag: bigint) {
  return (BigInt(flags) & flag) !== 0n;
}

function rejectLinkedSingleEvent(flags: string) {
  if (flagIsSet(flags, LINKED_FLAG)) {
    throw new Error('--flag linked requires --payload or --file with a batch of events.');
  }
}

function omitEmpty(input: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value.trim().length > 0),
  );
}

function randomTbId() {
  return BigInt(
    `0x${crypto.getRandomValues(new Uint8Array(16)).reduce((value, byte) => value + byte.toString(16).padStart(2, '0'), '')}`,
  ).toString();
}

function requiredValue(value: string | undefined, flagName: string) {
  if (!value || value.trim().length === 0) {
    throw new Error(`${flagName} is required unless --payload or --file is used.`);
  }
  return value.trim();
}

function requiredImportedTimestamp(value: string | undefined) {
  const timestamp = requiredValue(value, '--timestamp');
  if (!DECIMAL_INTEGER_REGEX.test(timestamp)) {
    throw new Error(IMPORTED_TIMESTAMP_ERROR);
  }

  const parsed = BigInt(timestamp);
  if (parsed === 0n || parsed >= TIGERBEETLE_TIMESTAMP_MAX_EXCLUSIVE) {
    throw new Error(IMPORTED_TIMESTAMP_ERROR);
  }

  return timestamp;
}

function valueOrZero(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || '0';
}

function valueIsNonZero(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return false;
  }
  return !DECIMAL_INTEGER_REGEX.test(trimmed) || BigInt(trimmed) !== 0n;
}

function splitIds(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(SPLIT_IDS_REGEX)
    .map((item) => item.trim())
    .filter(Boolean);
}
