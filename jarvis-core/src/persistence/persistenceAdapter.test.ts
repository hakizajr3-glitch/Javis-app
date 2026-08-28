import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { InMemoryPersistence, JsonFilePersistence, RedisPersistence, SqlitePersistence } from './persistenceAdapter.js';

describe('InMemoryPersistence', () => {
  let adapter: InMemoryPersistence;

  beforeEach(() => {
    adapter = new InMemoryPersistence();
  });

  it('stores and retrieves values', async () => {
    await adapter.set('key1', { value: 42 });
    const result = await adapter.get('key1');
    expect(result).toEqual({ value: 42 });
  });

  it('returns null for missing keys', async () => {
    const result = await adapter.get('missing');
    expect(result).toBeNull();
  });

  it('deletes values', async () => {
    await adapter.set('delete-me', 'value');
    await adapter.delete('delete-me');
    expect(await adapter.get('delete-me')).toBeNull();
  });

  it('lists keys by prefix', async () => {
    await adapter.set('agent:run:1', 'a');
    await adapter.set('agent:run:2', 'b');
    await adapter.set('agent:instance:1', 'c');
    const keys = await adapter.keys('agent:run:');
    expect(keys.sort()).toEqual(['agent:run:1', 'agent:run:2']);
  });

  it('queries entries with limit and offset', async () => {
    await adapter.set('a', '1');
    await adapter.set('b', '2');
    await adapter.set('c', '3');
    const entries = await adapter.query({ limit: 2, offset: 0 });
    expect(entries).toHaveLength(2);
  });

  it('supports batch operations', async () => {
    await adapter.batchSet({ a: 1, b: 2 });
    const result = await adapter.batchGet(['a', 'b', 'missing']);
    expect(result).toEqual({ a: 1, b: 2 });
  });
});

describe('JsonFilePersistence', () => {
  let adapter: JsonFilePersistence;
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'jarvis-persist-'));
    adapter = new JsonFilePersistence({ filePath: join(dir, 'db.json') });
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it('persists values across reconnect', async () => {
    await adapter.set('run:1', { goal: 'deploy' });
    await adapter.disconnect();

    const reloaded = new JsonFilePersistence({ filePath: adapter['filePath'] });
    await reloaded.connect();
    const result = await reloaded.get('run:1');
    expect(result).toEqual({ goal: 'deploy' });
    await reloaded.disconnect();
  });

  it('returns null after delete', async () => {
    await adapter.set('key', 'value');
    await adapter.delete('key');
    expect(await adapter.get('key')).toBeNull();
  });
});

describe('RedisPersistence', () => {
  it('exposes the correct adapter name', () => {
    const adapter = new RedisPersistence({ host: 'localhost' });
    expect(adapter.name).toBe('redis');
  });
});

describe('SqlitePersistence', () => {
  let adapter: SqlitePersistence;
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'jarvis-sqlite-'));
    adapter = new SqlitePersistence({ filePath: join(dir, 'state.db') });
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it('stores and retrieves values', async () => {
    await adapter.set('mission:1', { status: 'running', progress: 42 });
    const result = await adapter.get('mission:1');
    expect(result).toEqual({ status: 'running', progress: 42 });
  });

  it('persists values across reconnect', async () => {
    await adapter.set('agent:dna', { role: 'architect', score: 0.94 });
    await adapter.disconnect();

    const reloaded = new SqlitePersistence({ filePath: join(dir, 'state.db') });
    await reloaded.connect();
    const result = await reloaded.get('agent:dna');
    expect(result).toEqual({ role: 'architect', score: 0.94 });
    await reloaded.disconnect();
  });

  it('deletes values durably', async () => {
    await adapter.set('temp', 'value');
    await adapter.delete('temp');
    expect(await adapter.get('temp')).toBeNull();
    expect(await adapter.has('temp')).toBe(false);
  });

  it('lists keys by prefix', async () => {
    await adapter.set('jarvis:skill:1', 'a');
    await adapter.set('jarvis:skill:2', 'b');
    await adapter.set('jarvis:agent:1', 'c');
    const keys = await adapter.keys('jarvis:skill:');
    expect(keys.sort()).toEqual(['jarvis:skill:1', 'jarvis:skill:2']);
  });

  it('queries entries with limit and offset', async () => {
    await adapter.set('e1', '1');
    await adapter.set('e2', '2');
    await adapter.set('e3', '3');
    const entries = await adapter.query({ limit: 2, offset: 0 });
    expect(entries).toHaveLength(2);
  });

  it('supports batch operations', async () => {
    await adapter.batchSet({ x: 1, y: 2 });
    const result = await adapter.batchGet(['x', 'y', 'missing']);
    expect(result).toEqual({ x: 1, y: 2 });
  });
});
