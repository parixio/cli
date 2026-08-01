import { describe, expect, it } from 'bun:test';

// Mirror getApiErrorMessage logic by importing through a small re-export is hard;
// exercise ApiRequestError shape and message formatting via dynamic import of source.
import { ApiRequestError } from '../src/lib/parix-api';

describe('ApiRequestError', () => {
  it('preserves status and payload for callers', () => {
    const error = new ApiRequestError('TigerBeetle rejected 1 record(s) — tbResults: [{"index":0,"result":54}]', 409, {
      detail: 'TigerBeetle rejected 1 record(s)',
      tbResults: [{ index: 0, result: 54 }],
    });
    expect(error.status).toBe(409);
    expect(error.message).toContain('tbResults');
    expect(error.payload).toMatchObject({ detail: 'TigerBeetle rejected 1 record(s)' });
  });
});
