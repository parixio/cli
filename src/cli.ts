#!/usr/bin/env node

import { log } from '@clack/prompts';
import { Command } from 'commander';
import { createRequire } from 'node:module';
import { createApiCommand } from './commands/api';
import { createAuthCommand } from './commands/auth';
import { createDatabaseCommand } from './commands/database';
import { createSkillCommand } from './commands/skill';
import { createTbCommand } from './commands/tb';

const loadPackageJson = createRequire(import.meta.url);
const packageJson = loadPackageJson('../package.json') as { version: string };

async function main() {
  const program = new Command();

  program
    .name('parix')
    .version(packageJson.version, '-v, --version')
    .description('Parix command line interface')
    .showHelpAfterError()
    .addCommand(createAuthCommand())
    .addCommand(createApiCommand())
    .addCommand(createDatabaseCommand())
    .addCommand(createSkillCommand())
    .addCommand(createTbCommand());

  await program.parseAsync(process.argv);
}

main()
  .then(() => {
    // CLIs that open HTTP servers / use undici fetch can leave sockets that keep
    // Node alive after the command is done. Exit explicitly once work is finished.
    process.exit(process.exitCode ?? 0);
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    log.error(message);
    process.exit(1);
  });
