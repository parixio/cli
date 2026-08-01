import { readFile, writeFile } from 'node:fs/promises';

const cliPath = new URL('../dist/cli.cjs', import.meta.url);
const source = await readFile(cliPath, 'utf8');
if (!source.startsWith('#!')) {
  await writeFile(cliPath, `#!/usr/bin/env node\n${source}`);
}
