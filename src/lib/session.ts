import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface StoredSession {
  version: 2;
  baseUrl: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string | null;
  scopes: string[];
  tokenType: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string | null;
    emailVerified: boolean | null;
    name: string | null;
    image: string | null;
  };
  organization: {
    id: string | null;
    memberRole: string | null;
    name: string | null;
    slug: string | null;
  };
}

export const SESSION_FILE_PATH = join(homedir(), '.config', 'parix', 'session.json');

export async function readStoredSession(): Promise<StoredSession | null> {
  try {
    const raw = await readFile(SESSION_FILE_PATH, 'utf8');
    return parseStoredSession(JSON.parse(raw));
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    if (error instanceof SyntaxError) {
      throw new TypeError(`Failed to parse ${SESSION_FILE_PATH}`);
    }

    throw error;
  }
}

const SESSION_DIRECTORY_MODE = 0o700;
const SESSION_FILE_MODE = 0o600;

export async function writeStoredSession(session: StoredSession) {
  const directory = dirname(SESSION_FILE_PATH);
  await mkdir(directory, { recursive: true, mode: SESSION_DIRECTORY_MODE });
  await chmod(directory, SESSION_DIRECTORY_MODE);
  await writeFile(SESSION_FILE_PATH, `${JSON.stringify(session, null, 2)}\n`, {
    encoding: 'utf8',
    mode: SESSION_FILE_MODE,
  });
  // `mode` only applies on creation, so also tighten files written by older releases.
  await chmod(SESSION_FILE_PATH, SESSION_FILE_MODE);
}

export async function clearStoredSession() {
  await rm(SESSION_FILE_PATH, { force: true });
}

function parseStoredSession(value: unknown): StoredSession {
  if (!value || typeof value !== 'object') {
    throw new Error(`Invalid session data in ${SESSION_FILE_PATH}`);
  }

  const row = value as Record<string, unknown>;
  const user = row.user as Record<string, unknown> | undefined;
  const organization = row.organization as Record<string, unknown> | undefined;

  if (
    row.version !== 2 ||
    typeof row.baseUrl !== 'string' ||
    typeof row.accessToken !== 'string' ||
    typeof row.accessTokenExpiresAt !== 'string' ||
    typeof row.createdAt !== 'string' ||
    !Array.isArray(row.scopes) ||
    typeof row.tokenType !== 'string' ||
    typeof row.updatedAt !== 'string' ||
    !user ||
    typeof user.id !== 'string' ||
    !organization
  ) {
    throw new Error(`Invalid session data in ${SESSION_FILE_PATH}`);
  }

  return {
    version: 2,
    accessToken: row.accessToken,
    accessTokenExpiresAt: row.accessTokenExpiresAt,
    baseUrl: row.baseUrl,
    createdAt: row.createdAt,
    refreshToken: typeof row.refreshToken === 'string' ? row.refreshToken : null,
    scopes: row.scopes.filter((scope): scope is string => typeof scope === 'string'),
    tokenType: row.tokenType,
    updatedAt: row.updatedAt,
    user: {
      id: user.id,
      email: typeof user.email === 'string' ? user.email : null,
      emailVerified: typeof user.emailVerified === 'boolean' ? user.emailVerified : null,
      name: typeof user.name === 'string' ? user.name : null,
      image: typeof user.image === 'string' ? user.image : null,
    },
    organization: {
      id: typeof organization.id === 'string' ? organization.id : null,
      memberRole: typeof organization.memberRole === 'string' ? organization.memberRole : null,
      name: typeof organization.name === 'string' ? organization.name : null,
      slug: typeof organization.slug === 'string' ? organization.slug : null,
    },
  };
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
