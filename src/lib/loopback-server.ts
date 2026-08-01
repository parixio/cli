import type { Server } from 'node:http';
import { createServer } from 'node:http';

interface StartLoopbackServerOptions {
  callbackPath: string;
  port?: number;
  successPage?: {
    redirectUrl: string;
  };
  state?: string;
  timeoutMs: number;
}

interface CallbackResult {
  code: string;
}

export interface LoopbackServer {
  callbackUrl: string;
  setState: (state: string) => void;
  waitForResult: () => Promise<CallbackResult>;
  close: () => Promise<void>;
}

export async function startLoopbackServer(options: StartLoopbackServerOptions): Promise<LoopbackServer> {
  const server = createServer();
  let completed = false;
  let expectedState = options.state ?? null;
  let resolveResult: ((value: CallbackResult) => void) | null = null;
  let rejectResult: ((reason?: unknown) => void) | null = null;
  let timeout: NodeJS.Timeout | null = null;

  const clearTimeoutIfNeeded = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  const settle = (
    handler: ((reason?: unknown) => void) | ((value: CallbackResult) => void) | null,
    value?: CallbackResult,
    reason?: unknown,
  ) => {
    if (completed) {
      return;
    }

    completed = true;
    clearTimeoutIfNeeded();

    if (!handler) {
      return;
    }

    if (reason !== undefined) {
      (handler as (reason?: unknown) => void)(reason);
      return;
    }

    if (value) {
      (handler as (value: CallbackResult) => void)(value);
    }
  };

  const result = new Promise<CallbackResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  server.on('request', (request, response) => {
    // One-shot OAuth loopback: do not keep browser sockets alive after the response.
    response.setHeader('connection', 'close');

    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (requestUrl.pathname === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }

    if (requestUrl.pathname !== options.callbackPath) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    const returnedState = requestUrl.searchParams.get('state');
    const code = requestUrl.searchParams.get('code');
    const error = requestUrl.searchParams.get('error');
    const errorDescription = requestUrl.searchParams.get('error_description');

    if (!expectedState || returnedState !== expectedState) {
      response.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
      response.end(buildHtml('Authentication failed', 'The callback state did not match.'));
      settle(rejectResult, undefined, new Error('The callback state did not match the original login request.'));
      return;
    }

    if (error) {
      response.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
      response.end(buildHtml('Authentication failed', errorDescription ?? error));
      settle(rejectResult, undefined, new Error(errorDescription ?? error));
      return;
    }

    if (!code) {
      response.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
      response.end(buildHtml('Authentication failed', 'No authorization code was returned.'));
      settle(rejectResult, undefined, new Error('No authorization code was returned from the browser callback.'));
      return;
    }

    if (options.successPage) {
      response.writeHead(302, {
        'cache-control': 'no-store',
        location: options.successPage.redirectUrl,
      });
      response.end();
      settle(resolveResult, { code });
      return;
    }

    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
    });
    response.end(buildHtml('Authentication complete', 'You can close the tab and return to the terminal.'));
    settle(resolveResult, { code });
  });

  await listen(server, options.port ?? 0);

  timeout = setTimeout(() => {
    settle(rejectResult, undefined, new Error('Timed out waiting for the browser callback.'));
    void closeServer(server);
  }, options.timeoutMs);

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine the loopback callback port.');
  }

  return {
    callbackUrl: `http://127.0.0.1:${address.port}${options.callbackPath}`,
    setState: (state: string) => {
      expectedState = state;
    },
    waitForResult: async () => {
      return await result;
    },
    close: async () => {
      clearTimeoutIfNeeded();
      await closeServer(server);
    },
  };
}

function listen(server: Server, port: number) {
  return new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port }, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    server.close((error) => {
      if (error) {
        if ('code' in error && error.code === 'ERR_SERVER_NOT_RUNNING') {
          finish();
          return;
        }
        finish(error);
        return;
      }
      finish();
    });

    // `server.close()` waits for existing connections. Browsers often keep the
    // loopback socket open via HTTP keep-alive, which would hang login forever
    // after the session is already stored. Force those sockets closed (Node >= 18.2).
    server.closeAllConnections();

    // Last resort: never let close block the CLI indefinitely.
    setTimeout(() => {
      finish();
    }, 250).unref();
  });
}

function buildHtml(title: string, message: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="font-family: sans-serif; padding: 2rem; line-height: 1.5;">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <script>window.close()</script>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
