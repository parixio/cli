import type { StoredSession } from './session';
import { ensureFreshSession } from './oauth-session';

const TRAILING_SLASHES_REGEX = /\/+$/;

interface ApiClientOptions {
  /** Origin that relative request paths resolve against. Defaults to the session's own base URL. */
  baseUrl?: string;
  /** The stored session. Its `baseUrl` is the origin that issued the tokens. */
  session: StoredSession;
}

export class ApiClient {
  private readonly requestBaseUrl: string;
  private session: StoredSession;

  constructor(options: ApiClientOptions) {
    this.session = options.session;
    this.requestBaseUrl = options.baseUrl ?? options.session.baseUrl;
  }

  async request(pathname: string, init: RequestInit = {}) {
    // Tokens are always refreshed against, and persisted with, the origin that issued them.
    // A one-shot `--base-url` only changes where this request is sent.
    this.session = await ensureFreshSession(this.session);

    const url = toRequestUrl(pathname, this.requestBaseUrl);
    const response = await this.send(url, init);

    // A 401 from another origin says nothing about whether the issuer's token is stale,
    // so only force a refresh when the request went to the issuing origin.
    if (response.status !== 401 || !sameOrigin(url, this.session.baseUrl)) {
      return response;
    }

    this.session = await ensureFreshSession({
      ...this.session,
      accessTokenExpiresAt: new Date(0).toISOString(),
    });

    return this.send(url, init);
  }

  private send(url: string, init: RequestInit) {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${this.session.accessToken}`);
    return fetch(url, {
      ...init,
      headers,
    });
  }
}

function toRequestUrl(pathname: string, baseUrl: string) {
  if (pathname.startsWith('http://') || pathname.startsWith('https://')) {
    return pathname;
  }
  return new URL(pathname, `${trimTrailingSlash(baseUrl)}/`).toString();
}

function sameOrigin(left: string, right: string) {
  return new URL(left).origin === new URL(right).origin;
}

function trimTrailingSlash(value: string) {
  return value.replace(TRAILING_SLASHES_REGEX, '');
}
