import { intro, log, note, outro, spinner } from '@clack/prompts';
import { Command } from 'commander';
import { LOGIN_TIMEOUT_MS, parsePortOption, resolveBaseUrl } from '../lib/config';
import { startLoopbackServer } from '../lib/loopback-server';
import {
  buildAuthorizeUrl,
  buildCliState,
  CLI_OAUTH_CONSENT_GRANTED_PATH,
  createPkcePair,
  PARIX_LOCAL_CALLBACK_PATH,
} from '../lib/oauth';
import { exchangeAuthorizationCode, fetchOAuthUserInfo } from '../lib/oauth-api';
import { createStoredSession, ensureFreshSession, hydrateStoredSessionOrganization } from '../lib/oauth-session';
import { openUrlInBrowser } from '../lib/open-url';
import { clearStoredSession, readStoredSession, SESSION_FILE_PATH, writeStoredSession } from '../lib/session';

interface LoginOptions {
  baseUrl?: string;
  port?: number;
  prompt?: string;
}

const DEFAULT_OIDC_PROMPT = 'consent';

interface StatusOptions {
  baseUrl?: string;
}

export function createAuthCommand() {
  const auth = new Command('auth').description('Authenticate with Parix');

  auth
    .command('login')
    .description('Sign in with OAuth consent and PKCE')
    .option('-b, --base-url <url>', 'Parix base URL')
    .option('-p, --port <port>', 'Loopback callback port', parsePortOption)
    .option('--prompt <prompt>', 'OAuth prompt override', DEFAULT_OIDC_PROMPT)
    .action(async (options: LoginOptions) => {
      await handleLogin(options);
    });

  auth
    .command('status')
    .description('Show the current authenticated session')
    .option('-b, --base-url <url>', 'Override the stored base URL')
    .action(async (options: StatusOptions) => {
      await handleStatus(options);
    });

  auth
    .command('logout')
    .description('Remove the local session file')
    .action(async () => {
      await clearStoredSession();
      outro(`Removed local session at ${SESSION_FILE_PATH}`);
    });

  return auth;
}

async function handleLogin(options: LoginOptions) {
  intro('Parix sign in');

  const storedSession = await readStoredSession();
  const baseUrl = resolveBaseUrl(options.baseUrl, storedSession);
  const loopbackServer = await startLoopbackServer({
    callbackPath: PARIX_LOCAL_CALLBACK_PATH,
    port: options.port,
    successPage: {
      redirectUrl: new URL(CLI_OAUTH_CONSENT_GRANTED_PATH, baseUrl).toString(),
    },
    timeoutMs: LOGIN_TIMEOUT_MS,
  });

  try {
    const pkcePair = createPkcePair();
    const state = buildCliState(loopbackServer.callbackUrl);
    loopbackServer.setState(state);
    const browserUrl = buildAuthorizeUrl({
      baseUrl,
      codeChallenge: pkcePair.codeChallenge,
      prompt: options.prompt,
      state,
    });

    const prepareSpinner = spinner();
    prepareSpinner.start('Preparing browser sign-in');
    prepareSpinner.stop('Browser sign-in ready');

    const opened = await openUrlInBrowser(browserUrl);
    note(
      opened ? browserUrl : `Open this URL manually:\n${browserUrl}`,
      opened ? 'Opened browser URL' : 'Manual browser URL',
    );

    const waitSpinner = spinner();
    waitSpinner.start('Waiting for browser callback');
    const callbackResult = await loopbackServer.waitForResult();
    waitSpinner.stop('Received browser callback');

    const tokenSet = await exchangeAuthorizationCode({
      baseUrl,
      code: callbackResult.code,
      codeVerifier: pkcePair.codeVerifier,
    });

    const nextSession = await createStoredSession({
      baseUrl,
      createdAt: storedSession?.createdAt,
      tokenSet,
    });

    await writeStoredSession(nextSession);

    note(SESSION_FILE_PATH, 'Stored session file');
    outro(`Signed in as ${formatUserLabel(nextSession.user)}`);
  } finally {
    await loopbackServer.close().catch(() => {});
  }
}

async function handleStatus(options: StatusOptions) {
  intro('Parix auth status');

  const storedSession = await readStoredSession();
  if (!storedSession) {
    log.warn(`No local session found at ${SESSION_FILE_PATH}`);
    process.exitCode = 1;
    return;
  }

  const baseUrl = resolveBaseUrl(options.baseUrl, storedSession);

  try {
    const refreshedSession = await hydrateStoredSessionOrganization(
      await ensureFreshSession({
        ...storedSession,
        baseUrl,
      }),
    );
    const userInfo = await fetchOAuthUserInfo({
      accessToken: refreshedSession.accessToken,
      baseUrl,
    });

    note(
      [
        `User: ${userInfo.email ?? formatUserLabel(refreshedSession.user)}`,
        `Base URL: ${baseUrl}`,
        `Expires: ${refreshedSession.accessTokenExpiresAt}`,
        `Scopes: ${refreshedSession.scopes.join(', ')}`,
        `Organization: ${refreshedSession.organization.name ?? 'none'}`,
        `Organization slug: ${refreshedSession.organization.slug ?? 'none'}`,
        `Member role: ${refreshedSession.organization.memberRole ?? 'none'}`,
        `Session file: ${SESSION_FILE_PATH}`,
      ].join('\n'),
      'Authenticated session',
    );
    outro('Session is valid');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(`Stored session is invalid: ${message}`);
    process.exitCode = 1;
  }
}

function formatUserLabel(user: { email: string | null; id: string; name: string | null }) {
  return user.email ?? user.name ?? user.id;
}
