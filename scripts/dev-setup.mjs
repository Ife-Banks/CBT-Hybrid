import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const envPath = resolve(root, '.env');
const examplePath = resolve(root, '.env.example');

if (!existsSync(examplePath)) {
  console.error('dev:setup: .env.example not found');
  process.exit(1);
}

if (!existsSync(envPath)) {
  copyFileSync(examplePath, envPath);
  console.log('dev:setup: created .env from .env.example');
} else {
  console.log('dev:setup: .env already exists (left unchanged)');
}

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

const env = parseEnv(readFileSync(envPath, 'utf8'));
const required = [
  'DATABASE_URL',
  'REDIS_URL',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
];

const missing = required.filter((key) => !env[key] || env[key].trim() === '');

console.log('');
console.log('Development uses managed cloud services (no local Docker):');
console.log('  Postgres -> Neon          https://neon.tech');
console.log('  Redis    -> Upstash       https://upstash.com');
console.log('  Storage  -> Cloudflare R2 https://developers.cloudflare.com/r2');
console.log('');

if (missing.length > 0) {
  console.warn(`dev:setup: still need values for: ${missing.join(', ')}`);
  console.warn('Fill them in .env, then run `pnpm dev:start`.');
  process.exitCode = 1;
} else {
  console.log('dev:setup: all required variables are present. Run `pnpm dev:start`.');
}
