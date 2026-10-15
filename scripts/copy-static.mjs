import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const [src, dest] = process.argv.slice(2);

if (!src || !dest) {
  console.error('usage: copy-static <src> <dest>');
  process.exit(1);
}

const srcAbs = resolve(process.cwd(), src);
const destAbs = resolve(process.cwd(), dest);

if (!existsSync(srcAbs)) {
  console.error(`copy-static: source not found: ${srcAbs}`);
  process.exit(1);
}

rmSync(destAbs, { recursive: true, force: true });
mkdirSync(destAbs, { recursive: true });
cpSync(srcAbs, destAbs, { recursive: true });

console.log(`copied ${srcAbs} -> ${destAbs}`);
