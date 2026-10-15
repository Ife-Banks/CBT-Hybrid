import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// Directories whose *built* output must never reference an external host
// (CBT-04-Build-Specification.md section 2.4, `check:offline`).
const SCAN_DIRS = ['apps/exam-client/dist', 'apps/cloud-web/dist'];

const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1']);

// Absolute URLs and protocol-relative references.
const PATTERNS = [
  /https?:\/\/[^\s"'`<>()]+/gi,
  /(?:src|href)\s*=\s*["']\/\/[^\s"'`<>()]+/gi,
  /url\(\s*["']?\/\/[^\s"'`<>()]+/gi,
];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

const failures = [];

for (const rel of SCAN_DIRS) {
  const abs = resolve(process.cwd(), rel);
  if (!existsSync(abs)) {
    console.log(`check:offline: skipping ${rel} (no build output yet)`);
    continue;
  }
  for (const file of walk(abs)) {
    const text = readFileSync(file, 'utf8');
    for (const pattern of PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of text.matchAll(pattern)) {
        const raw = match[0];
        const urlPart = raw.match(/https?:\/\/[^\s"'`<>()]+/i)?.[0];
        if (urlPart) {
          try {
            if (ALLOWED_HOSTS.has(new URL(urlPart).hostname)) continue;
          } catch {
            /* fall through and report the malformed reference */
          }
        }
        failures.push(`${relative(process.cwd(), file)}: ${raw.trim()}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error('check:offline: external references found in built output:');
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}

console.log('check:offline: OK - no external references in built output');
