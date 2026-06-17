import { afterEach, describe, expect, test } from 'bun:test';
import { DEFAULT_BASE_URL, resolveBaseUrl } from '../src/lib/config';
import type { StoredSession } from '../src/lib/session';

function createStoredSession(baseUrl: string): StoredSession {
  return {
    version: 2,
    accessToken: 'access-token',
    accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
    baseUrl,
    createdAt: '2026-01-01T00:00:00.000Z',
    refreshToken: 'refresh-token',
    scopes: ['openid'],
    tokenType: 'Bearer',
    updatedAt: '2026-01-01T00:00:00.000Z',
    user: {
      id: 'user_123',
      email: null,
      emailVerified: null,
      image: null,
      name: null,
    },
    organization: {
      id: null,
      memberRole: null,
      name: null,
      slug: null,
    },
  };
}

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

  test('uses the stored session base URL by default when one exists', () => {
    expect(resolveBaseUrl(undefined, createStoredSession('https://dev.parix.io'))).toBe('https://dev.parix.io');
  });

  test('can ignore a stale stored session base URL for login', () => {
    expect(resolveBaseUrl(undefined, createStoredSession('https://dev.parix.io'), { useStoredSession: false })).toBe(
      'https://parix.io',
    );
  });

  test('does not use the legacy HTX_BASE_URL environment override', () => {
    process.env.HTX_BASE_URL = 'https://dev.parix.io';

    expect(resolveBaseUrl(undefined, null)).toBe('https://parix.io');
  });
});
