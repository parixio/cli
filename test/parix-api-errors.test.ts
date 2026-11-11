import { describe, expect, it } from 'bun:test';
import { ApiRequestError, getApiErrorMessage } from '../src/lib/parix-api';

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

// Bodies below mirror the platform's problem details (apps/web/workers/routes/api/utils.ts).
describe('getApiErrorMessage', () => {
  it('names the fields that failed request validation', () => {
    expect(
      getApiErrorMessage({
        type: 'about:blank',
        title: 'Validation Error',
        status: 400,
        detail: 'Invalid request data',
        errors: [],
        fieldErrors: { clusterSizeId: ['Invalid option: expected one of "size-px-2"|"size-px-5"'] },
      }),
    ).toBe('Invalid request data — clusterSizeId: Invalid option: expected one of "size-px-2"|"size-px-5"');
  });

  it('includes form-level validation errors, such as a payload of the wrong shape', () => {
    expect(
      getApiErrorMessage({
        title: 'Validation Error',
        detail: 'Invalid request data',
        errors: ['Invalid input: expected array, received object'],
        fieldErrors: {},
      }),
    ).toBe('Invalid request data — Invalid input: expected array, received object');
  });

  it('includes the machine-readable problem code', () => {
    expect(
      getApiErrorMessage({
        title: 'Service Unavailable',
        status: 503,
        detail: 'Database is paused for maintenance',
        code: 'maintenance_in_progress',
      }),
    ).toBe('Database is paused for maintenance — code: maintenance_in_progress');
  });

  it('keeps tbResults for TigerBeetle write conflicts', () => {
    expect(
      getApiErrorMessage({
        title: 'Conflict',
        detail: 'TigerBeetle rejected 1 record(s)',
        tbResults: [{ index: 0, result: 54 }],
      }),
    ).toBe('TigerBeetle rejected 1 record(s) — tbResults: [{"index":0,"result":54}]');
  });

  it('falls back to the title when there is no detail', () => {
    expect(getApiErrorMessage({ title: 'Not Found', status: 404 })).toBe('Not Found');
  });

  it('returns null for a body that is not an object', () => {
    expect(getApiErrorMessage('plain text')).toBeNull();
    expect(getApiErrorMessage(null)).toBeNull();
  });
});
