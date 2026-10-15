import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const targets = process.argv.slice(2);

if (targets.length === 0) {
  console.error('clean: no targets given');
  process.exit(1);
}

for (const target of targets) {
  const path = resolve(process.cwd(), target);
  rmSync(path, { recursive: true, force: true });
  console.log(`removed ${path}`);
}
