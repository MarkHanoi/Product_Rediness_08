import { describe, it, expect, vi } from 'vitest';
import { createSketchDocStore } from '../../src/stores/sketchDocStore.js';

describe('sketchDocStore — S52 D1', () => {
  it('starts empty with version 0', () => {
    const store = createSketchDocStore();
    expect(store.get().entities).toEqual([]);
    expect(store.get().version).toBe(0);
  });

  it('addPoint creates a unique id and bumps the version', () => {
    const store = createSketchDocStore();
    const id1 = store.addPoint(10, 20);
    const id2 = store.addPoint(30, 40);
    expect(id1).not.toBe(id2);
    expect(store.get().pointById[id1]).toMatchObject({ x: 10, z: 20 });
    expect(store.get().pointById[id2]).toMatchObject({ x: 30, z: 40 });
    expect(store.get().version).toBe(2);
  });

  it('addLineByPoints requires both points to exist', () => {
    const store = createSketchDocStore();
    const a = store.addPoint(0, 0);
    expect(() => store.addLineByPoints(a, 'pt-zz' as never)).toThrow(/unknown point id/);
  });

  it('addLineByPoints rejects identical endpoints', () => {
    const store = createSketchDocStore();
    const a = store.addPoint(0, 0);
    expect(() => store.addLineByPoints(a, a)).toThrow(/endpoints must differ/);
  });

  it('addLineByPoints links existing points by id', () => {
    const store = createSketchDocStore();
    const a = store.addPoint(0, 0);
    const b = store.addPoint(100, 0);
    const lineId = store.addLineByPoints(a, b);
    const ln = store.get().lineById[lineId];
    expect(ln).toMatchObject({ kind: 'line', p1: a, p2: b });
  });

  it('addLineByCoords creates two points + one line in a single tick', () => {
    const store = createSketchDocStore();
    const lineId = store.addLineByCoords(0, 0, 100, 50);
    const snap = store.get();
    expect(Object.values(snap.pointById)).toHaveLength(2);
    expect(Object.values(snap.lineById)).toHaveLength(1);
    expect(snap.version).toBe(1);
    const line = snap.lineById[lineId]!;
    const p1 = snap.pointById[line.p1]!;
    const p2 = snap.pointById[line.p2]!;
    expect([p1, p2].map((p) => `${p.x},${p.z}`).sort()).toEqual(['0,0', '100,50']);
  });

  it('addPoint rejects non-finite coordinates', () => {
    const store = createSketchDocStore();
    expect(() => store.addPoint(Number.NaN, 0)).toThrow(/non-finite/);
    expect(() => store.addPoint(0, Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
  });

  it('removeEntity drops a single point', () => {
    const store = createSketchDocStore();
    const id = store.addPoint(0, 0);
    store.removeEntity(id);
    expect(store.get().pointById[id]).toBeUndefined();
  });

  it('removeEntity cascades to lines that reference the removed point', () => {
    const store = createSketchDocStore();
    const lineId = store.addLineByCoords(0, 0, 100, 0);
    const ln = store.get().lineById[lineId]!;
    store.removeEntity(ln.p1);
    expect(store.get().lineById[lineId]).toBeUndefined();
    expect(store.get().pointById[ln.p1]).toBeUndefined();
    // p2 survives — it was only referenced by the removed line.
    expect(store.get().pointById[ln.p2]).toBeDefined();
  });

  it('removeEntity is a no-op for unknown ids', () => {
    const store = createSketchDocStore();
    const v0 = store.get().version;
    store.removeEntity('pt-xyz' as never);
    expect(store.get().version).toBe(v0);
  });

  it('clear empties the store', () => {
    const store = createSketchDocStore();
    store.addLineByCoords(0, 0, 100, 0);
    store.clear();
    expect(store.get().entities).toEqual([]);
    expect(store.get().version).toBe(2);
  });

  it('subscribe/unsubscribe lifecycle', () => {
    const store = createSketchDocStore();
    const sub = vi.fn();
    const unsub = store.subscribe(sub);
    store.addPoint(0, 0);
    expect(sub).toHaveBeenCalledTimes(1);
    unsub();
    store.addPoint(1, 1);
    expect(sub).toHaveBeenCalledTimes(1);
  });

  it('snapshots are frozen', () => {
    const store = createSketchDocStore();
    store.addPoint(0, 0);
    expect(Object.isFrozen(store.get())).toBe(true);
    expect(Object.isFrozen(store.get().entities)).toBe(true);
    expect(Object.isFrozen(store.get().pointById)).toBe(true);
    expect(Object.isFrozen(store.get().lineById)).toBe(true);
  });

  it('source file does not import THREE or use window-as-any', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const raw = await fs.readFile(path.join(here, '../../src/stores/sketchDocStore.ts'), 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    expect(code).not.toMatch(/from ['"]three['"]/);
    expect(code).not.toMatch(/window\s+as\s+any/);
    expect(code).not.toMatch(/requestAnimationFrame/);
  });
});
