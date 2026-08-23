/**
 * ⭐ L-7200 (lane LEVEL36, 2026-08-23) — THE RECONCILE LISTENER MUST BE ARMED BY
 * REGISTRATION ALONE.
 *
 * ## The defect this pins
 *
 * `BimKernel.updateLevel()` dispatches `spatial-authority-reconcile` on every
 * level-elevation change. The listener that turns that event into rebuilds is
 * installed by `SpatialAuthority.ensureReconciliationListener()` — and that had
 * exactly ONE caller: the tail of `resolveWorldTransform()` (`:172`).
 *
 * MEASURED (cross-checked with ripgrep AND `grep -rn`, because a single grep is
 * not proof): `resolveWorldTransform` has ONE production call site in the whole
 * repository — `packages/geometry-wall/src/WallFragmentBuilder.ts:1256` — and it
 * lives in the `else` arm of `if (worldY !== undefined)`. The authoritative
 * path, `updateWall()`, computes `worldY` itself (`WallFragmentBuilder.ts:861`:
 * `level.elevation + slabBaseOffset + wall.baseOffset`) and passes it in,
 * specifically so the builder does not reach back into SpatialAuthority — that
 * was the §13/§4 cross-layer fix.
 *
 * Consequence: on the normal path the resolver is never called, the window
 * listener is never added, and the reconcile event fires INTO A VOID. Arming was
 * INCIDENTAL — it happened only if something called `buildWall()` without a
 * `worldY` (a miter-adjust rebuild), i.e. only if the user happened to have
 * drawn intersecting walls first. On a fresh project the entire level-elevation
 * cascade was dead.
 *
 * This is ABSENT vs UNREACHABLE (C01 §6 rule 6). The machinery was fully
 * authored and correct; it was simply never switched on. The fix is one line in
 * `registerLevelRebuildCallback()`.
 *
 * ## Why this lives in its OWN file
 *
 * `SpatialAuthority` is a process singleton and `_reconciliationListenerRegistered`
 * never resets. `SpatialAuthority.reconcile.test.ts` arms the listener in its
 * `armReconcile()` helper (which calls `resolveWorldTransform`) before any of its
 * assertions run — so inside that file the listener is ALWAYS already installed
 * and this defect is invisible. That is precisely why an existing, thorough,
 * six-case reconcile suite never caught it.
 *
 * Vitest isolates module registries per FILE, so a separate file is the only
 * place the singleton is genuinely fresh. ⛔ Do not merge these cases back into
 * the sibling suite — doing so silently converts them into tautologies.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { spatialAuthority } from '../SpatialAuthority';

const w = globalThis as unknown as Record<string, unknown>;
const STORE_KEYS = ['wallStore', 'slabStore', 'bimManager'] as const;

const LEVEL_ID = 'L-arming';
const WALL_ID = 'wall-arming-1';

function storeOf(ids: Record<string, object>) {
    return { get: (id: string) => ids[id] ?? null };
}

function makeBimManager() {
    const level = {
        id: LEVEL_ID,
        name: 'Arming',
        elevation: 3,
        height: 3,
        isVisible: true,
        order: 1,
        childrenIds: [WALL_ID],
    };
    return {
        getLevels: () => [level],
        getLevelById: (id: string) => (id === LEVEL_ID ? level : undefined),
    };
}

function fireReconcile(): void {
    window.dispatchEvent(new CustomEvent('spatial-authority-reconcile', {
        detail: { levelId: LEVEL_ID, delta: -0.1 },
    }));
}

const saved: Record<string, unknown> = {};

beforeEach(() => {
    for (const k of STORE_KEYS) saved[k] = w[k];
    w.wallStore = storeOf({ [WALL_ID]: { id: WALL_ID, levelId: LEVEL_ID, x: 0, z: 0, rotationY: 0 } });
    w.slabStore = storeOf({});
    w.bimManager = makeBimManager();
    spatialAuthority.setBimManager(makeBimManager() as never);
});

afterEach(() => {
    for (const k of STORE_KEYS) w[k] = saved[k];
    vi.restoreAllMocks();
});

describe('L-7200 — reconcile arming does not depend on resolveWorldTransform', () => {
    it('delivers a reconcile after registerLevelRebuildCallback ALONE, with no resolver call', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const calls: Array<{ levelId: string; elementIds: string[] }> = [];

        // ⭐ Register and NOTHING else — no `resolveWorldTransform`, exactly like
        // production. Before the fix this delivered ZERO calls, which is the
        // whole bug: the founder changed a level and nothing moved.
        spatialAuthority.registerLevelRebuildCallback((levelId, elementIds) => {
            calls.push({ levelId, elementIds });
        });

        fireReconcile();

        expect(calls).toHaveLength(1);
        expect(calls[0]!.levelId).toBe(LEVEL_ID);
        expect(calls[0]!.elementIds).toContain(WALL_ID);
    });

    it('is idempotent — repeat registration does not stack listeners and double-rebuild', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        let deliveries = 0;
        spatialAuthority.registerLevelRebuildCallback(() => { deliveries++; });
        spatialAuthority.registerLevelRebuildCallback(() => { deliveries++; });
        spatialAuthority.registerLevelRebuildCallback(() => { deliveries++; });

        fireReconcile();

        // One window listener + registration REPLACES the callback → exactly 1.
        // A stacked listener would deliver 2 or 3 and rebuild the level N times,
        // which is the hazard the `_reconciliationListenerRegistered` guard
        // exists to prevent. Arming from the registrar must not defeat it.
        expect(deliveries).toBe(1);
    });

    it('the delta still reaches the callback when armed this way (PR-10 consumer)', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const deltas: Array<number | undefined> = [];
        spatialAuthority.registerLevelRebuildCallback((_l, _ids, elevationDeltaM) => {
            deltas.push(elevationDeltaM);
        });

        fireReconcile();

        // The roof→walls-beneath clash check cannot classify without it, and
        // "no delta recorded" must stay distinguishable from "did not move".
        expect(deltas).toEqual([-0.1]);
    });
});
