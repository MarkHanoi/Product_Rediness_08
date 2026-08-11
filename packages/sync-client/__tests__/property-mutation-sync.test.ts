// W5-3 — PROBE: does a wall PROPERTY mutation reach a second document?
//
// DOCTRINE: verify the right invariant on the right object.  We do NOT assert
// "a Yjs update was emitted" and we do NOT assert "applyCommand returned".  We
// read the HEIGHT of the wall ON THE RECEIVING DOCUMENT and assert its value.
//
// Topology: two YjsDocAdapters for the same project (doc A = the editing user,
// doc B = the collaborator).  Sync is the real CRDT primitive pair
// (encodeStateAsUpdate → applyUpdate), i.e. exactly what a transport does.
//
// The reader below is deliberately the MOST GENEROUS possible interpretation of
// the receiving document: it scans EVERY top-level Y.Map in the doc for an entry
// under the element's id carrying the property.  If even that cannot find the
// new height, the property demonstrably did not replicate — the failure cannot
// be dismissed as "you read the wrong namespace".

import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { YjsDocAdapter } from '../src/YjsDocAdapter.js';

/** Sync every op from `from` into `to` — what a websocket provider does. */
function syncAtoB(from: YjsDocAdapter, to: YjsDocAdapter): void {
  to.applyUpdate(from.encodeStateAsUpdate());
}

/**
 * Read `prop` for `elementId` from ANY namespace present in the receiving doc.
 * Returns `undefined` when no namespace carries it.  Uses the doc's share map
 * directly so it is not biased toward any one namespace convention.
 */
function readAnyNamespace(adapter: YjsDocAdapter, elementId: string, prop: string): unknown {
  let found: unknown;
  for (const name of (adapter.doc.share as Map<string, unknown>).keys()) {
    const ns = adapter.doc.getMap<Y.Map<unknown>>(name);
    const entry = ns.get(elementId);
    if (entry instanceof Y.Map && entry.has(prop)) found = entry.get(prop);
  }
  return found;
}

describe('W5-3 — property mutations must reach the collaborator document', () => {
  it('PROBE: A changes a wall height; B observes the new height', () => {
    const a = new YjsDocAdapter('proj-w53');
    const b = new YjsDocAdapter('proj-w53');

    // 1. A creates a wall at height 3.0 and it replicates (this part works).
    a.applyCommand('wall.create', {
      id: 'wall-1',
      levelId: 'L1',
      height: 3.0,
      thickness: 0.2,
    });
    syncAtoB(a, b);
    expect(readAnyNamespace(b, 'wall-1', 'height')).toBe(3.0);

    // 2. A changes the height to 5.0 through the REAL property verb, with the
    //    REAL payload shape that plugins/wall/src/handlers/UpdateWallDimensions.ts
    //    declares: { wallId, height, thickness } — keyed `wallId`, not `id`.
    a.applyCommand('wall.updateDimensions', { wallId: 'wall-1', height: 5.0 });
    syncAtoB(a, b);

    // 3. THE INVARIANT: read the HEIGHT on the RECEIVING document.
    expect(readAnyNamespace(b, 'wall-1', 'height')).toBe(5.0);

    a.destroy();
    b.destroy();
  });

  it('PROBE: the generic property verb (elementId-keyed) also replicates', () => {
    const a = new YjsDocAdapter('proj-w53b');
    const b = new YjsDocAdapter('proj-w53b');

    a.applyCommand('wall.create', { id: 'wall-9', levelId: 'L1', height: 3.0 });
    syncAtoB(a, b);

    // The property panel's live route — payload { elementId, elementType, parameters }.
    a.applyCommand('element.updateParameters', {
      elementId: 'wall-9',
      elementType: 'wall',
      parameters: { height: 4.25 },
    });
    syncAtoB(a, b);

    expect(readAnyNamespace(b, 'wall-9', 'height')).toBe(4.25);

    a.destroy();
    b.destroy();
  });

  it('a new property on an already-declared verb needs NO new sync code', () => {
    // The point of the declaration table: `syncDisposition.ts` never names
    // `thickness`, and nothing in YjsDocAdapter does either.
    const a = new YjsDocAdapter('proj-w53c');
    const b = new YjsDocAdapter('proj-w53c');

    a.applyCommand('wall.create', { id: 'w', levelId: 'L1', height: 3 });
    a.applyCommand('wall.updateDimensions', { wallId: 'w', height: 5, thickness: 0.35 });
    syncAtoB(a, b);

    expect(b.readElementProperty('w', 'height')).toBe(5);
    expect(b.readElementProperty('w', 'thickness')).toBe(0.35);

    a.destroy();
    b.destroy();
  });

  it('routing and local-dispatch keys are NOT replicated as properties', () => {
    const a = new YjsDocAdapter('proj-w53d');
    a.applyCommand('wall.updateBaseline', {
      wallId: 'w2',
      newBaseLine: [{ x: 0, y: 0 }, { x: 5, y: 0 }],
      prevBaseLine: [{ x: 0, y: 0 }, { x: 3, y: 0 }],
      levelId: 'L1',
      _skipBridge: true,
    });
    const rec = a.readElement('w2')!;
    expect(Object.keys(rec).sort()).toEqual(['newBaseLine']);
    a.destroy();
  });
});

describe('W5-3 / P8 — a merge that discards a local edit is DISCLOSED', () => {
  it('concurrent height edits surface a CRDTConflict naming the property', () => {
    const a = new YjsDocAdapter('proj-w53e');
    const b = new YjsDocAdapter('proj-w53e');

    a.applyCommand('wall.create', { id: 'w', levelId: 'L1', height: 3 });
    syncAtoB(a, b);
    // Both sides now agree on 3. Drain A's pending bookkeeping for the create.
    a.applyUpdate(b.encodeStateAsUpdate());

    // Concurrent divergence: A says 5, B says 7, neither has seen the other.
    a.applyCommand('wall.updateDimensions', { wallId: 'w', height: 5 });
    b.applyCommand('wall.updateDimensions', { wallId: 'w', height: 7 });

    const conflicts: Array<{ elementId: string; property: string; localValue: unknown; remoteValue: unknown }> = [];
    a.onConflict((c) => conflicts.push(c));

    // B's ops arrive at A. Yjs converges; P8 requires A's user to be TOLD.
    a.applyUpdate(b.encodeStateAsUpdate());

    const heightConflict = conflicts.find((c) => c.property === 'height');
    expect(heightConflict).toBeDefined();
    expect(heightConflict!.elementId).toBe('w');
    expect(heightConflict!.localValue).toBe(5);
    expect(heightConflict!.remoteValue).toBe(a.readElementProperty('w', 'height'));
    expect(a.getStatus()).toBe('CONFLICTED');

    a.destroy();
    b.destroy();
  });

  it('a property DECLARED last-writer-wins converges silently, by declaration', () => {
    // room.rename is declared `last-writer-wins` with a written `lwwReason`.
    // Silence here is a decision recorded in syncDisposition.ts, not an omission.
    const a = new YjsDocAdapter('proj-w53f');
    const b = new YjsDocAdapter('proj-w53f');

    a.applyCommand('room.rename', { roomId: 'r1', name: 'Kitchen' });
    b.applyCommand('room.rename', { roomId: 'r1', name: 'Cocina' });

    const conflicts: unknown[] = [];
    a.onConflict((c) => conflicts.push(c));
    a.applyUpdate(b.encodeStateAsUpdate());

    expect(conflicts).toEqual([]);
    expect(typeof a.readElementProperty('r1', 'name')).toBe('string');

    a.destroy();
    b.destroy();
  });
});

describe('W5-3 / P8 — a sync gap is DETECTABLE, never silent', () => {
  it('an UNDECLARED command type is reported, not quietly dropped', () => {
    const a = new YjsDocAdapter('proj-w53g');
    expect(a.getUndeclaredCommandTypes()).toEqual([]);

    a.applyCommand('somePlugin.setSomethingNew', { thingId: 't1', value: 42 });

    expect(a.getUndeclaredCommandTypes()).toContain('somePlugin.setSomethingNew');
    // …and it genuinely did not replicate — the report is not decorative.
    expect(a.readElement('t1')).toBeUndefined();
    a.destroy();
  });

  it('a DECLARED type whose payload lacks the subject key is a distinct report', () => {
    const a = new YjsDocAdapter('proj-w53h');
    a.applyCommand('wall.updateDimensions', { height: 5 }); // no wallId

    expect(a.getUnresolvedSubjectCommandTypes()).toContain('wall.updateDimensions');
    expect(a.getUndeclaredCommandTypes()).toEqual([]);  // NOT the same failure
    a.destroy();
  });

  it('a verb declared NOT-SYNCED writes nothing and raises nothing', () => {
    const a = new YjsDocAdapter('proj-w53i');
    a.applyCommand('view.updateCamera', { viewId: 'v1', position: { x: 1, y: 2, z: 3 } });

    expect(a.readElement('v1')).toBeUndefined();
    expect(a.getUndeclaredCommandTypes()).toEqual([]);
    expect(a.getUnresolvedSubjectCommandTypes()).toEqual([]);
    a.destroy();
  });
});
