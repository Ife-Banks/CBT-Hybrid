import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Web root candidates for the console and setup pages, in priority order. */
function webDirs(): string[] {
  const dirs: string[] = [];
  if (process.env.SCHOOL_WEB_DIR) dirs.push(process.env.SCHOOL_WEB_DIR);
  dirs.push('public', 'console', 'web');
  return dirs.map((dir) => resolve(dir));
}

/** Exam-client root candidates, in priority order. */
function clientDirs(): string[] {
  const dirs: string[] = [];
  if (process.env.SCHOOL_CLIENT_DIR) dirs.push(process.env.SCHOOL_CLIENT_DIR);
  dirs.push(
    'exam-client',
    'client',
    join('..', 'exam-client', 'public'),
    join('..', 'exam-client'),
  );
  return dirs.map((dir) => resolve(dir));
}

/** Absolute path of the web root (holds `setup.html`), or `null`. */
export function resolveWebDir(): string | null {
  for (const dir of webDirs()) {
    if (existsSync(join(dir, 'setup.html'))) return dir;
  }
  return null;
}

/** Absolute path of a web page, or `null` when it is not shipped. */
export function resolveWebPage(file: string): string | null {
  for (const dir of webDirs()) {
    const candidate = join(dir, file);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Absolute path of the exam-client root (holds `index.html`), or `null`. */
export function resolveExamClientDir(): string | null {
  for (const dir of clientDirs()) {
    if (existsSync(join(dir, 'index.html'))) return dir;
  }
  return null;
}
