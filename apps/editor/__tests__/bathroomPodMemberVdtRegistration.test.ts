/**
 * §G3-STALE-FIX (lane L3b, 2026-08-31) — bathroom-pod MEMBERS register with the
 * ViewDependencyTracker in the mirror's project loop, and unregister in its reap
 * loop. The POD's own id is NEVER registered (nothing draws it — the
 * §PLAN-MEMBERSHIP-RULE precondition (1) fails for the pod).
 *
 * THE MEASURED DEFECT (L2b table, `no-registration-families-measurement.md` row
 * "bathroomPod"): `bathroomPodMemberMirror` projected members into the legacy
 * `window.plumbingStore` via bare `store.add()` — BYPASSING
 * `CreatePlumbingFixtureCommand` — so members got NEITHER VDT nor bimManager
 * registration, and every projected member's `'plumbing'` create event fell into
 * the §G3-STALE coarse fallback (console.warn + EVERY non-3D view dirtied).
 *
 * THE SITE IS THE MIRROR because it sees execute/undo/redo alike via
 * `subscribeDirty` — registration survives undo BY CONSTRUCTION: the undo's
 * `removed` diff reaps + unregisters, the redo's `added` diff re-projects +
 * re-registers, through the ONE function this suite drives. The function is
 * exported for exactly this ("a test drives the REAL function the subscription
 * calls" — its own doc); the fake here is the injectable legacy-store PARAM the
 * production signature already takes, not a re-implementation of the mirror.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { viewDependencyTracker } from '@pryzm/core-app-model';
import {
    projectBathroomPodMembers,
    type LegacyPlumbingFixtureStore,
} from '../src/engine/bathroomPodMemberMirror.js';

const POD_ID = 'bathroomPod_01ARZ3NDEKTSV4RRFFQ69G5H00';
const LEVEL = 'level-1';
const MEMBER_IDS = ['plumbing_vdt_wc', 'plumbing_vdt_basin', 'plumbing_vdt_shower'];

function makeRecordingStore(): LegacyPlumbingFixtureStore & { adds: string[]; removes: string[] } {
    const adds: string[] = [];
    const removes: string[] = [];
    return {
        adds,
        removes,
        add: (data: Record<string, unknown>) => { adds.push(String(data.id)); },
        remove: (id: string) => { removes.push(id); },
        get: () => undefined,
    };
}

function podRecord() {
    return {
        id: POD_ID,
        levelId: LEVEL,
        members: MEMBER_IDS.map((id, i) => ({
            id,
            kind: 'member',
            fixtureType: i === 0 ? 'toilet' : i === 1 ? 'sink' : 'shower',
            variant: i === 2 ? 'shower_walkin_left' : undefined,
            position: { x: i, y: 0, z: 0 },
            rotationY: 0,
            footprint: { width: 0.4, length: 0.7, height: 0.8 },
        })),
    };
}

const emptySet: ReadonlySet<string> = new Set();

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('§G3-STALE-FIX L3b — bathroomPodMemberMirror ↔ ViewDependencyTracker', () => {
    it('⭐ project loop registers EVERY member against pod.levelId BEFORE store.add — and NEVER the pod id', () => {
        const calls: string[] = [];
        const reg = vi
            .spyOn(viewDependencyTracker, 'registerElement')
            .mockImplementation((id: string) => { calls.push(`vdt:${id}`); });
        const store = makeRecordingStore();
        const rawAdd = store.add;
        store.add = (data: Record<string, unknown>) => { calls.push(`add:${data.id}`); rawAdd(data); };

        projectBathroomPodMembers(
            { added: new Set([POD_ID]), updated: emptySet, removed: emptySet },
            new Map([[POD_ID, podRecord()]]),
            new Map(),
            store,
        );

        for (const id of MEMBER_IDS) {
            expect(reg).toHaveBeenCalledWith(id, LEVEL);
            // Ordering per member: register first, THEN the add whose 'plumbing'
            // event the VDT must resolve to a level (else §G3-STALE coarse fallback).
            expect(calls.indexOf(`vdt:${id}`)).toBeGreaterThanOrEqual(0);
            expect(calls.indexOf(`vdt:${id}`)).toBeLessThan(calls.indexOf(`add:${id}`));
        }
        // ⛔ The pod itself is DRAWN BY NOTHING — registering it would claim plan
        // membership for an element with no representation (the membership rule's ⛔).
        expect(reg).not.toHaveBeenCalledWith(POD_ID, expect.anything());
        expect(store.adds.sort()).toEqual([...MEMBER_IDS].sort());
    });

    it('reap loop unregisters every reaped member (the undo/delete leg — the removed diff)', () => {
        vi.spyOn(viewDependencyTracker, 'registerElement').mockImplementation(() => {});
        const unreg = vi
            .spyOn(viewDependencyTracker, 'unregisterElement')
            .mockImplementation(() => {});
        const store = makeRecordingStore();

        // The reaped map is what the subscription hands the function on a removed
        // pod (the record itself is already gone from state by notify time).
        projectBathroomPodMembers(
            { added: emptySet, updated: emptySet, removed: new Set([POD_ID]) },
            new Map(),
            new Map([[POD_ID, MEMBER_IDS]]),
            store,
        );

        for (const id of MEMBER_IDS) {
            expect(unreg).toHaveBeenCalledWith(id);
        }
        expect(store.removes.sort()).toEqual([...MEMBER_IDS].sort());
    });

    it('redo (the added diff again) re-registers — registration survives an undo/redo cycle by construction', () => {
        const reg = vi.spyOn(viewDependencyTracker, 'registerElement').mockImplementation(() => {});
        const unreg = vi.spyOn(viewDependencyTracker, 'unregisterElement').mockImplementation(() => {});
        const store = makeRecordingStore();
        const state = new Map([[POD_ID, podRecord()]]);

        // create
        projectBathroomPodMembers({ added: new Set([POD_ID]), updated: emptySet, removed: emptySet }, state, new Map(), store);
        // undo → removed diff
        projectBathroomPodMembers({ added: emptySet, updated: emptySet, removed: new Set([POD_ID]) }, new Map(), new Map([[POD_ID, MEMBER_IDS]]), store);
        // redo → added diff again, through the SAME one road (subscribeDirty)
        projectBathroomPodMembers({ added: new Set([POD_ID]), updated: emptySet, removed: emptySet }, state, new Map(), store);

        for (const id of MEMBER_IDS) {
            expect(unreg).toHaveBeenCalledWith(id);
            // Registered on create AND again on redo.
            expect(reg.mock.calls.filter(c => c[0] === id && c[1] === LEVEL).length).toBe(2);
        }
    });
});
