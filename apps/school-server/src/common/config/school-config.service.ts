import { Injectable } from '@nestjs/common';
import { join, resolve } from 'node:path';
import { EXAM_PACK_FOLDERS, SchoolEnv, loadSchoolEnv } from './school.config';

/** Placeholder secret used outside production when `TICKET_SIGNING_SECRET` is unset. */
const DEV_TICKET_SIGNING_SECRET = 'development-only-ticket-secret-do-not-use';

/** Typed access to school-server configuration and derived paths. */
@Injectable()
export class SchoolConfigService {
  private readonly env: SchoolEnv;

  constructor() {
    this.env = loadSchoolEnv(process.env);
  }

  get<K extends keyof SchoolEnv>(key: K): SchoolEnv[K] {
    return this.env[key];
  }

  /** Port to bind, preferring the local `SCHOOL_SERVER_PORT` override. */
  get port(): number {
    return this.env.SCHOOL_SERVER_PORT ?? this.env.PORT;
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  /**
   * Secret for signing login tickets. Falls back to a development-only value so
   * the server starts without configuration; production must set
   * `TICKET_SIGNING_SECRET`.
   */
  get ticketSigningSecret(): string {
    return this.env.TICKET_SIGNING_SECRET ?? DEV_TICKET_SIGNING_SECRET;
  }

  /** Absolute path of the data directory. */
  get dataDir(): string {
    return resolve(this.env.CBT_DATA_DIR);
  }

  /** Absolute path of the SQLite database file. */
  get dbPath(): string {
    return join(this.dataDir, 'school.db');
  }

  /** Absolute path of the exam-pack root. */
  get examPacksDir(): string {
    return join(this.dataDir, 'exam-packs');
  }

  /** Absolute paths of the four exam-pack folders. */
  get examPackFolders(): Record<(typeof EXAM_PACK_FOLDERS)[number], string> {
    return EXAM_PACK_FOLDERS.reduce(
      (folders, name) => {
        folders[name] = join(this.examPacksDir, name);
        return folders;
      },
      {} as Record<(typeof EXAM_PACK_FOLDERS)[number], string>,
    );
  }
}
