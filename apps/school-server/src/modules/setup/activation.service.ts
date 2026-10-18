import { Inject, Injectable, Logger } from '@nestjs/common';
import { hostname } from 'node:os';
import { isErrorCode, type ErrorCode } from '@cbt/shared-types';
import { SchoolConfigService } from '../../common/config/school-config.service';
import { problem } from '../../common/http/problem';
import {
  META_KEYS,
  META_REPOSITORY,
  type MetaRepository,
} from '../exam/repositories/meta.repository';
import { DEVICE_SECRET_STORE, type DeviceSecretStore } from './device-secret.store';
import { MACHINE_ID_HASH, platformInfo, softwareVersion } from './machine-identity';

/** Injection token for the HTTP client used to reach the cloud (stubbed in tests). */
export const ACTIVATION_HTTP = Symbol('ACTIVATION_HTTP');

/** Body accepted by the setup page (API spec 13.3). */
export interface ActivateInput {
  code: string;
  deviceName?: string;
  cloudUrl?: string;
}

/** Identity issued by `POST /sync/v1/activate`. */
export interface ActivationResponse {
  device_id: string;
  key_id: string;
  secret: string;
  school: { id: string; code?: string; name: string; timezone?: string };
  cloud_signing_key?: { key_id?: string; alg?: string; public_key: string };
  initial_cursor?: number;
  sync_interval_seconds?: number;
  restore_available?: boolean;
}

/** Result returned to the setup page. */
export interface ActivationResult {
  activated: true;
  cloud_url: string;
  device_id: string;
  device_name: string;
  school: { id: string; name: string };
  restore_available: boolean;
  sync_interval_seconds: number | null;
}

const DEFAULT_SYNC_INTERVAL_SECONDS = 900;

/**
 * Registers this server with the cloud using a one-time activation code
 * (API spec 13.3, US-1.2 and US-1.4). Activation is the only sync call that is
 * unsigned, so it is also the only one that works before the device secret
 * exists. Everything it stores afterwards lets later sync calls be signed.
 */
@Injectable()
export class ActivationService {
  private readonly logger = new Logger(ActivationService.name);

  constructor(
    @Inject(META_REPOSITORY) private readonly meta: MetaRepository,
    @Inject(DEVICE_SECRET_STORE) private readonly secrets: DeviceSecretStore,
    @Inject(ACTIVATION_HTTP) private readonly http: typeof fetch,
    @Inject(MACHINE_ID_HASH) private readonly machineId: () => string | null,
    private readonly config: SchoolConfigService,
  ) {}

  /** Whether this server already holds a device identity. */
  async isActivated(): Promise<boolean> {
    return Boolean(await this.meta.get(META_KEYS.deviceId));
  }

  /** Cloud URL in precedence order: explicit, stored, configured. */
  async resolveCloudUrl(override?: string): Promise<string | null> {
    const candidate =
      override ?? (await this.meta.get(META_KEYS.cloudUrl)) ?? this.config.cloudSyncUrl;
    if (!candidate) return null;
    return candidate.replace(/\/+$/, '');
  }

  async activate(input: ActivateInput): Promise<ActivationResult> {
    if (await this.isActivated()) {
      throw problem('CONFLICT', 'This server is already activated');
    }

    const cloudUrl = await this.resolveCloudUrl(input.cloudUrl);
    if (!cloudUrl) {
      throw problem(
        'CONFLICT',
        'No cloud URL is configured; set CLOUD_SYNC_URL or pass cloud_url with the activation code',
      );
    }

    const deviceName = input.deviceName ?? hostname();
    const response = await this.post(cloudUrl, input.code, deviceName);

    if (!response.ok) {
      const code = await activationErrorCode(response);
      throw problem(code, `Activation was rejected by ${cloudUrl} (HTTP ${response.status})`);
    }

    const issued = (await response.json().catch(() => null)) as ActivationResponse | null;
    if (!issued?.device_id || !issued.secret || !issued.school?.id) {
      throw problem('CONFLICT', `Malformed activation response from ${cloudUrl}`);
    }

    await this.persist(cloudUrl, issued);
    this.logger.log(`Activated as device ${issued.device_id} for school ${issued.school.name}`);

    return {
      activated: true,
      cloud_url: cloudUrl,
      device_id: issued.device_id,
      device_name: deviceName,
      school: { id: issued.school.id, name: issued.school.name },
      restore_available: issued.restore_available ?? false,
      sync_interval_seconds: issued.sync_interval_seconds ?? null,
    };
  }

  private async persist(cloudUrl: string, issued: ActivationResponse): Promise<void> {
    await this.meta.set(META_KEYS.cloudUrl, cloudUrl);
    await this.meta.set(META_KEYS.schoolId, issued.school.id);
    await this.meta.set(META_KEYS.schoolName, issued.school.name);
    await this.meta.set(META_KEYS.deviceId, issued.device_id);
    await this.meta.set(META_KEYS.deviceKeyId, issued.key_id);
    await this.meta.set(
      META_KEYS.syncIntervalSeconds,
      String(issued.sync_interval_seconds ?? DEFAULT_SYNC_INTERVAL_SECONDS),
    );
    if (issued.initial_cursor !== undefined) {
      await this.meta.set(META_KEYS.initialCursor, String(issued.initial_cursor));
    }
    if (issued.cloud_signing_key?.public_key) {
      await this.meta.set(META_KEYS.cloudPublicKey, issued.cloud_signing_key.public_key);
    }
    await this.secrets.save(issued.secret);
  }

  private async post(cloudUrl: string, code: string, deviceName: string): Promise<Response> {
    const machineId = this.machineId();
    const payload = {
      activation_code: code,
      device_name: deviceName,
      software_version: softwareVersion(),
      platform: platformInfo(),
      ...(machineId ? { machine_id_hash: machineId } : {}),
    };

    try {
      return await this.http(`${cloudUrl}/api/v1/sync/v1/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw problem('CONFLICT', `Could not reach the cloud at ${cloudUrl}: ${detail}`);
    }
  }
}

/**
 * Map a failed activation response onto a catalogue code. The cloud is expected
 * to return `{ "code": "ACTIVATION_CODE_INVALID" | ... }`; fall back to the HTTP
 * status when it does not (API spec 13.3).
 */
async function activationErrorCode(response: Response): Promise<ErrorCode> {
  let code: unknown;
  try {
    code = ((await response.json()) as { code?: unknown } | null)?.code;
  } catch {
    code = undefined;
  }
  if (typeof code === 'string' && isErrorCode(code)) return code;
  if (response.status === 404) return 'ACTIVATION_CODE_INVALID';
  if (response.status === 410) return 'ACTIVATION_CODE_USED';
  return 'CONFLICT';
}
