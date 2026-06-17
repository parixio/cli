import { afterEach, describe, expect, test } from 'bun:test';
import { DEFAULT_BASE_URL, resolveBaseUrl } from '../src/lib/config';

describe('config', () => {
  afterEach(() => {
    delete process.env.HTX_BASE_URL;
    delete process.env.PARIX_BASE_URL;
  });

  test('uses the production Parix URL as the default base URL', () => {
    expect(DEFAULT_BASE_URL).toBe('https://parix.io');
    expect(resolveBaseUrl(undefined, null)).toBe('https://parix.io');
  });

  test('uses PARIX_BASE_URL as the environment override', () => {
    process.env.PARIX_BASE_URL = 'https://preview.parix.io/';

    expect(resolveBaseUrl(undefined, null)).toBe('https://preview.parix.io');
  });

  test('does not use the legacy HTX_BASE_URL environment override', () => {
    process.env.HTX_BASE_URL = 'https://dev.parix.io';

    expect(resolveBaseUrl(undefined, null)).toBe('https://parix.io');
  });
});
