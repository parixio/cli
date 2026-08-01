import { describe, expect, test } from 'bun:test';
import { buildCreateTransfersPayload } from '../src/lib/tb-payloads';

describe('TigerBeetle user data flags', () => {
  test('includes user_data fields in a create-transfers payload', () => {
    const payload = buildCreateTransfersPayload({
      amount: '25',
      code: '7',
      creditAccountId: '1001',
      debitAccountId: '1000',
      id: '2000',
      ledger: '1',
      userData128: '340282366920938463463374607431768211454',
      userData32: '4294967294',
      userData64: '18446744073709551614',
    });

    expect(payload).toEqual([
      {
        amount: '25',
        code: '7',
        credit_account_id: '1001',
        debit_account_id: '1000',
        flags: '0',
        id: '2000',
        ledger: '1',
        user_data_128: '340282366920938463463374607431768211454',
        user_data_32: '4294967294',
        user_data_64: '18446744073709551614',
      },
    ]);
  });
});
