import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

if (!existsSync(resolve(root, '.env'))) {
  console.warn('dev:start: no .env found. Run `pnpm dev:setup` first.');
}

console.log(
  'dev:start: launching workspace dev servers (cloud-api, school-server, web, exam-client)',
);

const child = spawn('pnpm', ['dev'], { stdio: 'inherit', shell: true, cwd: root });

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (error) => {
  console.error(`dev:start: failed to launch: ${error.message}`);
  process.exit(1);
});
