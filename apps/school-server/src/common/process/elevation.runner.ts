import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

/** Injection token for the elevation launcher (stubbed in tests). */
export const ELEVATION_RUNNER = Symbol('ELEVATION_RUNNER');

/** What a privileged helper needs: a batch file that runs the real script. */
export interface ElevationRequest {
  /**
   * Helper batch file that runs the privileged script. The launcher asks for
   * elevation on it; the operator can also run it by hand, which is the only
   * option when the service has no interactive session to prompt from.
   */
  commandFile: string;
}

export interface ElevationOutcome {
  started: boolean;
  /** Why the helper could not be started; shown to the operator. */
  reason?: string;
}

export interface ElevationRunner {
  run(request: ElevationRequest): Promise<ElevationOutcome>;
}

/**
 * Starts a privileged helper through a UAC prompt. The server runs as
 * `LocalService`, which cannot write to Program Files or control the service, so
 * work like swapping the install (CBT-04 section 6.4) or restoring a database
 * (section 6.6) has to happen in an elevated process — the same consent a manual
 * maintenance step needs.
 */
@Injectable()
export class ElevatingProcessRunner implements ElevationRunner {
  private readonly logger = new Logger(ElevatingProcessRunner.name);

  async run(request: ElevationRequest): Promise<ElevationOutcome> {
    if (!existsSync(request.commandFile)) {
      return { started: false, reason: `Helper not found: ${request.commandFile}` };
    }

    return new Promise<ElevationOutcome>((resolve) => {
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
