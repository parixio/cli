import type { StoredSession } from './session';

const TRAILING_SLASHES_REGEX = /\/+$/;

export const DEFAULT_BASE_URL = 'https://parix.io';
export const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

export function resolveBaseUrl(input: string | undefined, storedSession?: StoredSession | null) {
  const value = input ?? storedSession?.baseUrl ?? process.env.PARIX_BASE_URL ?? DEFAULT_BASE_URL;
  return trimTrailingSlash(new URL(value).toString());
}

export function trimTrailingSlash(value: string) {
  return value.replace(TRAILING_SLASHES_REGEX, '');
}

export function parsePortOption(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return parsed;
}
