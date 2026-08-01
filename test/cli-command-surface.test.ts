import { describe, expect, test } from 'bun:test';
import packageJson from '../package.json';
import { PARIX_AGENT_SKILL } from '../src/commands/skill-content';

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

  test('prints the embedded agent skill as raw Markdown', () => {
    const skillResult = runCli(['skill']);

    expect(skillResult.exitCode).toBe(0);
    expect(skillResult.stderr.toString()).toBe('');
    expect(skillResult.stdout.toString()).toBe(PARIX_AGENT_SKILL);
    expect(skillResult.stdout.toString()).toStartWith('---\nname: parix\n');
    expect(skillResult.stdout.toString()).toContain('\n# Parix CLI\n');
    expect(skillResult.stdout.toString()).toContain('Never read or print `~/.config/parix/session.json`');
    expect(skillResult.stdout.toString()).toContain('`--timestamp` in nanoseconds');
    expect(skillResult.stdout.toString()).toContain('`--timeout` values are in seconds');
    expect(skillResult.stdout.toString()).toEndWith('\n');
  });

  test('registers skill with the expected help description', () => {
    const rootHelp = runCli(['--help']);
    const skillHelp = runCli(['skill', '--help']);

    expect(rootHelp.exitCode).toBe(0);
    expect(rootHelp.stdout.toString()).toMatch(/^\s+skill\s+Print the agent skill file to stdout$/m);
    expect(skillHelp.exitCode).toBe(0);
    expect(skillHelp.stderr.toString()).toBe('');
    expect(skillHelp.stdout.toString()).toContain('Usage: parix skill [options]');
    expect(skillHelp.stdout.toString()).toContain('Print the agent skill file to stdout');
    expect(skillHelp.stdout.toString()).not.toContain('# Parix CLI');
  });
});
