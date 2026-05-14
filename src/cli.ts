#!/usr/bin/env node

import { log } from '@clack/prompts';
import { Command } from 'commander';
import { createApiCommand } from './commands/api';
import { createAuthCommand } from './commands/auth';
import { createDatabaseCommand } from './commands/database';
import { createTbCommand } from './commands/tb';

async function main() {
  const program = new Command();

  program
    .name('parix')
    .description('Parix command line interface')
    .showHelpAfterError()
    .addCommand(createAuthCommand())
    .addCommand(createApiCommand())
    .addCommand(createDatabaseCommand())
    .addCommand(createTbCommand());

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  log.error(message);
  process.exitCode = 1;
});
