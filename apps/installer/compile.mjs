// @ts-check
/**
 * Compiles `installer.iss` with Inno Setup's command-line compiler (ISCC).
 *
 * Inno Setup is not an npm dependency; install it from
 * https://jrsoftware.org/isdl.php or set INNO_SETUP_ISCC to the full path of
 * ISCC.exe. Run `pnpm --filter @cbt/installer package:win` first so the
 * `staging/` tree exists.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const staging = join(here, 'staging');

function findIscc() {
  const candidates = [
    process.env.INNO_SETUP_ISCC,
    join(process.env['ProgramFiles(x86)'] ?? '', 'Inno Setup 6', 'ISCC.exe'),
    join(process.env.ProgramFiles ?? '', 'Inno Setup 6', 'ISCC.exe'),
    // Per-user installs (winget without elevation).
    join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
    join(process.env['ProgramFiles(x86)'] ?? '', 'Inno Setup 5', 'ISCC.exe'),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

if (!existsSync(join(staging, 'VERSION.txt'))) {
  console.error(
    '[installer] staging/ is missing. Run `pnpm --filter @cbt/installer package:win` first.',
  );
  process.exit(1);
}
if (!existsSync(join(staging, 'SchoolCBT.exe'))) {
  console.error(
    '[installer] staging/SchoolCBT.exe is missing. Put WinSW in apps/installer/vendor/ (see README).',
  );
  process.exit(1);
}

const iscc = findIscc();
if (!iscc) {
  console.error(
    '[installer] Inno Setup compiler (ISCC.exe) not found.\n' +
      '            Install Inno Setup 6, or set INNO_SETUP_ISCC to its full path.',
  );
  process.exit(1);
}

const script = resolve(here, 'installer.iss');
console.log(`[installer] compiling ${script}`);

try {
  execFileSync(iscc, [script], { cwd: here, stdio: 'inherit' });
} catch {
  console.error('[installer] ISCC failed.');
  process.exit(1);
}

console.log(`[installer] installer written to ${join(here, 'output')}`);
