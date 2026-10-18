import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  statfsSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { arch, platform, release, uptime } from 'node:os';
import { VERSION } from '@cbt/shared-types';
import { SchoolConfigService } from '../../common/config/school-config.service';
import { problem } from '../../common/http/problem';
import {
  CATALOG_REPOSITORY,
  type CatalogRepository,
} from '../exam/repositories/catalog.repository';
import {
  META_KEYS,
  META_REPOSITORY,
  type MetaRepository,
} from '../exam/repositories/meta.repository';
import { UPDATER_RUNNER, type UpdaterRunner } from './updater.runner';

/** Injection token for the HTTP client used for the heartbeat and the download. */
export const UPDATE_HTTP = Symbol('UPDATE_HTTP');

/** The updater must keep the server healthy within this many seconds (spec 6.4). */
export const HEALTH_TIMEOUT_SECONDS = 60;

/** A sitting starting within this window blocks an update (API spec 17.5). */
export const SITTING_BLOCK_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Release offered in the heartbeat (API spec 13.8). */
export interface UpdateOffer {
  version: string;
  download_url: string;
  sha256: string;
  min_supported?: string;
  notes?: string;
}

/** A verified package sitting in the updates folder, ready to install. */
export interface StagedUpdate {
  version: string;
  path: string;
  sha256: string;
  bytes: number;
  staged_at: string;
}

/** What the updater reported last time it ran (spec 6.4). */
export interface UpdateResult {
  status: 'applied' | 'update_failed';
  version: string;
  at: string;
  detail?: string | null;
}

export type UpdateBlockedReason = 'sitting_open' | 'sitting_due' | 'nothing_staged';

export interface UpdateStatus {
  current_version: string;
  auto_update: boolean;
  offline: boolean;
  offer: UpdateOffer | null;
  staged: StagedUpdate | null;
  checked_at: string | null;
  check_error: string | null;
  last_result: UpdateResult | null;
  can_apply: boolean;
  blocked_reason: UpdateBlockedReason | null;
  blocked_sitting_id: string | null;
  /** Helper the operator can run as administrator when elevation is refused. */
  command_file: string | null;
  elevation_command: string | null;
}

/**
 * In-app updates (CBT-04 section 6.4). The heartbeat offers a release, the
 * server downloads it to `<dataDir>/updates` and verifies its SHA-256, and the
 * invigilator applies it between sittings. The swap itself is done by the
 * elevated `tools/apply-update.ps1`, which rolls back if the server does not
 * report healthy; this service records the offer, stages the package and reads
 * back the updater's result.
 */
@Injectable()
export class UpdateService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UpdateService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(META_REPOSITORY) private readonly meta: MetaRepository,
    @Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepository,
    @Inject(UPDATER_RUNNER) private readonly updater: UpdaterRunner,
    @Inject(UPDATE_HTTP) private readonly http: typeof fetch,
    private readonly config: SchoolConfigService,
  ) {}

  onModuleInit(): void {
    const minutes = this.config.updateCheckMinutes;
    if (minutes <= 0) return;
    this.timer = setInterval(() => void this.tick(), minutes * 60_000);
    // Never hold the process open just for the update poll.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async getStatus(): Promise<UpdateStatus> {
    const [offer, staged, checkedAt, checkError] = await Promise.all([
      this.readJson<UpdateOffer>(META_KEYS.updateOffer),
      this.readJson<StagedUpdate>(META_KEYS.updateStaged),
      this.meta.get(META_KEYS.updateCheckedAt),
      this.meta.get(META_KEYS.updateCheckError),
    ]);
    const blocking = await this.blockingSitting();

    let blockedReason: UpdateBlockedReason | null = null;
    if (!staged) blockedReason = 'nothing_staged';
    else if (blocking) blockedReason = blocking.status === 'open' ? 'sitting_open' : 'sitting_due';

    return {
      current_version: VERSION,
      auto_update: this.config.autoUpdate,
      offline: this.config.isOfflineMode(),
      offer,
      staged,
      checked_at: checkedAt || null,
      check_error: checkError || null,
      last_result: this.readLastResult(),
      can_apply: blockedReason === null,
      blocked_reason: blockedReason,
      blocked_sitting_id: blocking?.id ?? null,
      command_file: existsSync(this.commandFile()) ? this.commandFile() : null,
      elevation_command: this.elevationCommand(),
    };
  }

  /** Ask the cloud whether a newer release is available (API spec 13.8). */
  async checkForUpdate(): Promise<UpdateStatus> {
    if (this.config.isOfflineMode()) {
      throw problem('CONFLICT', 'The server is in offline mode; updates are disabled');
    }
    const cloudUrl = await this.resolveCloudUrl();
    if (!cloudUrl) {
      throw problem('CONFLICT', 'No cloud URL is configured; activate the server first');
    }

    let response: Response;
    try {
      response = await this.http(`${cloudUrl}/api/v1/sync/v1/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(await this.heartbeat()),
      });
    } catch (error) {
      return this.recordCheckFailure(
        `Could not reach the cloud at ${cloudUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!response.ok) {
      return this.recordCheckFailure(`Heartbeat rejected with HTTP ${response.status}`);
    }

    const body = (await response.json().catch(() => null)) as { update?: unknown } | null;
    const offer = asOffer(body?.update);
    await this.meta.set(META_KEYS.updateOffer, offer ? JSON.stringify(offer) : '');
    await this.meta.set(META_KEYS.updateCheckedAt, new Date().toISOString());
    await this.meta.set(META_KEYS.updateCheckError, '');
    this.logger.log(offer ? `Update ${offer.version} offered` : 'No update offered');
    return this.getStatus();
  }

  /** Download the offered package and verify its SHA-256 (spec 6.4). */
  async downloadUpdate(): Promise<UpdateStatus> {
    const offer = await this.readJson<UpdateOffer>(META_KEYS.updateOffer);
    if (!offer) {
      throw problem('CONFLICT', 'No update has been offered yet; check for updates first');
    }
    if (offer.version === VERSION) {
      throw problem('CONFLICT', `This server already runs version ${offer.version}`);
    }

    const path = await this.download(offer);
    const staged: StagedUpdate = {
      version: offer.version,
      path,
      sha256: offer.sha256.toLowerCase(),
      bytes: statSync(path).size,
      staged_at: new Date().toISOString(),
    };
    await this.meta.set(META_KEYS.updateStaged, JSON.stringify(staged));
    this.writeCommandFile(staged);
    this.logger.log(`Staged update ${staged.version} (${staged.bytes} bytes)`);
    return this.getStatus();
  }

  /**
   * Hand the staged package to the elevated updater. Refused while a sitting is
   * open or starts within two hours (API spec 17.5).
   */
  async applyUpdate(): Promise<{ status: 'applying'; version: string; command_file: string }> {
    const staged = await this.readJson<StagedUpdate>(META_KEYS.updateStaged);
    if (!staged) {
      throw problem('CONFLICT', 'No update has been downloaded yet');
    }

    const blocking = await this.blockingSitting();
    if (blocking) {
      throw problem(
        'CONFLICT',
        `Updates are blocked while sitting ${blocking.id} is ${blocking.status}`,
      );
    }

    const commandFile = this.writeCommandFile(staged);
    const outcome = await this.updater.run({ commandFile });
    if (!outcome.started) {
      throw problem('CONFLICT', outcome.reason ?? 'Could not start the updater');
    }

    return { status: 'applying', version: staged.version, command_file: commandFile };
  }

  /** One background pass: check, stage, and apply when auto-update allows it. */
  private async tick(): Promise<void> {
    try {
      if (this.config.isOfflineMode()) return;
      await this.checkForUpdate();
      if (!this.config.autoUpdate) return;

      if (!(await this.readJson<StagedUpdate>(META_KEYS.updateStaged))) {
        await this.downloadUpdate();
      }
      if (!(await this.blockingSitting())) {
        await this.applyUpdate();
      }
    } catch (error) {
      this.logger.warn(
        `Update check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** The sitting that forbids an update right now, if any. */
  private async blockingSitting() {
    return this.catalog.findBlockingSitting(
      new Date(Date.now() + SITTING_BLOCK_WINDOW_MS).toISOString(),
    );
  }

  private async download(offer: UpdateOffer): Promise<string> {
    const url = safeDownloadUrl(offer.download_url);
    const directory = this.config.updatesDir;
    mkdirSync(directory, { recursive: true });

    const target = join(directory, `SchoolCBT-Setup-${safeVersion(offer.version)}.exe`);
    const partial = `${target}.part`;

    let response: Response;
    try {
      response = await this.http(url);
    } catch (error) {
      throw problem(
        'CONFLICT',
        `Could not download ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!response.ok || !response.body) {
      throw problem('CONFLICT', `Download of ${url} failed with HTTP ${response.status}`);
    }

    const hash = createHash('sha256');
    try {
      const body = Readable.fromWeb(
        response.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>,
      );
      await pipeline(body, hashingTransform(hash), createWriteStream(partial));
    } catch (error) {
      rmSync(partial, { force: true });
      throw problem(
        'CONFLICT',
        `Download of ${url} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const digest = hash.digest('hex');
    if (digest !== offer.sha256.toLowerCase()) {
      rmSync(partial, { force: true });
      throw problem(
        'CONFLICT',
        `Checksum mismatch for ${offer.version}: expected ${offer.sha256}, got ${digest}`,
      );
    }

    rmSync(target, { force: true });
    renameSync(partial, target);
    return target;
  }

  /** Report what this server knows; the sync agent adds cursor, packs and backups. */
  private async heartbeat(): Promise<Record<string, unknown>> {
    return {
      software_version: VERSION,
      os_version: release(),
      platform: { os: platform(), arch: arch() },
      uptime_seconds: Math.floor(uptime()),
      db_size_mb: this.databaseSizeMb(),
      disk_free_mb: this.diskFreeMb(),
      open_sittings: [],
    };
  }

  private databaseSizeMb(): number | null {
    try {
      return Math.round(statSync(this.config.dbPath).size / (1024 * 1024));
    } catch {
      return null;
    }
  }

  private diskFreeMb(): number | null {
    try {
      const stats = statfsSync(this.config.dataDir);
      return Math.round((Number(stats.bavail) * Number(stats.bsize)) / (1024 * 1024));
    } catch {
      return null;
    }
  }

  async resolveCloudUrl(): Promise<string | null> {
    const candidate = (await this.meta.get(META_KEYS.cloudUrl)) ?? this.config.cloudSyncUrl;
    return candidate ? candidate.replace(/\/+$/, '') : null;
  }

  private async recordCheckFailure(message: string): Promise<UpdateStatus> {
    this.logger.warn(`Update check failed: ${message}`);
    await this.meta.set(META_KEYS.updateCheckedAt, new Date().toISOString());
    await this.meta.set(META_KEYS.updateCheckError, message);
    return this.getStatus();
  }

  private async readJson<T>(key: string): Promise<T | null> {
    const raw = await this.meta.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      this.logger.warn(`Ignoring unreadable ${key} in the metadata store`);
      return null;
    }
  }

  private resultFile(): string {
    return join(this.config.updatesDir, 'last-result.json');
  }

  private commandFile(): string {
    return join(this.config.updatesDir, 'SchoolCBT-Update.cmd');
  }

  private elevationCommand(): string {
    return `powershell -Command "Start-Process -Verb RunAs '${this.commandFile()}'"`;
  }

  /** Reads what the updater wrote after its last run (spec 6.4). */
  private readLastResult(): UpdateResult | null {
    const path = this.resultFile();
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as UpdateResult;
    } catch {
      this.logger.warn(`Ignoring unreadable update result at ${path}`);
      return null;
    }
  }

  /**
   * Writes the batch file that runs the updater. It is both what the elevation
   * prompt launches and the fallback the operator can double-click.
   */
  private writeCommandFile(staged: StagedUpdate): string {
    const path = this.commandFile();
    mkdirSync(this.config.updatesDir, { recursive: true });
    const line = [
      'powershell -NoProfile -ExecutionPolicy Bypass',
      `-File "${this.config.updaterScript}"`,
      `-Package "${staged.path}"`,
      `-DataDir "${this.config.dataDir}"`,
      `-ServiceName "SchoolCBT"`,
      `-Port ${this.config.port}`,
      `-HealthTimeoutSeconds ${HEALTH_TIMEOUT_SECONDS}`,
      `-ResultFile "${this.resultFile()}"`,
    ].join(' ');
    const script = [
      '@echo off',
      'rem Installs a downloaded School CBT update. Requires administrator rights.',
      'rem Written by the exam server; safe to delete once the update is installed.',
      line,
      '',
    ].join('\r\n');
    writeFileSync(path, script, 'utf8');
    return path;
  }
}

/** Passes bytes through while hashing them. */
function hashingTransform(hash: ReturnType<typeof createHash>): Transform {
  return new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk as Buffer);
      callback(null, chunk);
    },
  });
}

/** Only http(s) downloads are accepted, so a rogue offer cannot read local files. */
function safeDownloadUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw problem('CONFLICT', `Update download URL is not a valid URL: ${value}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw problem('CONFLICT', `Update download URL must be http or https, got ${url.protocol}`);
  }
  return url.toString();
}

/** Keep the version out of the file path. */
function safeVersion(version: string): string {
  return version.replace(/[^A-Za-z0-9._-]/g, '_');
}

/** Validate an offer from the cloud before it is stored. */
function asOffer(value: unknown): UpdateOffer | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const { version, download_url: downloadUrl, sha256 } = record;
  if (
    typeof version !== 'string' ||
    typeof downloadUrl !== 'string' ||
    typeof sha256 !== 'string'
  ) {
    return null;
  }
  return {
    version,
    download_url: downloadUrl,
    sha256,
    ...(typeof record.min_supported === 'string' ? { min_supported: record.min_supported } : {}),
    ...(typeof record.notes === 'string' ? { notes: record.notes } : {}),
  };
}
