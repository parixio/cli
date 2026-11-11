import { log } from '@clack/prompts';
import process from 'node:process';

/** Machine-readable output for `--json`: plain JSON on stdout, with no terminal decoration. */
export function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** JSON shown inside the decorated human-readable output. */
export function printJsonBlock(value: unknown) {
  log.message(JSON.stringify(value, null, 2));
}

/** True when the current invocation asked for machine-readable output. */
export function isJsonOutputRequested(argv: readonly string[] = process.argv) {
  return argv.includes('--json');
}

export function printKeyValues(entries: Array<[string, string]>) {
  const keyWidth = Math.max(...entries.map(([key]) => key.length), 0);
  log.message(entries.map(([key, value]) => `${key.padEnd(keyWidth)}  ${value}`).join('\n'));
}

export function printTable(input: { columns: string[]; rows: string[][] }) {
  const widths = input.columns.map((column, index) =>
    Math.max(column.length, ...input.rows.map((row) => row[index]?.length ?? 0)),
  );

  const header = input.columns.map((column, index) => column.padEnd(widths[index] ?? 0)).join('  ');
  const divider = widths.map((width) => '-'.repeat(width)).join('  ');
  const rows = input.rows.map((row) => row.map((value, index) => value.padEnd(widths[index] ?? 0)).join('  '));

  log.message([header, divider, ...rows].join('\n'));
}
