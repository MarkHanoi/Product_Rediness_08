// @vitest-environment happy-dom
//
// §FIX-BOUNDARY-LINE-UNDO-STRANDED (L-11160) — Ctrl+Z after drawing a boundary
// line was a total no-op: `[Undo] STRANDED … no applyPatch adapter for store(s)
// [boundaryLine]`. This proves the adapter at the layer the user experiences:
// a REAL `BoundaryLineStore`, a REAL create patch, the inverse applied through
// `buildUndoStoreMap()`, the record GONE from the store, and the bus event the
// 3-D/plan bridge listens for EMITTED with the id — not a fixture that returns
// what the test put in ([[committed-is-not-reachable]]).
//
// THREE ARMS:
//   A — the map key is PRESENT and its adapter is a working function (so
//       `_covered()` accepts a boundaryLine entry instead of stranding it).
//   B — undo removes the record and emits `boundaryLine.deleted`; redo restores
//       it and emits `boundaryLine.created` WITH the line (the bridge draws from
//       the payload when it carries one).
//   C — with NO composed runtime the adapter THROWS a named error rather than
//       silently no-op'ing — the L-980 rule: an adapter that cannot apply must
//       say so, never pretend.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BoundaryLineStore } from '@pryzm/plugin-boundary-line';
import type { Patch } from '@pryzm/command-bus';
import { buildUndoStoreMap } from '../src/engine/undo/performUndoRedo.js';
import { boundaryLineUndoAdapter } from '../src/engine/undo/pluginStoreUndoAdapter.js';

const ID = 'boundaryLine_TEST0001';
const RECORD = {
    id: ID,
    type: 'boundaryLine',
    levelId: 'L0',
    closed: true,
    name: 'ring',
    vertices: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 }],
    attachments: [],
    childrenIds: [],
};

const forwardCreate: Patch[] = [{ op: 'add', path: [ID], value: RECORD } as Patch];
const inverseCreate: Patch[] = [{ op: 'remove', path: [ID] } as Patch];

function emitterSpy(): { events: { emit(type: string, payload: Record<string, unknown>): void }; seen: { type: string; payload: Record<string, unknown> }[] } {
    const seen: { type: string; payload: Record<string, unknown> }[] = [];
    return { events: { emit: (type, payload) => { seen.push({ type, payload }); } }, seen };
}

describe('§FIX-BOUNDARY-LINE-UNDO-STRANDED (L-11160)', () => {
    let store: BoundaryLineStore;
    const w = window as unknown as Record<string, unknown>;

    beforeEach(() => {
        store = new BoundaryLineStore();
        // The forward create the bus would have applied on `boundaryLine.create`.
        store.applyPatch(forwardCreate);
        expect(store.get(ID)).toBeDefined();
    });
    afterEach(() => {
        delete w['runtime'];
    });

    it('ARM A — buildUndoStoreMap() carries a working boundaryLine adapter', () => {
        const map = buildUndoStoreMap();
        expect(typeof map['boundaryLine']?.applyPatch).toBe('function');
    });

    it('ARM B — undo removes the record and tells the bridge; redo restores it WITH the line', () => {
        const spy = emitterSpy();
        w['runtime'] = { stores: { boundaryLine: store }, events: spy.events };
        const map = buildUndoStoreMap();

        // UNDO — through the map, exactly as performUndo would route it.
        map['boundaryLine']!.applyPatch(inverseCreate);
        expect(store.get(ID)).toBeUndefined();                        // STORED state, not a return value
        expect(spy.seen.map((e) => e.type)).toEqual(['boundaryLine.deleted']);
        expect(spy.seen[0]!.payload['boundaryLineId']).toBe(ID);

        // REDO — the forward side again; the builder must be told to draw it.
        spy.seen.length = 0;
        map['boundaryLine']!.applyPatch(forwardCreate);
        expect(store.get(ID)).toBeDefined();
        expect(spy.seen.map((e) => e.type)).toEqual(['boundaryLine.created']);
        expect(spy.seen[0]!.payload['boundaryLineId']).toBe(ID);
        expect(spy.seen[0]!.payload['levelId']).toBe('L0');
        expect(spy.seen[0]!.payload['line']).toBeDefined();          // the bridge draws from this
    });

    it('ARM C — without a composed runtime the adapter THROWS a named error, never a silent no-op', () => {
        const adapter = boundaryLineUndoAdapter(() => null);
        expect(() => adapter.applyPatch(inverseCreate)).toThrow(/not reachable/);
        // And nothing was touched: the record is still there.
        expect(store.get(ID)).toBeDefined();
    });
});
