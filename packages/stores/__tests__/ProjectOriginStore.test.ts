import { describe, it, expect } from 'vitest';
import { ProjectOriginStore, PROJECT_ORIGIN_ID } from '../src/ProjectOriginStore.js';

describe('§FEAT-PROJECT-ORIGIN (L-109) — ProjectOriginStore', () => {
  it('seeds exactly one singleton at world origin, visible, with the fixed id', () => {
    const store = new ProjectOriginStore();
    const o = store.getOrigin();
    expect(o.id).toBe(PROJECT_ORIGIN_ID);
    expect(o.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(o.visible).toBe(true);
    // Singleton invariant — getAll() is always a one-element array.
    expect(store.getAll()).toHaveLength(1);
    expect(store.getAll()[0].name).toBe('Project Base Point');
  });

  it('repositions the shared-coordinate datum and notifies subscribers', () => {
    const store = new ProjectOriginStore();
    let fired = 0;
    store.subscribe(() => { fired += 1; });
    store.setPosition({ x: 10, y: 0, z: -5 });
    expect(store.getOrigin().position).toEqual({ x: 10, y: 0, z: -5 });
    expect(fired).toBe(1);
    // Still a singleton after mutation.
    expect(store.getAll()).toHaveLength(1);
    expect(store.getOrigin().id).toBe(PROJECT_ORIGIN_ID);
  });

  it('toggles View-Intent visibility (idempotent, notifies on change only)', () => {
    const store = new ProjectOriginStore();
    let fired = 0;
    store.subscribe(() => { fired += 1; });
    store.setVisible(false);
    expect(store.isVisible()).toBe(false);
    store.setVisible(false); // no-op — same value
    expect(fired).toBe(1);
    store.setVisible(true);
    expect(store.isVisible()).toBe(true);
    expect(fired).toBe(2);
  });

  it('serialize → deserialize round-trips the datum (and keeps the fixed id)', () => {
    const store = new ProjectOriginStore();
    store.setPosition({ x: 3, y: 0, z: 7 });
    store.setVisible(false);
    const snap = store.serialize();

    const restored = new ProjectOriginStore();
    restored.deserialize(snap);
    expect(restored.getOrigin().position).toEqual({ x: 3, y: 0, z: 7 });
    expect(restored.isVisible()).toBe(false);
    expect(restored.getOrigin().id).toBe(PROJECT_ORIGIN_ID);
  });

  it('reset() re-seeds the singleton at world origin (datum always exists)', () => {
    const store = new ProjectOriginStore();
    store.setPosition({ x: 99, y: 0, z: 99 });
    store.reset();
    expect(store.getOrigin().position).toEqual({ x: 0, y: 0, z: 0 });
    expect(store.getAll()).toHaveLength(1);
  });

  it('deserialize with garbage falls back to the default origin', () => {
    const store = new ProjectOriginStore();
    store.deserialize('not-an-object');
    expect(store.getOrigin().position).toEqual({ x: 0, y: 0, z: 0 });
    expect(store.getOrigin().id).toBe(PROJECT_ORIGIN_ID);
  });
});
