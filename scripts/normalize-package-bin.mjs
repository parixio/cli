import { readFile, writeFile } from 'node:fs/promises';

const packageJsonPath = new URL('../package.json', import.meta.url);
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

packageJson.bin = {
  parix: 'dist/cli.cjs',
};

await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
