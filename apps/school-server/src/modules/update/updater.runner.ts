import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

/** Injection token for the updater launcher (stubbed in tests). */
export const UPDATER_RUNNER = Symbol('UPDATER_RUNNER');

/** What the service needs from a launcher (CBT-04 section 6.4). */
export interface UpdaterRequest {
  /**
   * Helper batch file that runs the updater script. The launcher asks for
   * elevation on it; the operator can also run it by hand, which is the only
   * option when the service has no interactive session to prompt from.
   */
  commandFile: string;
}

export interface UpdaterOutcome {
  started: boolean;
  /** Why the updater could not be started; shown to the operator. */
  reason?: string;
}

export interface UpdaterRunner {
  run(request: UpdaterRequest): Promise<UpdaterOutcome>;
}

/**
 * Starts the updater through a UAC prompt. The server runs as `LocalService`,
 * which cannot write to Program Files or control the service, so the swap has to
 * happen in an elevated process — the same consent a manual upgrade needs.
 */
@Injectable()
export class ElevatingUpdaterRunner implements UpdaterRunner {
  private readonly logger = new Logger(ElevatingUpdaterRunner.name);

  async run(request: UpdaterRequest): Promise<UpdaterOutcome> {
    if (!existsSync(request.commandFile)) {
      return { started: false, reason: `Updater helper not found: ${request.commandFile}` };
    }

    return new Promise<UpdaterOutcome>((resolve) => {
      const script = `Start-Process -FilePath ${quote(request.commandFile)} -Verb RunAs`;
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });

      child.on('error', (error) => resolve({ started: false, reason: error.message }));
      child.on('exit', (code) => {
        if (code === 0) {
          resolve({ started: true });
          return;
        }
        this.logger.warn(`Elevation request for ${request.commandFile} exited with ${code}`);
        resolve({
          started: false,
          reason: `Elevation was refused; run ${request.commandFile} as administrator`,
        });
      });
    });
  }
}

/** Single-quoted PowerShell literal. */
function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
