import { log, note, outro } from '@clack/prompts';
import { Command } from 'commander';
import { ApiClient } from '../lib/api-client';
import { resolveBaseUrl } from '../lib/config';
import { readStoredSession } from '../lib/session';

interface ApiRequestOptions {
  baseUrl?: string;
  body?: string;
  header?: string[];
  method?: string;
}

export function createApiCommand() {
  return new Command('api')
    .description('Make an authenticated API request with the stored bearer token')
    .argument('<path>', 'Relative API path or absolute URL')
    .option('-X, --method <method>', 'HTTP method', 'GET')
    .option('-d, --body <body>', 'Raw request body')
    .option('-H, --header <header>', 'Additional header in key:value form', collectValues, [])
    .option('-b, --base-url <url>', 'Override the stored base URL')
    .action(async (requestPath: string, options: ApiRequestOptions) => {
      await handleApiRequest(requestPath, options);
    });
}

async function handleApiRequest(requestPath: string, options: ApiRequestOptions) {
  const storedSession = await readStoredSession();
  if (!storedSession) {
    throw new Error('No local session found. Run `parix auth login` first.');
  }

  const baseUrl = resolveBaseUrl(options.baseUrl, storedSession);
  const headers = parseHeaders(options.header ?? []);
  const body = options.body ?? undefined;

  if (body && !hasHeader(headers, 'content-type')) {
    headers.set('content-type', 'application/json');
  }

  const client = new ApiClient({
    session: {
      ...storedSession,
      baseUrl,
    },
  });

  const response = await client.request(requestPath, {
    method: options.method ?? 'GET',
    headers,
    body,
  });

  const contentType = response.headers.get('content-type') ?? 'unknown';
  const payload = await response.text();

  note([`Status: ${response.status} ${response.statusText}`, `Content-Type: ${contentType}`].join('\n'), 'Response');

  if (contentType.includes('application/json') && payload.length > 0) {
    try {
      log.message(JSON.stringify(JSON.parse(payload), null, 2));
    } catch {
      log.message(payload);
    }
  } else if (payload.length > 0) {
    log.message(payload);
  }

  if (!response.ok) {
    process.exitCode = 1;
    outro(`Request failed with HTTP ${response.status}`);
    return;
  }

  outro('Request completed');
}

function collectValues(value: string, previous: string[]) {
  previous.push(value);
  return previous;
}

function parseHeaders(values: string[]) {
  const headers = new Headers();

  for (const value of values) {
    const separatorIndex = value.indexOf(':');
    if (separatorIndex <= 0) {
      throw new Error(`Invalid header format: ${value}. Use key:value.`);
    }

    const key = value.slice(0, separatorIndex).trim();
    const headerValue = value.slice(separatorIndex + 1).trim();
    if (!key) {
      throw new Error(`Invalid header name: ${value}`);
    }
    headers.set(key, headerValue);
  }

  return headers;
}

function hasHeader(headers: Headers, name: string) {
  return headers.has(name) || headers.has(name.toLowerCase());
}
