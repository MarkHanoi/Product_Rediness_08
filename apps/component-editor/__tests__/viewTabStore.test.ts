import { describe, it, expect, vi } from 'vitest';
import {
  createViewTabStore,
  type ViewTab,
  type ViewTabSnapshot,
} from '../src/stores/viewTabStore.js';

describe('viewTabStore — S52 D1', () => {
  it('starts with the sketch tab by default', () => {
    const store = createViewTabStore();
    expect(store.get().active).toBe('sketch');
    expect(store.get().version).toBe(0);
  });

  it('starts with the supplied initial tab', () => {
    const store = createViewTabStore('3d');
    expect(store.get().active).toBe('3d');
    expect(store.get().version).toBe(0);
  });

  it('rejects an invalid initial tab', () => {
    expect(() => createViewTabStore('xyz' as ViewTab)).toThrow(/invalid initial tab/);
  });

  it('returns frozen snapshots', () => {
    const store = createViewTabStore();
    expect(Object.isFrozen(store.get())).toBe(true);
  });

  it('switches tabs and bumps the version on each transition', () => {
    const store = createViewTabStore();
    store.setActive('3d');
    expect(store.get().active).toBe('3d');
    expect(store.get().version).toBe(1);
    store.setActive('parameters');
    expect(store.get().active).toBe('parameters');
    expect(store.get().version).toBe(2);
  });

  it('is idempotent — setting the active tab to its current value is a no-op', () => {
    const store = createViewTabStore('3d');
    const sub = vi.fn();
    store.subscribe(sub);
    store.setActive('3d');
    expect(sub).not.toHaveBeenCalled();
    expect(store.get().version).toBe(0);
  });

  it('rejects an invalid tab on setActive', () => {
    const store = createViewTabStore();
    expect(() => store.setActive('xyz' as ViewTab)).toThrow(/invalid tab/);
  });

  it('notifies subscribers on every transition with the new snapshot', () => {
    const store = createViewTabStore();
    const seen: ViewTabSnapshot[] = [];
    store.subscribe((s) => seen.push(s));
    store.setActive('3d');
    store.setActive('parameters');
    store.setActive('sketch');
    expect(seen).toHaveLength(3);
    expect(seen[0]?.active).toBe('3d');
    expect(seen[1]?.active).toBe('parameters');
    expect(seen[2]?.active).toBe('sketch');
    expect(seen.map((s) => s.version)).toEqual([1, 2, 3]);
  });

  it('unsubscribe stops notifications', () => {
    const store = createViewTabStore();
    const sub = vi.fn();
    const unsub = store.subscribe(sub);
    store.setActive('3d');
    expect(sub).toHaveBeenCalledTimes(1);
    unsub();
    store.setActive('parameters');
    expect(sub).toHaveBeenCalledTimes(1);
  });

  it('multiple subscribers all receive notifications', () => {
    const store = createViewTabStore();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    store.setActive('3d');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('does not import THREE or use window/rAF (rules P2/P3/P6)', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const raw = await fs.readFile(path.join(here, '../src/stores/viewTabStore.ts'), 'utf8');
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    expect(code).not.toMatch(/from ['"]three['"]/);
    expect(code).not.toMatch(/requestAnimationFrame/);
    expect(code).not.toMatch(/window\s+as\s+any/);
  });
});
