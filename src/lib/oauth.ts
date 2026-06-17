import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import { trimTrailingSlash } from './config';

export const PARIX_CLIENT_ID = 'parix';
export const PARIX_LOCAL_CALLBACK_PATH = '/callback';
export const CLI_OAUTH_CONSENT_GRANTED_PATH = '/cli-oauth-consent-granted';
export const PARIX_DEFAULT_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'org:read',
  'db:read',
  'db:write',
  'billing:read',
] as const;

export interface PkcePair {
  codeChallenge: string;
  codeVerifier: string;
}

export function createPkcePair(): PkcePair {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

  return {
    codeChallenge,
    codeVerifier,
  };
}

export function buildAuthorizeUrl(input: { baseUrl: string; codeChallenge: string; prompt?: string; state: string }) {
  const url = new URL('/api/oauth/cli/authorize', trimTrailingSlash(input.baseUrl));
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  if (input.prompt) {
    url.searchParams.set('prompt', input.prompt);
  }

  return url.toString();
}

export function buildCliState(redirectUri: string) {
  return Buffer.from(
    JSON.stringify({
      nonce: randomBytes(16).toString('hex'),
      redirectUri,
    }),
    'utf8',
  ).toString('base64url');
}

export function buildOAuthCallbackUrl(baseUrl: string) {
  return new URL('/api/oauth/cli/callback', trimTrailingSlash(baseUrl)).toString();
}

export function buildOAuthTokenUrl(baseUrl: string) {
  return new URL('/api/auth/oauth2/token', trimTrailingSlash(baseUrl)).toString();
}

export function buildOAuthUserInfoUrl(baseUrl: string) {
  return new URL('/api/auth/oauth2/userinfo', trimTrailingSlash(baseUrl)).toString();
}
