import { describe, expect, test } from 'bun:test';
import {
  buildAccountFilterPayload,
  buildCreateAccountsPayload,
  buildCreateTransfersPayload,
  buildQueryPayload,
} from '../src/lib/tb-payloads';

const baseAccount = {
  code: '1',
  id: '1000',
  ledger: '1',
};

const baseTransfer = {
  amount: '25',
  code: '7',
  creditAccountId: '1001',
  debitAccountId: '1000',
  id: '2000',
  ledger: '1',
};

describe('TigerBeetle payload flags', () => {
  test('uses the account imported bit and requires its timestamp', () => {
    expect(
      buildCreateAccountsPayload({
        ...baseAccount,
        flags: ['imported'],
        timestamp: '1720000000000000000',
      }),
    ).toEqual([
      {
        ...baseAccount,
        flags: '16',
        timestamp: '1720000000000000000',
      },
    ]);

    expect(() => buildCreateAccountsPayload({ ...baseAccount, flags: ['imported'] })).toThrow(
      '--timestamp is required',
    );
    expect(() => buildCreateAccountsPayload({ ...baseAccount, flags: ['imported'], timestamp: '000' })).toThrow(
      '--timestamp must be a decimal integer greater than 0 and less than 2^63',
    );
  });

  test('uses the distinct transfer imported bit and requires its timestamp', () => {
    expect(
      buildCreateTransfersPayload({
        ...baseTransfer,
        flags: ['imported'],
        timestamp: '1720000000000000001',
      }),
    ).toEqual([
      {
        amount: '25',
        code: '7',
        credit_account_id: '1001',
        debit_account_id: '1000',
        flags: '256',
        id: '2000',
        ledger: '1',
        timestamp: '1720000000000000001',
      },
    ]);

    expect(() => buildCreateTransfersPayload({ ...baseTransfer, flags: ['imported'] })).toThrow(
      '--timestamp is required',
    );
    expect(() =>
      buildCreateTransfersPayload({ ...baseTransfer, flags: ['imported'], timestamp: '9223372036854775808' }),
    ).toThrow('--timestamp must be a decimal integer greater than 0 and less than 2^63');
  });

  test('accepts leading-zero decimal flag and field values', () => {
    const transfer = buildCreateTransfersPayload({
      ...baseTransfer,
      flags: ['02'],
      timeout: '01',
    })[0];

    expect(transfer.flags).toBe('2');
    expect(transfer.timeout).toBe('01');
    expect(buildQueryPayload({ flags: ['01'], limit: '10' }).flags).toBe('1');
  });

  test('rejects nonzero timestamps without imported while allowing explicit zero', () => {
    expect(() => buildCreateAccountsPayload({ ...baseAccount, timestamp: '123' })).toThrow(
      '--timestamp requires --flag imported when nonzero',
    );
    expect(buildCreateAccountsPayload({ ...baseAccount, timestamp: '0' })[0].timestamp).toBe('0');

    expect(() => buildCreateTransfersPayload({ ...baseTransfer, timestamp: '123' })).toThrow(
      '--timestamp requires --flag imported when nonzero',
    );
    expect(buildCreateTransfersPayload({ ...baseTransfer, timestamp: '000' })[0].timestamp).toBe('000');
  });

  test('uses operation-specific reversed bits', () => {
    expect(buildAccountFilterPayload({ accountId: '1000', flags: ['reversed'], limit: '10' }).flags).toBe('4');
    expect(buildQueryPayload({ flags: ['reversed'], limit: '10' }).flags).toBe('1');
  });

  test('rejects named and numeric flags from another operation', () => {
    expect(() => buildQueryPayload({ flags: ['debits'], limit: '10' })).toThrow(
      'Unsupported query filter flag: debits',
    );
    expect(() => buildQueryPayload({ flags: ['4'], limit: '10' })).toThrow('Unsupported query filter flag bitfield: 4');
    expect(() => buildCreateTransfersPayload({ ...baseTransfer, flags: ['closed'] })).toThrow(
      'Unsupported transfer flag: closed',
    );
  });

  test('requires raw payload mode for linked batches', () => {
    expect(() => buildCreateAccountsPayload({ ...baseAccount, flags: ['linked'] })).toThrow(
      '--flag linked requires --payload or --file',
    );
    expect(() => buildCreateTransfersPayload({ ...baseTransfer, flags: ['linked'] })).toThrow(
      '--flag linked requires --payload or --file',
    );
  });
});

describe('TigerBeetle transfer modes', () => {
  test('allows inherited fields to be omitted when voiding a pending transfer', () => {
    expect(
      buildCreateTransfersPayload({
        flags: ['void_pending_transfer'],
        id: '2001',
        pendingId: '2000',
      }),
    ).toEqual([
      {
        amount: '0',
        code: '0',
        credit_account_id: '0',
        debit_account_id: '0',
        flags: '8',
        id: '2001',
        ledger: '0',
        pending_id: '2000',
      },
    ]);
  });

  test('requires amount but allows inherited account fields for a post-pending transfer', () => {
    expect(
      buildCreateTransfersPayload({
        amount: '25',
        flags: ['post_pending_transfer'],
        id: '2001',
        pendingId: '2000',
      }),
    ).toEqual([
      {
        amount: '25',
        code: '0',
        credit_account_id: '0',
        debit_account_id: '0',
        flags: '4',
        id: '2001',
        ledger: '0',
        pending_id: '2000',
      },
    ]);

    expect(() =>
      buildCreateTransfersPayload({
        flags: ['post_pending_transfer'],
        id: '2001',
        pendingId: '2000',
      }),
    ).toThrow('--amount is required');
  });

  test('requires pending_id when posting or voiding', () => {
    expect(() =>
      buildCreateTransfersPayload({
        flags: ['void_pending_transfer'],
        id: '2001',
      }),
    ).toThrow('--pending-id is required');
  });

  test('rejects nonzero pending_id without post or void while allowing explicit zero', () => {
    expect(() => buildCreateTransfersPayload({ ...baseTransfer, pendingId: '2000' })).toThrow(
      '--pending-id requires --flag post_pending_transfer or --flag void_pending_transfer when nonzero',
    );
    expect(buildCreateTransfersPayload({ ...baseTransfer, pendingId: '0' })[0].pending_id).toBe('0');
  });

  test('allows nonzero timeout only on non-imported pending transfers', () => {
    expect(
      buildCreateTransfersPayload({
        ...baseTransfer,
        flags: ['pending'],
        timeout: '30',
      })[0].timeout,
    ).toBe('30');

    expect(() => buildCreateTransfersPayload({ ...baseTransfer, timeout: '30' })).toThrow(
      '--timeout requires --flag pending when nonzero',
    );
    expect(() =>
      buildCreateTransfersPayload({
        ...baseTransfer,
        flags: ['imported'],
        timeout: '30',
        timestamp: '1720000000000000001',
      }),
    ).toThrow('--timeout must be zero or omitted with --flag imported');
    expect(buildCreateTransfersPayload({ ...baseTransfer, timeout: '0' })[0].timeout).toBe('0');
  });

  test('rejects conflicting pending lifecycle flags', () => {
    expect(() =>
      buildCreateTransfersPayload({
        ...baseTransfer,
        flags: ['pending', 'post_pending_transfer'],
        pendingId: '2000',
      }),
    ).toThrow('pending, post_pending_transfer, and void_pending_transfer flags cannot be combined');
  });

  test('retains the required fields for ordinary and pending transfers', () => {
    expect(() => buildCreateTransfersPayload({ amount: '25', id: '2000' })).toThrow('--code is required');
    expect(() =>
      buildCreateTransfersPayload({
        ...baseTransfer,
        creditAccountId: undefined,
        flags: ['pending'],
      }),
    ).toThrow('--to is required');
  });
});
