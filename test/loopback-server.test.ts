import { describe, expect, test } from 'bun:test';
import net from 'node:net';
import { startLoopbackServer } from '../src/lib/loopback-server';

describe('startLoopbackServer', () => {
  test('resolves the authorization code from the callback', async () => {
    const server = await startLoopbackServer({
      callbackPath: '/callback',
      state: 'expected-state',
      timeoutMs: 5_000,
    });

    try {
      const url = new URL(server.callbackUrl);
      url.searchParams.set('code', 'auth-code');
      url.searchParams.set('state', 'expected-state');

      const responsePromise = fetch(url);
      const result = await server.waitForResult();
      const response = await responsePromise;

      expect(result).toEqual({ code: 'auth-code' });
      expect(response.status).toBe(200);
      expect(response.headers.get('connection')).toBe('close');
    } finally {
      await server.close();
    }
  });

  test('close returns even when the browser keeps a keep-alive socket open', async () => {
    const server = await startLoopbackServer({
      callbackPath: '/callback',
      state: 'expected-state',
      successPage: { redirectUrl: 'https://example.com/done' },
      timeoutMs: 5_000,
    });

    const socket = net.connect({
      host: '127.0.0.1',
      port: Number(new URL(server.callbackUrl).port),
    });

    try {
      const url = new URL(server.callbackUrl);
      url.searchParams.set('code', 'auth-code');
      url.searchParams.set('state', 'expected-state');

      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('error', reject);
      });

      socket.write(`GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.host}\r\nConnection: keep-alive\r\n\r\n`);

      // Wait until headers arrive, then leave the socket open (browser keep-alive).
      await new Promise<void>((resolve, reject) => {
        socket.once('data', () => resolve());
        socket.once('error', reject);
      });

      const result = await server.waitForResult();
      expect(result).toEqual({ code: 'auth-code' });

      // Without closeAllConnections(), server.close() can hang forever here.
      await Promise.race([
        server.close(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('loopback server close hung')), 1_000);
        }),
      ]);
    } finally {
      socket.destroy();
      await server.close().catch(() => {});
    }
  });
});
