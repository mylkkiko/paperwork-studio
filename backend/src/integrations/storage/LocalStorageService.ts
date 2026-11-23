import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { StorageService } from './StorageService';

export class LocalStorageService implements StorageService {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = resolve(rootDir);
  }

  /** Resolve a key inside the root; rejects "../" escapes. */
  private path(key: string) {
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new Error(`Invalid storage key: ${key}`);
    return full;
  }

  async put(key: string, data: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  }

  async get(key: string) {
    return readFile(this.path(key));
  }

  async exists(key: string) {
    try {
      await stat(this.path(key));
      return true;
    } catch {
      return false;
    }
  }

  async remove(key: string) {
    await rm(this.path(key), { force: true, recursive: true });
  }
}
