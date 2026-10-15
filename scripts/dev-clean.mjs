import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const targets = [
  '.turbo',
  'coverage',
  'apps/cloud-api/dist',
  'apps/school-server/dist',
  'apps/cloud-web/dist',
  'apps/exam-client/dist',
  'packages/shared-types/dist',
  'packages/exam-core/dist',
  'packages/ui/dist',
  'packages/test-fixtures/dist',
];

for (const target of targets) {
  rmSync(resolve(root, target), { recursive: true, force: true });
}

console.log(`dev:clean: removed ${targets.length} build/cache directories`);
