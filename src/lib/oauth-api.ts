import { buildOAuthCallbackUrl, buildOAuthTokenUrl, buildOAuthUserInfoUrl, PARIX_CLIENT_ID } from './oauth';

const WHITESPACE_REGEX = /\s+/;

export interface OAuthTokenSet {
  accessToken: string;
  expiresIn: number;
  refreshToken: string | null;
  scope: string[];
  tokenType: string;
}

export interface OAuthUserInfo {
  sub: string;
  email?: string | null;
  email_verified?: boolean;
  name?: string | null;
  picture?: string | null;
  organization_id?: string | null;
  organization_name?: string | null;
  organization_slug?: string | null;
  member_role?: string | null;
}

export async function exchangeAuthorizationCode(input: { baseUrl: string; code: string; codeVerifier: string }) {
  const body = new URLSearchParams({
    client_id: PARIX_CLIENT_ID,
    code: input.code,
    code_verifier: input.codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: buildOAuthCallbackUrl(input.baseUrl),
  });

  const response = await fetch(buildOAuthTokenUrl(input.baseUrl), {
    body,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  });

  return await parseTokenResponse(response);
}

export async function refreshOAuthTokens(input: { baseUrl: string; refreshToken: string }) {
  const body = new URLSearchParams({
    client_id: PARIX_CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken,
  });

  const response = await fetch(buildOAuthTokenUrl(input.baseUrl), {
    body,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  });

  return await parseTokenResponse(response);
}

export async function fetchOAuthUserInfo(input: { accessToken: string; baseUrl: string }) {
  const response = await fetch(buildOAuthUserInfoUrl(input.baseUrl), {
    headers: {
      authorization: `Bearer ${input.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Unable to fetch the authenticated user.'));
  }

  return (await response.json()) as OAuthUserInfo;
}

async function parseTokenResponse(response: Response): Promise<OAuthTokenSet> {
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Unable to exchange OAuth tokens.'));
  }

  const payload = (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope?: string;
    token_type: string;
  };

  return {
    accessToken: payload.access_token,
    expiresIn: payload.expires_in,
    refreshToken: payload.refresh_token ?? null,
    scope: payload.scope?.split(WHITESPACE_REGEX).filter(Boolean) ?? [],
    tokenType: payload.token_type,
  };
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.clone().json()) as {
      error?: string;
      error_description?: string;
      message?: string;
    };
    return payload.error_description ?? payload.message ?? payload.error ?? fallback;
  } catch {
    const text = await response.text();
    return text.trim() || fallback;
  }
}
