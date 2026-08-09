// §FIX-SILENT-PATCH-DROP (L-811) — a dropped patch must never be silent.
//
// ─── The defect ──────────────────────────────────────────────────────────────
// `attachStores` skips a patch whose `storeKey` has no registered Store. The
// production call site (`apps/editor/src/bootstrap.ts`) passes no options, so the
// old `onUnknownStore === undefined` default made that skip completely silent.
//
// Today the consequence is bounded but real: a command executes, the bus emits
// its patches, the routing drops them, and the user's edit does nothing — with no
// error anywhere. The snapshot then faithfully serialises the state in which the
// edit did not happen, so persistence looks healthy.
//
// Under the delta persistence of ADR-0311 the same silence becomes *permanent,
// undetectable data loss*: the patch is written to the durable stream, dropped
// locally, and replayed by any peer that does have that store registered. The
// document diverges and nothing reports it. That is why L-811 is a P0 blocker on
// Phase 1 and why this guard should exist whether or not T3 ever ships.
//
// ─── Why the default is LOUD but not FATAL ───────────────────────────────────
// The original silence had a real justification — "bootstrap may register stores
// incrementally", so patches can legitimately arrive before their Store exists.
// Throwing by default would turn a benign boot ordering into a crash.
//
// So the default is now: report every unknown key ONCE, with a running count of
// how many patches were dropped for it. Loud enough that nobody can miss it,
// cheap enough to leave on in production, and it does not invent a failure where
// the old behaviour was legitimately tolerant. `strict: true` is the opt-in that
// throws, and is what the delta-persistence work will turn on.
//
// Once-per-key, not once-per-patch: a per-patch log on a hot command would be
// noise the next person silences, which is how this class of defect returns.

import { describe, it, expect, vi } from 'vitest';
import { PatchEmitter } from '@pryzm/command-bus';
import type { EventRecord } from '@pryzm/command-bus';
import { attachStores } from '../src/attachStores.js';
import { Store } from '../src/Store.js';

/** A record carrying one patch addressed to `storeKey`. */
function recordFor(storeKey: string, id = 'el-1'): EventRecord {
    return {
        id: `evt-${Math.random().toString(36).slice(2)}`,
        type: `${storeKey}.create`,
        payload: {},
        affectedStores: [storeKey],
        patches: [{
            storeKey,
            forwardPatches: [{ op: 'add', path: [id], value: { id } }],
            inversePatches: [{ op: 'remove', path: [id] }],
            capturedAt: new Date().toISOString(),
        }],
        forward: [],
        inverse: [],
        audit: { actorId: 'test', projectId: 'p', clientId: 'c', timestamp: new Date().toISOString() },
    } as unknown as EventRecord;
}

describe('§FIX-SILENT-PATCH-DROP (L-811) — an unknown store is reported, not swallowed', () => {
    it('reports a dropped patch on the default path (no options passed)', () => {
        // The production call site passes NO options. That path is exactly the one
        // that used to be silent, so it is the one that must be pinned.
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const emitter = new PatchEmitter();
        attachStores(emitter, {});

        emitter.emit(recordFor('wall'));

        const hits = err.mock.calls.filter(c => String(c[0]).includes('L-811'));
        expect(hits.length).toBeGreaterThan(0);
        expect(String(hits[0]![0])).toContain('wall');
        err.mockRestore();
    });

    it('reports each unknown key ONCE, not once per patch', () => {
        // A per-patch log on a hot command becomes noise, and noise gets silenced —
        // which is how this defect comes back.
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const emitter = new PatchEmitter();
        attachStores(emitter, {});

        for (let i = 0; i < 5; i++) emitter.emit(recordFor('wall', `el-${i}`));

        expect(err.mock.calls.filter(c => String(c[0]).includes('L-811'))).toHaveLength(1);
        err.mockRestore();
    });

    it('reports each DISTINCT unknown key separately', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const emitter = new PatchEmitter();
        attachStores(emitter, {});

        emitter.emit(recordFor('wall'));
        emitter.emit(recordFor('slab'));

        const msgs = err.mock.calls.map(c => String(c[0])).filter(m => m.includes('L-811'));
        expect(msgs).toHaveLength(2);
        expect(msgs.join(' ')).toContain('wall');
        expect(msgs.join(' ')).toContain('slab');
        err.mockRestore();
    });

    it('still honours an explicit onUnknownStore callback, and stays silent then', () => {
        // The existing option must keep working — a caller that has taken
        // responsibility for reporting should not also get the default log.
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const seen: string[] = [];
        const emitter = new PatchEmitter();
        attachStores(emitter, {}, { onUnknownStore: k => seen.push(k) });

        emitter.emit(recordFor('wall'));

        expect(seen).toEqual(['wall']);
        expect(err.mock.calls.filter(c => String(c[0]).includes('L-811'))).toHaveLength(0);
        err.mockRestore();
    });
});

describe('§FIX-SILENT-PATCH-DROP (L-811) — strict mode is the delta-persistence setting', () => {
    it('THROWS on an unknown store when strict', () => {
        // ADR-0311 Phase 1 turns this on. A delta system may not drop a patch it
        // has already committed to a durable stream.
        const emitter = new PatchEmitter();
        attachStores(emitter, {}, { strict: true });
        expect(() => emitter.emit(recordFor('wall'))).toThrow(/L-811|unknown store|wall/i);
    });

    it('does NOT throw when the store IS registered', () => {
        // The guard must not fire on the happy path — strict mode has to be safe
        // to leave on, or it will be turned off again.
        const emitter = new PatchEmitter();
        const wall = new Store<{ id: string }>('wall');
        attachStores(emitter, { wall: wall as unknown as Store<object> }, { strict: true });
        expect(() => emitter.emit(recordFor('wall'))).not.toThrow();
        expect(wall.getState().size).toBe(1);
    });
});

describe('§FIX-SILENT-PATCH-DROP (L-811) — routing itself is unchanged', () => {
    it('still applies patches to a registered store', () => {
        // Regression guard: the whole point is to make a failure visible, not to
        // alter what happens when things work.
        const emitter = new PatchEmitter();
        const wall = new Store<{ id: string }>('wall');
        attachStores(emitter, { wall: wall as unknown as Store<object> });

        emitter.emit(recordFor('wall', 'el-42'));

        expect(wall.getState().has('el-42')).toBe(true);
    });
});
