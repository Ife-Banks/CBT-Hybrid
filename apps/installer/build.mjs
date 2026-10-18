// @ts-check
/**
 * Assembles the Windows installer staging tree described in
 * `docs/CBT-04-Build-Specification.md` section 6.1.
 *
 * Output (under `apps/installer/staging/`):
 *
 *   node.exe                     Node runtime (copied from the running Node)
 *   app\server.cjs               bundled school server (esbuild)
 *   app\migrations\              drizzle migrations, pointed at by WinSW
 *   app\console\index.html       static console page
 *   app\exam-client\             static exam client
 *   app\node_modules\            better-sqlite3, argon2, swagger-ui-dist
 *   SchoolCBT.exe                WinSW service wrapper (from vendor\, see README)
 *   SchoolCBT.xml                WinSW configuration
 *   tools\                       firewall / power / shortcut helpers
 *   VERSION.txt
 *
 * The tree is what `installer.iss` compiles. This script does not need Inno
 * Setup or WinSW installed to produce the bundle: missing WinSW only warns, so
 * `pnpm --filter @cbt/installer package:win` stays useful on a dev box.
 *
 * Usage:
 *   node apps/installer/build.mjs [--skip-deps]
 *     --skip-deps   assume @cbt/school-server and its workspace deps are built
 */
import { createRequire } from 'node:module';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const schoolServerDir = join(repoRoot, 'apps', 'school-server');
const examClientDir = join(repoRoot, 'apps', 'exam-client');
const staging = join(here, 'staging');
const appDir = join(staging, 'app');
const appModules = join(appDir, 'node_modules');

/**
 * Packages that stay external and are copied into `app/node_modules`:
 * native binaries (must not be bundled) and `swagger-ui-dist`, which
 * `@nestjs/swagger` resolves from disk at runtime.
 */
const SHIPPED_MODULES = [
  { name: 'better-sqlite3', from: 'self' },
  { name: 'argon2', from: 'self' },
  { name: 'swagger-ui-dist', from: '@nestjs/swagger' },
];
const NATIVE_MODULES = ['better-sqlite3', 'argon2'];

/**
 * Nest lazily `import()`s these optional integrations; they are never used by
 * the school server, so leaving them unresolved keeps the bundle small and lets
 * the dynamic import fail harmlessly at runtime.
 */
const OPTIONAL_EXTERNALS = [
  'class-validator',
  'class-transformer',
  'cache-manager',
  '@nestjs/microservices',
  '@nestjs/microservices/*',
  '@nestjs/websockets',
  '@nestjs/websockets/*',
  '@nestjs/platform-socket.io',
  '@nestjs/platform-ws',
  '@nestjs/platform-fastify',
  '@fastify/static',
  '@fastify/*',
  '@grpc/grpc-js',
  '@grpc/proto-loader',
  'kafkajs',
  'mqtt',
  'nats',
  'ioredis',
  'redis',
  'amqplib',
  'amqp-connection-manager',
  'swagger-ui-dist',
  'swagger-ui-dist/*',
];

const skipDeps = process.argv.includes('--skip-deps');

const log = (message) => console.log(`[installer] ${message}`);

function run(command) {
  log(`$ ${command}`);
  execSync(command, { cwd: repoRoot, stdio: 'inherit' });
}

function ensureBuilt() {
  if (skipDeps) {
    log('--skip-deps: assuming workspace build output is present');
    return;
  }
  // Builds the school server and its workspace dependencies in order.
  run('pnpm --filter "@cbt/school-server..." build');
}

function resetStaging() {
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(appDir, { recursive: true });
}

/** Resolve the on-disk directory of an installed package (pnpm-safe). */
function packageDir(name, fromDir) {
  const require = createRequire(join(fromDir, 'noop.js'));
  let entry;
  try {
    entry = require.resolve(`${name}/package.json`);
  } catch {
    entry = require.resolve(name);
  }
  let dir = dirname(entry);
  for (;;) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
      if (pkg.name === name) return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`Could not locate package directory for ${name}`);
    dir = parent;
  }
}

/** Copy a package (and its runtime dependency closure) into the app tree. */
function copyPackage(name, fromDir, seen = new Set()) {
  const source = packageDir(name, fromDir);
  const real = realpathSync(source);
  if (seen.has(real)) return;
  seen.add(real);

  const target = join(appModules, ...name.split('/'));
  rmSync(target, { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true, dereference: true });

  const pkg = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
  for (const dependency of Object.keys(pkg.dependencies ?? {})) {
    copyPackage(dependency, source, seen);
  }
}

async function bundleServer() {
  const { build } = await import('esbuild');
  const entry = join(schoolServerDir, 'dist', 'main.js');
  if (!existsSync(entry)) {
    throw new Error(`Missing ${entry}. Run without --skip-deps, or build the school server first.`);
  }

  const outfile = join(appDir, 'server.cjs');
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    sourcemap: false,
    logLevel: 'warning',
    external: [...NATIVE_MODULES, ...OPTIONAL_EXTERNALS],
    define: {
      'process.env.NODE_ENV': '"production"',
      // @nestjs/swagger calls createRequire(import.meta.url); CJS output has no
      // import.meta, so point it at the bundle's own location instead.
      'import.meta.url': '__importMetaUrl',
    },
    banner: {
      js: "const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;",
    },
    // Nest reads some optional integrations through dynamic requires; leave
    // anything unresolved as a runtime require rather than failing the build.
    logOverride: { 'require-resolve-not-external': 'silent' },
  });

  const size = statSync(outfile).size;
  log(`bundled dist/main.js -> app/server.cjs (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

function copyStatic() {
  // Console page: the school server's public folder becomes app/console.
  const consoleTarget = join(appDir, 'console');
  mkdirSync(consoleTarget, { recursive: true });
  const adminHtml = join(schoolServerDir, 'public', 'admin.html');
  if (existsSync(adminHtml)) {
    copyFileSync(adminHtml, join(consoleTarget, 'index.html'));
    log('copied console page -> app/console/index.html');
  }

  // Exam client: its public folder becomes app/exam-client.
  const clientPublic = join(examClientDir, 'public');
  if (existsSync(clientPublic)) {
    cpSync(clientPublic, join(appDir, 'exam-client'), { recursive: true });
    log('copied exam client -> app/exam-client');
  }

  // Migrations are resolved through SCHOOL_MIGRATIONS_DIR (set by WinSW), so a
  // stable location independent of the working directory is enough.
  cpSync(
    join(schoolServerDir, 'src', 'shared', 'database', 'migrations'),
    join(appDir, 'migrations'),
    {
      recursive: true,
    },
  );
  log('copied migrations -> app/migrations');
}

function copyRuntime() {
  copyFileSync(process.execPath, join(staging, 'node.exe'));
  log(`copied node runtime (${process.version}) -> node.exe`);

  const version =
    JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version ?? '0.0.0';
  writeFileSync(join(staging, 'VERSION.txt'), `${version}\n`);

  // WinSW is a downloaded binary, not a dependency. Look in vendor\, then warn.
  const winswCandidates = [
    join(here, 'vendor', 'SchoolCBT.exe'),
    join(here, 'vendor', 'WinSW-x64.exe'),
  ];
  const winsw = winswCandidates.find((candidate) => existsSync(candidate));
  if (winsw) {
    copyFileSync(winsw, join(staging, 'SchoolCBT.exe'));
    log('copied WinSW wrapper -> SchoolCBT.exe');
  } else {
    log(
      'WARN: WinSW not found. Put WinSW-x64.exe in apps/installer/vendor/SchoolCBT.exe ' +
        'before compiling the installer (see README). Continuing without it.',
    );
  }

  copyFileSync(join(here, 'SchoolCBT.xml'), join(staging, 'SchoolCBT.xml'));
  cpSync(join(here, 'tools'), join(staging, 'tools'), { recursive: true });
  log('copied SchoolCBT.xml and tools/');
}

function report() {
  const entries = readdirSync(staging).sort();
  log(`staging ready: ${staging}`);
  for (const entry of entries) log(`  ${entry}`);
  if (!existsSync(join(staging, 'SchoolCBT.exe'))) {
    log('note: staging is incomplete (no WinSW) — installer.iss cannot compile yet.');
  }
}

async function main() {
  ensureBuilt();
  resetStaging();
  await bundleServer();
  copyStatic();
  for (const { name, from } of SHIPPED_MODULES) {
    const fromDir = from === 'self' ? schoolServerDir : packageDir(from, schoolServerDir);
    copyPackage(name, fromDir);
    log(`copied runtime package -> app/node_modules/${name}`);
  }
  copyRuntime();
  report();
}

main().catch((error) => {
  console.error(`[installer] build failed: ${error?.message ?? error}`);
  process.exit(1);
});
