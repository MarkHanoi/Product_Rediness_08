// §RIVAL-MINT — two partitioned peers FIRST-TOUCHING the same element must not
// lose each other's properties.
//
// ─── THE DEFECT ─────────────────────────────────────────────────────────────
//
// `ELEMENTS_NAMESPACE` held one nested `Y.Map` per element, reached by
// get-or-create.  A nested map is a CONTAINER SET AS A VALUE under a key, and
// `Y.Map` is last-writer-wins PER KEY.  Two partitioned clients that each
// first-touch the same element both take the `!record` branch and each `set`s
// its OWN rival container under the same key.  On merge Yjs keeps ONE and
// discards the other WITH EVERY PROPERTY INSIDE IT — the silent loss of a
// property nobody concurrently edited.
//
// ─── WHY THE POSITIVE CONTROL IS NOT OPTIONAL ───────────────────────────────
//
// A test that only asserts the NEW adapter keeps both properties cannot
// distinguish "the fix works" from "this scenario never lost anything".  So
// `oldStyleTouch()` below reproduces the PRE-FIX write EXACTLY — nested
// get-or-create on `ELEMENTS_NAMESPACE`, the literal code that shipped — and
// asserts it STILL LOSES the property.  If that control ever goes green, this
// file is no longer measuring the fix and the suite says so rather than
// passing quietly.

import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { YjsDocAdapter, ELEMENTS_NAMESPACE } from '../src/YjsDocAdapter.js';

/** Exchange until quiescent — the CRDT primitive pair a transport performs. */
function sync(a: YjsDocAdapter, b: YjsDocAdapter): void {
  for (let i = 0; i < 3; i++) {
    const u1 = Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc));
    if (u1.byteLength) b.applyUpdate(u1);
    const u2 = Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc));
    if (u2.byteLength) a.applyUpdate(u2);
  }
}

/**
 * THE POSITIVE CONTROL — the PRE-FIX write path, reproduced verbatim.
 * Lifted from YjsDocAdapter.ts:690-700 as it stood before this change.
 */
function oldStyleTouch(doc: Y.Doc, elementId: string, props: Record<string, unknown>): void {
  doc.transact(() => {
    const elements = doc.getMap<Y.Map<unknown>>(ELEMENTS_NAMESPACE);
    let record = elements.get(elementId);
    if (!record) {
      record = new Y.Map<unknown>();
      elements.set(elementId, record);
    }
    for (const [k, v] of Object.entries(props)) record.set(k, v);
  });
}

function readOldStyle(doc: Y.Doc, elementId: string): Record<string, unknown> | undefined {
  const rec = doc.getMap<Y.Map<unknown>>(ELEMENTS_NAMESPACE).get(elementId);
  if (!(rec instanceof Y.Map)) return undefined;
  const out: Record<string, unknown> = {};
  rec.forEach((v: unknown, k: string) => { out[k] = v; });
  return out;
}

describe('§RIVAL-MINT — POSITIVE CONTROL: the pre-fix path still loses the property', () => {
  it('nested get-or-create discards a rival container with its properties', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();

    // Neither peer has ever seen 'rw' — both first-touch it while partitioned.
    oldStyleTouch(a, 'rw', { height: 5 });
    oldStyleTouch(b, 'rw', { materialColor: '#c0ffee' });

    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));

    const ra = readOldStyle(a, 'rw')!;
    const rb = readOldStyle(b, 'rw')!;

    // THE CONTROL. Exactly one of the two properties survives on each side.
    // If this ever reads "both present", the control has stopped measuring the
    // defect and every assertion in the next describe block is unanchored.
    const lost = ['height', 'materialColor'].filter(
      (k) => ra[k] === undefined || rb[k] === undefined,
    );
    expect(lost.length).toBeGreaterThan(0);

    // And the loss is TOTAL, not partial: the discarded container took its
    // whole content, so the survivors agree on the winner alone.
    expect(ra).toEqual(rb);
  });
});

describe('§RIVAL-MINT — the fixed adapter keeps BOTH first-touch edits', () => {
  it('two partitioned peers first-touching one element lose nothing', () => {
    const a = new YjsDocAdapter('rival-fix');
    const b = new YjsDocAdapter('rival-fix');

    // The exact scenario the gate measured: disjoint properties, no prior
    // replication of the record, so both peers mint it "for the first time".
    a.applyCommand('wall.updateDimensions', { wallId: 'rw', height: 5 });
    b.applyCommand('wall.updateColor', { wallId: 'rw', materialColor: '#c0ffee' });
    sync(a, b);

    for (const [label, adapter] of [['A', a], ['B', b]] as const) {
      const rec = adapter.readElement('rw');
      expect(rec, `${label} lost the element entirely`).toBeDefined();
      expect(adapter.readElementProperty('rw', 'height'), `${label}.height`).toBe(5);
      expect(
        adapter.readElementProperty('rw', 'materialColor'), `${label}.materialColor`,
      ).toBe('#c0ffee');
    }

    a.destroy();
    b.destroy();
  });

  it('the nested compatibility mirror converges too, so external readers agree', () => {
    // apps/sync-server's tests and collabGraphIntegrity read the NESTED shape
    // and its `.size`. The mirror is not authoritative, but it must not be
    // permanently wrong either.
    const a = new YjsDocAdapter('rival-mirror');
    const b = new YjsDocAdapter('rival-mirror');

    a.applyCommand('wall.updateDimensions', { wallId: 'rw', height: 5 });
    b.applyCommand('wall.updateColor', { wallId: 'rw', materialColor: '#c0ffee' });
    sync(a, b);

    for (const adapter of [a, b]) {
      const mirror = adapter.getElementsNamespace().get('rw');
      expect(mirror).toBeInstanceOf(Y.Map);
      expect(mirror!.get('height')).toBe(5);
      expect(mirror!.get('materialColor')).toBe('#c0ffee');
      // The element count external gates read stays 1 — not 0, not 2.
      expect(adapter.getElementsNamespace().size).toBe(1);
    }

    a.destroy();
    b.destroy();
  });

  it('CONVERGENCE IS ORDER-INDEPENDENT, asserted property by property', () => {
    // A last-writer-wins patch over a container race would reintroduce the same
    // nondeterminism one layer up: two peers could converge to DIFFERENT states
    // depending on which update arrived first. This asserts they do not.
    //
    // Compared element-by-element and property-by-property — never a whole-doc
    // hash, which would say THAT they differ and never WHAT.
    const run = (order: 'ab' | 'ba'): Record<string, unknown> => {
      const x = new YjsDocAdapter('order');
      const y = new YjsDocAdapter('order');
      // Pin the Yjs client ids so the two orderings are the SAME two peers.
      // Without this each run draws fresh random ids and a genuine concurrent
      // edit resolves by a different tiebreak, which would look like
      // nondeterminism while measuring nothing.
      (x.doc as unknown as { clientID: number }).clientID = 101;
      (y.doc as unknown as { clientID: number }).clientID = 202;

      x.applyCommand('wall.updateDimensions', { wallId: 'w', height: 5, thickness: 0.2 });
      y.applyCommand('wall.updateColor', { wallId: 'w', materialColor: '#c0ffee' });

      if (order === 'ab') {
        y.applyUpdate(x.encodeStateAsUpdate());
        x.applyUpdate(y.encodeStateAsUpdate());
      } else {
        x.applyUpdate(y.encodeStateAsUpdate());
        y.applyUpdate(x.encodeStateAsUpdate());
      }

      const rx = x.readElement('w')!;
      const ry = y.readElement('w')!;
      // Both peers of a single run must agree, per property.
      for (const k of new Set([...Object.keys(rx), ...Object.keys(ry)])) {
        expect(ry[k], `peers disagree on ${k} (order ${order})`).toEqual(rx[k]);
      }
      x.destroy(); y.destroy();
      return rx;
    };

    const ab = run('ab');
    const ba = run('ba');

    for (const k of new Set([...Object.keys(ab), ...Object.keys(ba)])) {
      expect(ba[k], `order-dependent value for ${k}`).toEqual(ab[k]);
    }
    expect(ab['height']).toBe(5);
    expect(ab['thickness']).toBe(0.2);
    expect(ab['materialColor']).toBe('#c0ffee');
  });

  it('a concurrently-edited SAME property still discloses a CRDTConflict (P8)', () => {
    // The fix must not silence the disclosure path it sits under. Disjoint
    // first-touches now merge losslessly; a genuine same-property race still
    // converges by LWW and still tells the user.
    const a = new YjsDocAdapter('rival-p8');
    const b = new YjsDocAdapter('rival-p8');
    // Pin the Yjs client ids so A deterministically LOSES the per-key LWW
    // tiebreak (higher clientID wins). Unpinned, this test measured a coin
    // flip: whenever A drew the higher id its value SURVIVED the merge, no
    // disclosure was owed, and the assertion failed ~50% of runs — same
    // defect family as the pinning in 'CONVERGENCE IS ORDER-INDEPENDENT'.
    (a.doc as unknown as { clientID: number }).clientID = 101;
    (b.doc as unknown as { clientID: number }).clientID = 202;

    a.applyCommand('wall.create', { id: 'w', height: 3 });
    b.applyUpdate(a.encodeStateAsUpdate());
    a.applyUpdate(b.encodeStateAsUpdate());

    a.applyCommand('wall.updateDimensions', { wallId: 'w', height: 5 });
    b.applyCommand('wall.updateDimensions', { wallId: 'w', height: 7 });

    const conflicts: Array<{ property: string; localValue: unknown }> = [];
    a.onConflict((c) => conflicts.push(c));
    a.applyUpdate(b.encodeStateAsUpdate());

    const height = conflicts.find((c) => c.property === 'height');
    expect(height, 'a same-property race must still be DISCLOSED, never silent').toBeDefined();
    expect(height!.localValue).toBe(5);
    expect(a.getStatus()).toBe('CONFLICTED');

    a.destroy();
    b.destroy();
  });
});
