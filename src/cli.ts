#!/usr/bin/env node

import { log } from '@clack/prompts';
import { Command } from 'commander';
import { createApiCommand } from './commands/api';
import { createAuthCommand } from './commands/auth';
import { createDatabaseCommand } from './commands/database';
import { createSkillCommand } from './commands/skill';
import { createTbCommand } from './commands/tb';
import { isJsonOutputRequested } from './lib/output';
import { version } from '../package.json';

async function main() {
  const program = new Command();

  program
    .name('parix')
    .version(version, '-v, --version')
    .description('Parix command line interface')
    .showHelpAfterError()
    .addCommand(createAuthCommand())
    .addCommand(createApiCommand())
    .addCommand(createDatabaseCommand())
    .addCommand(createSkillCommand())
    .addCommand(createTbCommand());

  await program.parseAsync(process.argv);
}

// Pipe writes are asynchronous on macOS; drain them so `process.exit` cannot truncate output.
function flushStdout() {
  return new Promise<void>((resolve) => {
    process.stdout.write('', () => resolve());
  });
}

main()
  .then(async () => {
    // CLIs that open HTTP servers / use undici fetch can leave sockets that keep
    // Node alive after the command is done. Exit explicitly once work is finished.
    await flushStdout();
    process.exit(process.exitCode ?? 0);
  })
  .catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (isJsonOutputRequested()) {
      process.stderr.write(`Error: ${message}\n`);
    } else {
      log.error(message);
    }
    await flushStdout();
    process.exit(1);
  });
