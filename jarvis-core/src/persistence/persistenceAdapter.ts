import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import Database from 'better-sqlite3';
import { PersistenceAdapter, PersistenceEntry, PersistenceQuery } from './types.js';

export class SqlitePersistence implements PersistenceAdapter {
  readonly name = 'sqlite';
  private db: Database.Database | null = null;
  private filePath: string;
  private autoSaveTimer?: NodeJS.Timeout;
  private dirty = false;
  private pendingWrites = new Map<string, { value: string; createdAt: string; updatedAt: string }>();

  constructor(options: { filePath: string }) {
    this.filePath = resolve(options.filePath);
  }

  async connect(): Promise<void> {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    this.db = new Database(this.filePath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS persistence (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    this.autoSaveTimer = setInterval(() => {
      if (this.dirty) {
        this.flush().catch(err => console.error('[SqlitePersistence] auto-save failed:', err));
      }
    }, 5000);
  }

  async disconnect(): Promise<void> {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }
    if (this.dirty) {
      await this.flush();
    }
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.db) throw new Error('[SqlitePersistence] not connected');
    const pending = this.pendingWrites.get(key);
    if (pending) return JSON.parse(pending.value) as T;
    const row = this.db.prepare('SELECT value FROM persistence WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const now = new Date().toISOString();
    const serialized = JSON.stringify(value);
    const existing = this.db?.prepare('SELECT created_at FROM persistence WHERE key = ?').get(key) as { created_at: string } | undefined;
    this.pendingWrites.set(key, {
      value: serialized,
      createdAt: existing?.created_at || now,
      updatedAt: now,
    });
    this.dirty = true;
  }

  async delete(key: string): Promise<void> {
    this.pendingWrites.delete(key);
    if (this.db) {
      this.db.prepare('DELETE FROM persistence WHERE key = ?').run(key);
    }
    this.dirty = true;
  }

  async has(key: string): Promise<boolean> {
    if (this.pendingWrites.has(key)) return true;
    if (!this.db) throw new Error('[SqlitePersistence] not connected');
    return !!this.db.prepare('SELECT 1 FROM persistence WHERE key = ?').get(key);
  }

  async keys(prefix?: string): Promise<string[]> {
    if (!this.db) throw new Error('[SqlitePersistence] not connected');
    const pattern = prefix ? `${prefix}%` : '%';
    const rows = this.db.prepare('SELECT key FROM persistence WHERE key LIKE ?').all(pattern) as { key: string }[];
    const keys = rows.map(r => r.key);
    for (const key of this.pendingWrites.keys()) {
      if ((!prefix || key.startsWith(prefix)) && !keys.includes(key)) keys.push(key);
    }
    return keys;
  }

  async query(query: PersistenceQuery): Promise<PersistenceEntry[]> {
    if (!this.db) throw new Error('[SqlitePersistence] not connected');
    const pattern = query.prefix ? `${query.prefix}%` : '%';
    const rows = this.db.prepare('SELECT key, value, created_at, updated_at FROM persistence WHERE key LIKE ? ORDER BY updated_at DESC').all(pattern) as Array<{
      key: string; value: string; created_at: string; updated_at: string;
    }>;
    const entries: PersistenceEntry[] = rows.map(r => ({
      key: r.key,
      value: JSON.parse(r.value),
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at),
    }));
    for (const [key, pending] of this.pendingWrites.entries()) {
      if ((!query.prefix || key.startsWith(query.prefix)) && !entries.find(e => e.key === key)) {
        entries.unshift({
          key,
          value: JSON.parse(pending.value),
          createdAt: new Date(pending.createdAt),
          updatedAt: new Date(pending.updatedAt),
        });
      }
    }
    const offset = query.offset || 0;
    const limit = query.limit ?? entries.length;
    return entries.slice(offset, offset + limit);
  }

  async batchGet(keys: string[]): Promise<Record<string, any>> {
    const result: Record<string, any> = {};
    for (const key of keys) {
      const value = await this.get(key);
      if (value !== null) result[key] = value;
    }
    return result;
  }

  async batchSet(entries: Record<string, any>): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
      await this.set(key, value);
    }
  }

  private async flush(): Promise<void> {
    if (!this.db || this.pendingWrites.size === 0) {
      this.dirty = false;
      return;
    }
    const insert = this.db.prepare(`
      INSERT INTO persistence (key, value, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    const transaction = this.db.transaction((writes: Map<string, { value: string; createdAt: string; updatedAt: string }>) => {
      for (const [key, w] of writes.entries()) {
        insert.run(key, w.value, w.createdAt, w.updatedAt);
      }
    });
    transaction(this.pendingWrites);
    this.pendingWrites.clear();
    this.dirty = false;
  }
}

export class InMemoryPersistence implements PersistenceAdapter {
  readonly name = 'in-memory';
  private data = new Map<string, any>();
  private metadata = new Map<string, { createdAt: Date; updatedAt: Date }>();

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async get<T>(key: string): Promise<T | null> {
    return this.data.has(key) ? (this.data.get(key) as T) : null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const now = new Date();
    this.data.set(key, value);
    if (!this.metadata.has(key)) {
      this.metadata.set(key, { createdAt: now, updatedAt: now });
    } else {
      const meta = this.metadata.get(key)!;
      meta.updatedAt = now;
    }
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
    this.metadata.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.data.has(key);
  }

  async keys(prefix?: string): Promise<string[]> {
    const all = Array.from(this.data.keys());
    return prefix ? all.filter(k => k.startsWith(prefix)) : all;
  }

  async query(query: PersistenceQuery): Promise<PersistenceEntry[]> {
    let entries = Array.from(this.data.entries()).map(([key, value]) => ({
      key,
      value,
      ...this.metadata.get(key),
    }));

    if (query.prefix) {
      entries = entries.filter(e => e.key.startsWith(query.prefix!));
    }

    // Simple in-memory ordering by updatedAt desc
    entries.sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0));

    const offset = query.offset || 0;
    const limit = query.limit ?? entries.length;
    return entries.slice(offset, offset + limit);
  }

  async batchGet(keys: string[]): Promise<Record<string, any>> {
    const result: Record<string, any> = {};
    for (const key of keys) {
      if (this.data.has(key)) {
        result[key] = this.data.get(key);
      }
    }
    return result;
  }

  async batchSet(entries: Record<string, any>): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
      await this.set(key, value);
    }
  }
}

export interface JsonFilePersistenceOptions {
  filePath: string;
  autoSave?: boolean;
  autoSaveIntervalMs?: number;
}

export class JsonFilePersistence implements PersistenceAdapter {
  readonly name = 'json-file';
  private data = new Map<string, any>();
  private metadata = new Map<string, { createdAt: Date; updatedAt: Date }>();
  private filePath: string;
  private autoSaveTimer?: NodeJS.Timeout;
  private dirty = false;

  constructor(options: JsonFilePersistenceOptions) {
    this.filePath = resolve(options.filePath);
  }

  async connect(): Promise<void> {
    await this.load();
    this.autoSaveTimer = setInterval(() => {
      if (this.dirty) {
        this.save().catch(err => console.error('[JsonFilePersistence] auto-save failed:', err));
      }
    }, 5000);
  }

  async disconnect(): Promise<void> {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }
    if (this.dirty) {
      await this.save();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    return this.data.has(key) ? (this.data.get(key) as T) : null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const now = new Date();
    this.data.set(key, value);
    if (!this.metadata.has(key)) {
      this.metadata.set(key, { createdAt: now, updatedAt: now });
    } else {
      const meta = this.metadata.get(key)!;
      meta.updatedAt = now;
    }
    this.dirty = true;
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
    this.metadata.delete(key);
    this.dirty = true;
  }

  async has(key: string): Promise<boolean> {
    return this.data.has(key);
  }

  async keys(prefix?: string): Promise<string[]> {
    const all = Array.from(this.data.keys());
    return prefix ? all.filter(k => k.startsWith(prefix)) : all;
  }

  async query(query: PersistenceQuery): Promise<PersistenceEntry[]> {
    let entries = Array.from(this.data.entries()).map(([key, value]) => ({
      key,
      value,
      ...this.metadata.get(key),
    }));

    if (query.prefix) {
      entries = entries.filter(e => e.key.startsWith(query.prefix!));
    }

    entries.sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0));

    const offset = query.offset || 0;
    const limit = query.limit ?? entries.length;
    return entries.slice(offset, offset + limit);
  }

  async batchGet(keys: string[]): Promise<Record<string, any>> {
    const result: Record<string, any> = {};
    for (const key of keys) {
      if (this.data.has(key)) {
        result[key] = this.data.get(key);
      }
    }
    return result;
  }

  async batchSet(entries: Record<string, any>): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
      await this.set(key, value);
    }
  }

  private async load(): Promise<void> {
    try {
      if (!existsSync(this.filePath)) {
        return;
      }
      const raw = await readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      this.data = new Map(Object.entries(parsed.data || {}));
      this.metadata = new Map(
        Object.entries(parsed.metadata || {}).map(([k, v]: [string, any]) => [
          k,
          { createdAt: new Date(v.createdAt), updatedAt: new Date(v.updatedAt) },
        ])
      );
    } catch (error) {
      console.error('[JsonFilePersistence] load failed:', error);
      this.data = new Map();
      this.metadata = new Map();
    }
  }

  private async save(): Promise<void> {
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      const payload = {
        data: Object.fromEntries(this.data),
        metadata: Object.fromEntries(
          Array.from(this.metadata.entries()).map(([k, v]) => [
            k,
            { createdAt: v.createdAt.toISOString(), updatedAt: v.updatedAt.toISOString() },
          ])
        ),
      };
      await writeFile(this.filePath, JSON.stringify(payload, null, 2), 'utf-8');
      this.dirty = false;
    } catch (error) {
      console.error('[JsonFilePersistence] save failed:', error);
      throw error;
    }
  }
}

export interface RedisPersistenceOptions {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  tls?: boolean;
}

export class RedisPersistence implements PersistenceAdapter {
  readonly name = 'redis';
  private redis: any;
  private options: RedisPersistenceOptions;
  private connected = false;

  constructor(options: RedisPersistenceOptions = {}) {
    this.options = options;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      const { Redis } = await import('ioredis');
      this.redis = new Redis({
        host: this.options.host || 'localhost',
        port: this.options.port || 6379,
        password: this.options.password,
        db: this.options.db || 0,
        tls: this.options.tls ? {} : undefined,
        lazyConnect: true,
      });
      await this.redis.connect();
      this.connected = true;
    } catch (error) {
      console.error('[RedisPersistence] failed to connect:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.redis && this.connected) {
      await this.redis.quit();
      this.connected = false;
    }
  }

  private prefixKey(key: string): string {
    return this.options.keyPrefix ? `${this.options.keyPrefix}${key}` : key;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(this.prefixKey(key));
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw as T;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const serialized = JSON.stringify(value);
    await this.redis.set(this.prefixKey(key), serialized);
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.prefixKey(key));
  }

  async has(key: string): Promise<boolean> {
    const result = await this.redis.exists(this.prefixKey(key));
    return result === 1;
  }

  async keys(prefix?: string): Promise<string[]> {
    const pattern = this.prefixKey(prefix || '*');
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, batch] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');
    const strip = this.options.keyPrefix || '';
    return keys.map(k => (strip ? k.replace(strip, '') : k));
  }

  async query(query: PersistenceQuery): Promise<PersistenceEntry[]> {
    const pattern = this.prefixKey(query.prefix || '*');
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, batch] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');

    const entries: PersistenceEntry[] = [];
    for (const fullKey of keys) {
      const raw = await this.redis.get(fullKey);
      const key = this.options.keyPrefix ? fullKey.replace(this.options.keyPrefix, '') : fullKey;
      entries.push({
        key,
        value: raw ? JSON.parse(raw) : null,
      });
    }

    const offset = query.offset || 0;
    const limit = query.limit ?? entries.length;
    return entries.slice(offset, offset + limit);
  }

  async batchGet(keys: string[]): Promise<Record<string, any>> {
    if (keys.length === 0) return {};
    const prefixed = keys.map(k => this.prefixKey(k));
    const values = await this.redis.mget(...prefixed);
    const result: Record<string, any> = {};
    keys.forEach((key, index) => {
      const value = values[index];
      if (value !== null) {
        try {
          result[key] = JSON.parse(value);
        } catch {
          result[key] = value;
        }
      }
    });
    return result;
  }

  async batchSet(entries: Record<string, any>): Promise<void> {
    const pipeline = this.redis.pipeline();
    for (const [key, value] of Object.entries(entries)) {
      pipeline.set(this.prefixKey(key), JSON.stringify(value));
    }
    await pipeline.exec();
  }
}

export class PersistenceManager {
  private adapter: PersistenceAdapter;

  constructor(adapter?: PersistenceAdapter) {
    this.adapter = adapter || new InMemoryPersistence();
  }

  setAdapter(adapter: PersistenceAdapter): void {
    this.adapter = adapter;
  }

  getAdapter(): PersistenceAdapter {
    return this.adapter;
  }

  async connect(): Promise<void> {
    await this.adapter.connect();
  }

  async disconnect(): Promise<void> {
    await this.adapter.disconnect();
  }
}

export const persistenceManager = new PersistenceManager();
