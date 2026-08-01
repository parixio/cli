import { describe, expect, test } from 'bun:test';

const cliArgs = [process.execPath, 'src/cli.ts'];

function runHelp(command: string) {
  return Bun.spawnSync({
    cmd: [...cliArgs, 'tb', command, '--help'],
    stderr: 'pipe',
    stdout: 'pipe',
  });
}

describe('TigerBeetle create command help', () => {
  test('documents transfer user data, imported timestamp, and timeout units', () => {
    const result = runHelp('create-transfers');
    const output = `${result.stdout.toString()}\n${result.stderr.toString()}`;

    expect(result.exitCode).toBe(0);
    expect(output).toContain('--user-data-128 <value>');
    expect(output).toContain('--user-data-64 <value>');
    expect(output).toContain('--user-data-32 <value>');
    expect(output).toContain('--timestamp <nanoseconds>');
    expect(output).toContain('--timeout <seconds>');
    expect(output).not.toContain('--timeout <ms>');
    expect(output).toContain('--pending-id 2000 --amount 25 --flag post_pending_transfer');
  });

  test('documents imported timestamps for accounts', () => {
    const result = runHelp('create-accounts');
    const output = `${result.stdout.toString()}\n${result.stderr.toString()}`;

    expect(result.exitCode).toBe(0);
    expect(output).toContain('--timestamp <nanoseconds>');
  });
});
