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
      baseUrl,
      session: storedSession,
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

/**
 * Builds a one-line message from a Parix problem-details body: the detail, then which fields failed
 * validation (`fieldErrors` / `errors`), the machine-readable `code`, and TigerBeetle `tbResults`.
 */
export function getApiErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const row = payload as {
    code?: unknown;
    detail?: unknown;
    error?: unknown;
    errors?: unknown;
    fieldErrors?: unknown;
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

  const validationIssues = [...formatFieldErrors(row.fieldErrors), ...stringItems(row.errors)];
  if (validationIssues.length > 0) {
    parts.push(validationIssues.join('; '));
  }

  if (typeof row.code === 'string' && row.code.trim().length > 0) {
    parts.push(`code: ${row.code.trim()}`);
  }

  if (Array.isArray(row.tbResults) && row.tbResults.length > 0) {
    parts.push(`tbResults: ${JSON.stringify(row.tbResults)}`);
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join(' — ');
}

function formatFieldErrors(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([field, messages]) => {
    const items = stringItems(messages);
    return items.length > 0 ? [`${field}: ${items.join(', ')}`] : [];
  });
}

function stringItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}
