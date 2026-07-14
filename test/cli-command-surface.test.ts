import { describe, expect, test } from 'bun:test';
import packageJson from '../package.json';

const cliArgs = [process.execPath, 'src/cli.ts'];

function runCli(args: string[]) {
  return Bun.spawnSync({
    cmd: [...cliArgs, ...args],
    stderr: 'pipe',
    stdout: 'pipe',
  });
}

function outputText(result: ReturnType<typeof runCli>) {
  return `${result.stdout.toString()}\n${result.stderr.toString()}`;
}

describe('CLI command surface', () => {
  test('packages as @parix/cli with a parix binary', () => {
    expect(packageJson.name).toBe('@parix/cli');
    expect(packageJson.bin).toEqual({ parix: 'dist/cli.cjs' });
  });

  test('prints the package version with -v', () => {
    const versionResult = runCli(['-v']);

    expect(versionResult.exitCode).toBe(0);
    expect(versionResult.stdout.toString().trim()).toBe(packageJson.version);
  });

  test('registers the database command instead of the db command', () => {
    const databaseHelp = runCli(['database', '--help']);

    expect(databaseHelp.exitCode).toBe(0);
    expect(outputText(databaseHelp)).toContain('Usage: parix database');
    expect(outputText(databaseHelp)).toContain('parix database list');

    const dbCommand = runCli(['db', 'list']);

    expect(dbCommand.exitCode).not.toBe(0);
    expect(outputText(dbCommand)).toContain("unknown command 'db'");
  });
});
