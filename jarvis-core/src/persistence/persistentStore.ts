/**
 * PersistentStore — layer-4 persistence for jarvis-core.
 *
 * Backends, selected automatically at init() time:
 *   1. Node 22+: node:sqlite (DatabaseSync) for real SQLite persistence
 *   2. Node fallback: JSON file on disk (node:fs/promises)
 *   3. Browser (Vite/Tauri WebView): localStorage
 *   4. Last resort: in-memory Map
 *
 * The API is async so callers never need to know which backend is active.
 * Browser builds never load the node: imports — they are guarded dynamic
 * imports marked with @vite-ignore, so Vite leaves them as runtime imports
 * that fail harmlessly and fall through to localStorage.
 */

export type BackendKind = 'sqlite' | 'json' | 'localstorage' | 'memory';

export interface PersistenceBackend {
  readonly kind: BackendKind;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

class MemoryBackend implements PersistenceBackend {
  readonly kind: BackendKind = 'memory';
  private store = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.store.delete(key);
  }
}

class LocalStorageBackend implements PersistenceBackend {
  readonly kind: BackendKind = 'localstorage';

  private ls(): any | null {
    try {
      const ls = (globalThis as any).localStorage;
      return ls ?? null;
    } catch {
      return null;
    }
  }

  async getItem(key: string): Promise<string | null> {
    const ls = this.ls();
    if (!ls) return null;
    return ls.getItem(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    const ls = this.ls();
    if (!ls) return;
    ls.setItem(key, value);
  }

  async removeItem(key: string): Promise<void> {
    const ls = this.ls();
    if (!ls) return;
    ls.removeItem(key);
  }
}

class JsonFileBackend implements PersistenceBackend {
  readonly kind: BackendKind = 'json';
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async getItem(key: string): Promise<string | null> {
    // @ts-ignore — node:fs/promises only exists in Node; guarded for browsers
    const fs = await import(/* @vite-ignore */ 'node:fs/promises');
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const data = JSON.parse(raw);
      return data[key] ?? null;
    } catch {
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    // @ts-ignore — node:fs/promises only exists in Node; guarded for browsers
    const fs = await import(/* @vite-ignore */ 'node:fs/promises');
    let data: Record<string, string> = {};
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      data = JSON.parse(raw);
    } catch {
      // file does not exist yet — start fresh
    }
    data[key] = value;
    await fs.mkdir(this.filePath.split('/').slice(0, -1).join('/') || '.', { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async removeItem(key: string): Promise<void> {
    // @ts-ignore — node:fs/promises only exists in Node; guarded for browsers
    const fs = await import(/* @vite-ignore */ 'node:fs/promises');
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const data = JSON.parse(raw);
      delete data[key];
      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // nothing to remove
    }
  }
}

class SQLiteBackend implements PersistenceBackend {
  readonly kind: BackendKind = 'sqlite';
  private db: any = null;
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private async ensureDb(): Promise<any> {
    if (this.db) return this.db;
    // @ts-ignore — node:sqlite only exists in Node 22+; guarded for browsers
    const sqlite = await import(/* @vite-ignore */ 'node:sqlite');
    const { DatabaseSync } = sqlite;
    this.db = new DatabaseSync(this.filePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    return this.db;
  }

  async getItem(key: string): Promise<string | null> {
    const db = await this.ensureDb();
    const row = db.prepare('SELECT value FROM kv_store WHERE key = ?').get(key);
    return row?.value ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    const db = await this.ensureDb();
    db.prepare(`
      INSERT INTO kv_store (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value, Date.now());
  }

  async removeItem(key: string): Promise<void> {
    const db = await this.ensureDb();
    db.prepare('DELETE FROM kv_store WHERE key = ?').run(key);
  }
}

export class PersistentStore {
  private backend: PersistenceBackend = new MemoryBackend();
  private initialized = false;

  /** Detect and activate the best available backend for this runtime. */
  async init(options?: { sqlitePath?: string; jsonPath?: string }): Promise<void> {
    if (this.initialized) return;

    // 1) Node 22+ with node:sqlite
    try {
      // @ts-ignore — dynamic import; fails in browsers by design
      const sqlite = await import(/* @vite-ignore */ 'node:sqlite');
      if (sqlite && typeof sqlite.DatabaseSync === 'function') {
        this.backend = new SQLiteBackend(options?.sqlitePath ?? ':memory:');
        this.initialized = true;
        return;
      }
    } catch {
      // not available — fall through
    }

    // 2) Node fallback — JSON file (requires a path to be meaningful)
    if (options?.jsonPath) {
      try {
        // @ts-ignore — node:fs/promises; fails in browsers by design
        await import(/* @vite-ignore */ 'node:fs/promises');
        this.backend = new JsonFileBackend(options.jsonPath);
        this.initialized = true;
        return;
      } catch {
        // fall through to localStorage
      }
    }

    // 3) Browser — localStorage
    try {
      const ls = (globalThis as any).localStorage;
      if (ls) {
        this.backend = new LocalStorageBackend();
        this.initialized = true;
        return;
      }
    } catch {
      // fall through to memory
    }

    // 4) In-memory fallback
    this.backend = new MemoryBackend();
    this.initialized = true;
  }

  getKind(): BackendKind {
    return this.backend.kind;
  }

  /** Persist a JSON-serializable snapshot under a namespace key. */
  async saveSnapshot(namespace: string, data: unknown): Promise<void> {
    // Ensure a backend is active — callers may fire-and-forget before init.
    await this.init();
    await this.backend.setItem(`snapshot:${namespace}`, JSON.stringify(data));
  }

  /** Load a previously persisted snapshot, or null when absent/corrupt. */
  async loadSnapshot<T>(namespace: string): Promise<T | null> {
    // Ensure a backend is active before reading (init is idempotent).
    await this.init();
    try {
      const raw = await this.backend.getItem(`snapshot:${namespace}`);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async clearSnapshot(namespace: string): Promise<void> {
    await this.backend.removeItem(`snapshot:${namespace}`);
  }
}

// Singleton instance
export const persistentStore = new PersistentStore();
