/**
 * IndexedDBStore tests — Wave A17-T18 (≥ 4 tests required).
 *
 * Uses `fake-indexeddb` (already a devDependency of @pryzm/persistence-client)
 * to provide a full in-memory IDB environment without a browser.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { IndexedDBStore } from '../src/IndexedDBStore.js';

describe('IndexedDBStore', () => {
  let store: IndexedDBStore;

  beforeEach(async () => {
    store = new IndexedDBStore();
    await store.init();
  });

  it('T1 — isAvailable returns false before any snapshot is saved', async () => {
    const result = await store.isAvailable('project-xyz');
    expect(result).toBe(false);
  });

  it('T2 — saveSnapshot + loadSnapshot round-trip', async () => {
    const snapshot = { elements: ['wall-1', 'wall-2'], version: 42 };
    await store.saveSnapshot('project-123', snapshot);
    const loaded = await store.loadSnapshot('project-123');
    expect(loaded).toEqual(snapshot);
  });

  it('T3 — isAvailable returns true after saveSnapshot', async () => {
    await store.saveSnapshot('project-abc', { data: 'test' });
    const available = await store.isAvailable('project-abc');
    expect(available).toBe(true);
  });

  it('T4 — loadSnapshot returns null for unknown projectId', async () => {
    const result = await store.loadSnapshot('does-not-exist');
    expect(result).toBeNull();
  });

  it('T5 — saveSnapshot overwrites previous snapshot for same projectId', async () => {
    await store.saveSnapshot('project-overwrite', { version: 1 });
    await store.saveSnapshot('project-overwrite', { version: 2 });
    const loaded = await store.loadSnapshot('project-overwrite');
    expect((loaded as { version: number }).version).toBe(2);
  });

  it('T6 — deleteSnapshot removes the record; isAvailable returns false after delete', async () => {
    await store.saveSnapshot('project-del', { data: 'to-delete' });
    expect(await store.isAvailable('project-del')).toBe(true);
    await store.deleteSnapshot('project-del');
    expect(await store.isAvailable('project-del')).toBe(false);
  });

  it('T7 — init() is idempotent — calling twice does not throw', async () => {
    await expect(store.init()).resolves.not.toThrow();
  });

  it('T8 — separate projectIds are stored independently', async () => {
    await store.saveSnapshot('proj-A', { name: 'Alpha' });
    await store.saveSnapshot('proj-B', { name: 'Beta' });
    expect(await store.loadSnapshot('proj-A')).toEqual({ name: 'Alpha' });
    expect(await store.loadSnapshot('proj-B')).toEqual({ name: 'Beta' });
  });
});
