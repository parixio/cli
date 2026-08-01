import { ApiClient } from './api-client';
import { resolveBaseUrl } from './config';
import { readStoredSession } from './session';

export async function createApiClient(baseUrlOverride?: string) {
  const storedSession = await readStoredSession();
  if (!storedSession) {
    throw new Error('No local session found. Run `parix auth login` first.');
  }

  const baseUrl = resolveBaseUrl(baseUrlOverride, storedSession);
  return {
    baseUrl,
    client: new ApiClient({
      session: {
        ...storedSession,
        baseUrl,
      },
    }),
  };
}

export async function requestApiJson<T>(input: {
  baseUrl?: string;
  body?: RequestInit['body'];
  headers?: RequestInit['headers'];
  method?: string;
  path: string;
}) {
  const { client } = await createApiClient(input.baseUrl);
  const response = await client.request(input.path, {
    body: input.body,
    headers: input.headers,
    method: input.method,
  });

  const raw = await response.text();
  const payload = raw.length > 0 ? safeParseJson(raw) : null;

  if (!response.ok) {
    const message =
      getApiErrorMessage(payload) ??
      (typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null) ??
      `${response.status} ${response.statusText}`;
    throw new ApiRequestError(message, response.status, payload);
  }

  return payload as T;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.payload = payload;
  }
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function getApiErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const row = payload as {
    detail?: unknown;
    error?: unknown;
    message?: unknown;
    title?: unknown;
    tbResults?: unknown;
  };

  const parts: string[] = [];

  if (typeof row.detail === 'string' && row.detail.trim().length > 0) {
    parts.push(row.detail.trim());
  } else if (typeof row.message === 'string' && row.message.trim().length > 0) {
    parts.push(row.message.trim());
  } else if (typeof row.error === 'string' && row.error.trim().length > 0) {
    parts.push(row.error.trim());
  } else if (typeof row.title === 'string' && row.title.trim().length > 0) {
    parts.push(row.title.trim());
  }

  if (Array.isArray(row.tbResults) && row.tbResults.length > 0) {
    parts.push(`tbResults: ${JSON.stringify(row.tbResults)}`);
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join(' — ');
}
