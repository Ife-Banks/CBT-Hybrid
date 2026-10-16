import { Injectable } from '@nestjs/common';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

/** Persists built pack files. Abstract so it can be swapped for object storage. */
export abstract class PackStore {
  abstract save(storageKey: string, bytes: Uint8Array): Promise<void>;
  abstract read(storageKey: string): Promise<Uint8Array | null>;
  abstract delete(storageKey: string): Promise<void>;
}

/** Local filesystem implementation rooted at `PACK_STORAGE_DIR`. */
@Injectable()
export class LocalPackStore extends PackStore {
  private readonly baseDir: string;

  constructor() {
    super();
    this.baseDir = resolve(process.env.PACK_STORAGE_DIR ?? join(process.cwd(), 'storage', 'packs'));
  }

  async save(storageKey: string, bytes: Uint8Array): Promise<void> {
    const target = this.resolve(storageKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }

  async read(storageKey: string): Promise<Uint8Array | null> {
    try {
      return await readFile(this.resolve(storageKey));
    } catch {
      return null;
    }
  }

  async delete(storageKey: string): Promise<void> {
    await rm(this.resolve(storageKey), { force: true });
  }

  private resolve(storageKey: string): string {
    const target = resolve(this.baseDir, storageKey);
    if (target !== this.baseDir && !target.startsWith(this.baseDir + sep)) {
      throw new Error('Invalid pack storage key');
    }
    return target;
  }
}
