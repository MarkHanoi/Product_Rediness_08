// W5-4 / LEG B — PROBE: does a remote change reach the RECEIVER'S AUTHORITATIVE
// STORE, i.e. the object the renderer consults — not the Y.Map we just wrote?
//
// ─── WHY THIS PROBE IS SHAPED THIS WAY ───────────────────────────────────────
//
// The W5-3 probe (`property-mutation-sync.test.ts`) proved leg (a): the property
// ARRIVES IN DOCUMENT B's Y.Doc.  That is not the user-visible invariant.  A
// receiving client renders from its LOCAL STORES, and nothing read the CRDT
// document back into them — zero `.observe` calls existed on ELEMENTS_NAMESPACE.
// So B's document was correct and B's screen was wrong, indefinitely.
//
// The single most important property of this probe is that the STALE READ AND
// THE FAILED READ ARE DIFFERENT VALUES.  `FakeAuthoritativeStore` is SEEDED with
// the creation-time height (3.0) exactly as a real store is, because that is the
// observed defect: when sync was broken the receiver reported `3`, confidently,
// not `undefined`.  A probe that asserted `toBeDefined()` would have PASSED
// against the broken code.  Every assertion below therefore names the value.
//
// The store stands in for wallStore/slabStore/…: sync-client is L3 and must not
// import a store, so the reader emits `RemoteElementUpdate` and an L7 sink
// applies it.  The sink here is the test's; the editor's real sink dispatches
// `element.updateParameters` through the command bus (P6).  THAT half is
// UNPROVEN without a browser and is reported as such — this file proves the
// reader, the origin filter, the echo break and the counters, nothing more.

import { describe, it, expect } from 'vitest';
import { YjsDocAdapter } from '../src/YjsDocAdapter.js';
import { ElementSyncReader, type RemoteElementUpdate } from '../src/elementSyncReader.js';

/** Sync every op from `from` into `to` — what a websocket transport does. */
function syncAtoB(from: YjsDocAdapter, to: YjsDocAdapter): void {
  to.applyUpdate(from.encodeStateAsUpdate());
}

/**
 * Stand-in for the local authoritative store the renderer consults.
 *
 * Seeded at construction with the creation-time values, so that "the update
 * never arrived" reads as the OLD NUMBER and never as `undefined`.
 */
class FakeAuthoritativeStore {
  private readonly rows = new Map<string, Record<string, unknown>>();
  /** How many times the renderer would have been asked to redraw an element. */
  readonly repaints: string[] = [];

  seed(id: string, props: Record<string, unknown>): void {
    this.rows.set(id, { ...props });
  }

  get(id: string): Record<string, unknown> | undefined {
    const r = this.rows.get(id);
    return r ? { ...r } : undefined;
  }

  read(id: string, prop: string): unknown {
    return this.rows.get(id)?.[prop];
  }

  /** The sink an L7 host supplies; a real one dispatches a bus command. */
  apply = (u: RemoteElementUpdate): void => {
    const row = this.rows.get(u.elementId) ?? {};
    Object.assign(row, u.properties);
    this.rows.set(u.elementId, row);
    this.repaints.push(u.elementId);
  };
}

describe('LEG B — a remote property change must reach the receiver\'s store', () => {
  it('PROBE: A raises a wall to 5 m; B\'s STORE must hold 5, not the stale 3', () => {
    const a = new YjsDocAdapter('proj-legb');
    const b = new YjsDocAdapter('proj-legb');

    const bStore = new FakeAuthoritativeStore();
    const reader = new ElementSyncReader(b, bStore.apply);

    // B already knows the wall at its CREATION height, exactly as a real client
    // does after loading the project snapshot.
    bStore.seed('wall-1', { height: 3.0, thickness: 0.2 });
    expect(bStore.read('wall-1', 'height')).toBe(3.0);

    // A edits through the REAL property verb with the REAL payload shape.
    a.applyCommand('wall.create', { id: 'wall-1', levelId: 'L1', height: 3.0, thickness: 0.2 });
    a.applyCommand('wall.updateDimensions', { wallId: 'wall-1', height: 5.0 });
    syncAtoB(a, b);

    // ── THE INVARIANT ────────────────────────────────────────────────────────
    // Read the RECEIVER'S STORE.  `toBe(5.0)` — never `toBeDefined()`: the
    // broken path yields 3.0, which is defined, and is the whole bug.
    expect(bStore.read('wall-1', 'height')).toBe(5.0);
    // And the renderer was told, at least once, that this element changed.
    expect(bStore.repaints).toContain('wall-1');
    // Thickness was not part of the update and must survive untouched.
    expect(bStore.read('wall-1', 'thickness')).toBe(0.2);

    reader.dispose();
    a.destroy();
    b.destroy();
  });

  it('PROBE: the generic elementId-keyed property verb also reaches the store', () => {
    const a = new YjsDocAdapter('proj-legb2');
    const b = new YjsDocAdapter('proj-legb2');
    const bStore = new FakeAuthoritativeStore();
    const reader = new ElementSyncReader(b, bStore.apply);
    bStore.seed('wall-9', { height: 3.0 });

    a.applyCommand('wall.create', { id: 'wall-9', levelId: 'L1', height: 3.0 });
    a.applyCommand('element.updateParameters', {
      elementId: 'wall-9',
      elementType: 'wall',
      parameters: { height: 4.25 },
    });
    syncAtoB(a, b);

    expect(bStore.read('wall-9', 'height')).toBe(4.25);

    reader.dispose();
    a.destroy();
    b.destroy();
  });

  it('PROBE: a remotely CREATED element reaches the store as a whole record', () => {
    const a = new YjsDocAdapter('proj-legb3');
    const b = new YjsDocAdapter('proj-legb3');
    const bStore = new FakeAuthoritativeStore();
    const reader = new ElementSyncReader(b, bStore.apply);

    // B has never heard of this wall — the honest "absent" case.
    expect(bStore.get('wall-new')).toBeUndefined();

    a.applyCommand('wall.create', { id: 'wall-new', levelId: 'L1', height: 2.7 });
    syncAtoB(a, b);

    const row = bStore.get('wall-new');
    expect(row).toBeDefined();
    expect(row?.['height']).toBe(2.7);

    reader.dispose();
    a.destroy();
    b.destroy();
  });

  it('ECHO BREAK: a document\'s OWN writes must never come back through the sink', () => {
    const a = new YjsDocAdapter('proj-legb4');
    const seen: RemoteElementUpdate[] = [];
    const reader = new ElementSyncReader(a, (u) => { seen.push(u); });

    a.applyCommand('wall.create', { id: 'wall-local', levelId: 'L1', height: 3.0 });
    a.applyCommand('wall.updateDimensions', { wallId: 'wall-local', height: 5.0 });

    // Local origin — nothing may be delivered, or the client re-applies its own
    // edit to itself and (over a transport) ping-pongs it with every peer.
    expect(seen).toHaveLength(0);
    expect(reader.stats.delivered).toBe(0);
    // And the suppression is COUNTED, not invisible (doctrine 3).
    expect(reader.stats.suppressedLocalOrigin).toBeGreaterThan(0);

    reader.dispose();
    a.destroy();
  });

  it('COUNTERS: a throwing sink is counted and never breaks the merge', () => {
    const a = new YjsDocAdapter('proj-legb5');
    const b = new YjsDocAdapter('proj-legb5');
    const reader = new ElementSyncReader(b, () => { throw new Error('sink exploded'); });

    a.applyCommand('wall.create', { id: 'w', levelId: 'L1', height: 3.0 });
    expect(() => syncAtoB(a, b)).not.toThrow();
    expect(reader.stats.sinkErrors).toBeGreaterThan(0);
    // The failure is not mistaken for "nothing arrived".
    expect(reader.stats.delivered).toBeGreaterThan(0);

    reader.dispose();
    a.destroy();
    b.destroy();
  });

  it('PER-LEVEL: a level-scoped doc is observed once observeLevel() is called', () => {
    const a = new YjsDocAdapter('proj-legb6', { perLevelMode: true });
    const b = new YjsDocAdapter('proj-legb6', { perLevelMode: true });
    const bStore = new FakeAuthoritativeStore();
    const reader = new ElementSyncReader(b, bStore.apply);
    reader.observeLevel('L1');
    bStore.seed('wall-L1', { height: 3.0 });

    a.applyCommand('wall.create', { id: 'wall-L1', levelId: 'L1', height: 3.0 });
    a.applyCommand('wall.updateDimensions', { wallId: 'wall-L1', levelId: 'L1', height: 6.0 });
    b.applyUpdateForLevel('L1', a.encodeStateAsUpdateForLevel('L1'));

    expect(bStore.read('wall-L1', 'height')).toBe(6.0);

    reader.dispose();
    a.destroy();
    b.destroy();
  });

  it('HONESTY: an unobserved level is REPORTED, not silently unsynced', () => {
    const b = new YjsDocAdapter('proj-legb7', { perLevelMode: true });
    const reader = new ElementSyncReader(b, () => {});
    // Nothing observed beyond the coordination doc.
    expect(reader.observedLevelIds()).toEqual([]);
    reader.observeLevel('L2');
    expect(reader.observedLevelIds()).toEqual(['L2']);
    reader.dispose();
    b.destroy();
  });
});
