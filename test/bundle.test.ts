import { beforeAll, describe, expect, test } from 'bun:test';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import packageJson from '../package.json';

let bundle = '';

beforeAll(() => {
  const build = Bun.spawnSync({ cmd: ['bun', 'run', 'build'], stdout: 'ignore', stderr: 'pipe' });
  if (build.exitCode !== 0) {
    throw new Error(build.stderr.toString());
  }
  bundle = readFileSync('dist/cli.cjs', 'utf8');
});

describe('published bundle', () => {
  // A path from the build machine only resolves where the source checkout exists, so it works
  // locally and crashes after `npm install`.
  test('does not embed the build directory', () => {
    expect(bundle).not.toContain(process.cwd());
    expect(bundle).not.toContain('file://');
  });

  test('runs on its own, without the source tree or package.json next to it', () => {
    const directory = mkdtempSync(join(tmpdir(), 'parix-cli-bundle-'));
    try {
      copyFileSync('dist/cli.cjs', join(directory, 'cli.cjs'));
      const result = Bun.spawnSync({ cmd: ['node', join(directory, 'cli.cjs'), '--version'], cwd: directory });

      expect(result.stderr.toString()).toBe('');
      expect(result.stdout.toString().trim()).toBe(packageJson.version);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
