import { Command } from 'commander';
import { PARIX_AGENT_SKILL } from './skill-content';

export function createSkillCommand() {
  return new Command('skill').description('Print the agent skill file to stdout').action(() => {
    process.stdout.write(PARIX_AGENT_SKILL);
  });
}
