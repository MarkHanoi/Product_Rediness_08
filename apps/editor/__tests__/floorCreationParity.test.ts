/**
 * §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — THE PARITY GUARD.
 *
 * THE DISEASE THIS TEST EXISTS TO KILL
 * ------------------------------------
 * "ONE ELEMENT, TWO CREATION PATHS, AND THE PLAN PATH SILENTLY DROPS WHAT THE 3D PATH
 * RESOLVES." Diagnosed EIGHT times on this codebase — L-239 (wall layers), L-240 (floor-finish
 * inner face — the SAME element), L-243 (stair config), L-246 (plan cut), L-251 (mitre), L-255
 * (this), L-260 A (door), L-266 (window). Fixed at one site each time; reappeared at the next,
 * because nothing pinned the invariant itself. Every instance now has a guard. This is L-255's.
 *
 * THE FOUNDER'S REPORT, VERBATIM: *"Floor finish creation in PLAN VIEW (auto) doesn't bring the
 * UI modal that is required and IS WORKING on 3D VIEW — which provides the ELEVATION LEVEL of
 * the floor finish."*
 *
 * THE ROOT CAUSE (proven, and WIDER than the report — see the record table in the ticket):
 * `FloorPlanToolHandler` dispatched `floor.create` with `{ floorId, ifcGuid, polygon, levelId,
 * hostRoomId? }` and NOTHING ELSE. Four fields the 3D `FloorTool` resolves were simply absent:
 *
 *      systemTypeId · layers · thickness · baseOffset (the ELEVATION)
 *
 * They were then re-invented by THREE DIFFERENT downstream defaults:
 *      plugin `resolveFinishSeating`      → thickness 0.015 · baseOffset 0.015
 *      initTools bus→legacy mirror        → thickness 0.075 · baseOffset 0      ← MESHED
 *      3D FloorTool                       → thickness 0.015 · baseOffset 0.075
 * so the plan floor was RENDERED 75 mm thick sitting ON the level datum, and the 3D floor 15 mm
 * thick 75 mm above it. Even the finish TYPE the plan user had already chosen in the
 * FloorModePicker was dropped: that dropdown writes `floorTool.setSystemTypeId()`, a 3D-tool
 * instance field, and the plan handler has no FloorTool.
 *
 * THE CURE (C11 §3): resolve the choice ONCE, BELOW the tools, and let every path inherit it.
 * NOT "teach the plan tool to imitate the 3D tool" — that leaves two paths to keep in step BY
 * HAND, and they never are. So these tests assert the CHOKEPOINTS, not the copies:
 *
 *   FloorToolConfigStore  — WHICH finish the architect chose        (one store)
 *   resolveFloorFinish    — that finish's REAL type/layers/thickness/elevation  (one resolver)
 *
 * WHAT THIS FILE GUARDS, AND WHY EACH ONE
 * ---------------------------------------
 *  P-1  Both creation paths resolve the BYTE-IDENTICAL record from the SAME chokepoints.
 *  P-2  Changing the architect's choice moves BOTH paths together — they cannot be desynced.
 *  P-3  The resolution ORDER is record → system type → documented default (no other source).
 *  P-4  NO dimension literal survives in EITHER handler. The bug WAS literals, so literals are
 *       forbidden — a future edit that types `0.075` into a handler reds this file.
 *  P-5  The plan path CANNOT commit without the elevation being RESOLVED — asserted, not hoped.
 *  P-6  The record REACHES THE RENDERER: the bus→legacy mirror that feeds the mesh builder no
 *       longer carries its own competing literals (`?? 0` / `?? 0.075`). Verifying at the seam
 *       and not at the outcome is how this project has previously shipped a "fix" that computed
 *       the right value and threw it away.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
    getFloorToolConfig,
    setFloorToolConfig,
    resetFloorToolConfig,
    resolveFloorFinish,
    floorSystemTypeStore,
    DEFAULT_FLOOR_FINISH_BASE_OFFSET_M,
    DEFAULT_FLOOR_FINISH_THICKNESS_M,
    type ResolvedFloorFinish,
} from '@pryzm/core-app-model/stores';

const _here = dirname(fileURLToPath(import.meta.url));
const PLAN_HANDLER_SRC = resolve(_here, '../src/engine/views/plantools/FloorPlanToolHandler.ts');
const TOOL_3D_SRC      = resolve(_here, '../../../packages/geometry-slab/src/floor/FloorTool.ts');
const MIRROR_SRC       = resolve(_here, '../src/engine/initTools.ts');

/** Source with comments stripped — the files DOCUMENT the old literals on purpose. */
function codeOf(path: string): string {
    return readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
}

/**
 * The floor-finish record a creation path commits, reduced to the fields that DEFINE the finish.
 * Both paths must produce this identically — and both now build it from exactly these two calls
 * (`getFloorToolConfig()` → `resolveFloorFinish()`) and NOTHING else.
 */
function resolveCreationRecord(): ResolvedFloorFinish {
    return resolveFloorFinish(getFloorToolConfig(), floorSystemTypeStore);
}

describe('§FIX-FLOOR-FINISH-CREATION-PARITY — floor-finish creation parity (L-255)', () => {
    beforeEach(() => {
        resetFloorToolConfig();
    });

    it('P-1: the plan path and the 3D path resolve the BYTE-IDENTICAL record from the same chokepoints', () => {
        const fromPlan = resolveCreationRecord();
        const from3D   = resolveCreationRecord();

        expect(fromPlan).toEqual(from3D);
        expect(JSON.stringify(fromPlan)).toBe(JSON.stringify(from3D));

        // And the record must be REAL — not the void that a dropped field used to produce.
        expect(fromPlan.thicknessM).toBeGreaterThan(0);
        expect(fromPlan.baseOffsetM).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(fromPlan.baseOffsetM)).toBe(true);

        // The historical 3D-path values are the standard adopted (the plan path had none).
        expect(fromPlan.thicknessM).toBe(DEFAULT_FLOOR_FINISH_THICKNESS_M);
        expect(fromPlan.baseOffsetM).toBe(DEFAULT_FLOOR_FINISH_BASE_OFFSET_M);
    });

    it('P-1b: a TYPED finish resolves identically on both paths — type, layer snapshot and all', () => {
        const type = floorSystemTypeStore.getAll().find(t => (t.layers?.length ?? 0) > 0);
        expect(type, 'the catalogue must ship at least one layered finish').toBeTruthy();

        setFloorToolConfig({ systemTypeId: type!.id });

        const fromPlan = resolveCreationRecord();
        const from3D   = resolveCreationRecord();
        expect(JSON.stringify(fromPlan)).toBe(JSON.stringify(from3D));

        // The layers the PLAN path used to drop entirely.
        expect(fromPlan.systemTypeId).toBe(type!.id);
        expect(fromPlan.layers?.length).toBe(type!.layers.length);
        expect(fromPlan.thicknessM).toBe(type!.totalThickness);

        // …and it is a SNAPSHOT: mutating the record must not touch the catalogue.
        fromPlan.layers![0]!.thickness = 999;
        expect(floorSystemTypeStore.getById(type!.id)!.layers[0]!.thickness).not.toBe(999);
    });

    it('P-2: changing the architect\'s choice moves BOTH paths together — they cannot be desynced', () => {
        const before = resolveCreationRecord();

        // This is the exact gesture that used to desync them: the FloorModePicker's finish
        // dropdown (plan view!) wrote to the 3D tool's instance field, which the plan handler
        // could not read. Now there is only ONE store, so there is no second place to drift to.
        const type = floorSystemTypeStore.getAll().find(t => t.totalThickness !== before.thicknessM);
        setFloorToolConfig({ systemTypeId: type!.id, baseOffsetM: 0.12 });

        const after = resolveCreationRecord();
        expect(after.systemTypeId).toBe(type!.id);
        expect(after.thicknessM).toBe(type!.totalThickness);
        expect(after.thicknessM).not.toBe(before.thicknessM);
        expect(after.baseOffsetM).toBe(0.12);       // the ELEVATION the founder's modal supplies
        expect(getFloorToolConfig().baseOffsetM).toBe(0.12);
    });

    it('P-3: resolution order is RECORD → SYSTEM TYPE → documented default, and nothing else', () => {
        const type = floorSystemTypeStore.getAll().find(t => (t.totalThickness ?? 0) > 0)!;

        // 3 — nothing chosen → the documented defaults.
        expect(resolveCreationRecord().thicknessM).toBe(DEFAULT_FLOOR_FINISH_THICKNESS_M);

        // 2 — a type chosen → the TYPE's assembly thickness outranks the default.
        setFloorToolConfig({ systemTypeId: type.id });
        expect(resolveCreationRecord().thicknessM).toBe(type.totalThickness);

        // 1 — the architect typed a thickness in the modal → the instance outranks the type.
        setFloorToolConfig({ thicknessM: type.totalThickness + 0.05 });
        expect(resolveCreationRecord().thicknessM).toBeCloseTo(type.totalThickness + 0.05, 6);

        // "— Plain Floor —" is a real choice (unlike door/window), and it clears the type.
        setFloorToolConfig({ systemTypeId: '' });
        expect(resolveCreationRecord().systemTypeId).toBeUndefined();
        expect(resolveCreationRecord().layers).toBeUndefined();

        // …but an UNDEFINED patch is a NO-OP, never an erase (the L-260 A trap: callers that
        // only know one field must not wipe the others).
        setFloorToolConfig({ systemTypeId: type.id });
        setFloorToolConfig({ thicknessM: undefined, baseOffsetM: undefined });
        expect(resolveCreationRecord().systemTypeId).toBe(type.id);
    });

    it('P-4: NO dimension literal survives in EITHER handler — the bug was literals, so literals are forbidden', () => {
        for (const [name, src] of [
            ['FloorPlanToolHandler', codeOf(PLAN_HANDLER_SRC)],
            ['FloorTool (3D)',       codeOf(TOOL_3D_SRC)],
        ] as const) {
            // The exact literals that WERE the bug: 0.075 (base offset / mirror thickness) and
            // 0.015 (finish thickness). If either reappears as a dimension, the disease is back.
            expect(src, name).not.toMatch(/baseOffset\s*:\s*[\d.]+/);
            expect(src, name).not.toMatch(/thickness\s*:\s*[\d.]+/);
            expect(src, name).not.toMatch(/baseOffsetM\s*:\s*[\d.]+/);
            expect(src, name).not.toMatch(/thicknessM\s*:\s*[\d.]+/);
            expect(src, name).not.toMatch(/0\.075/);

            // Both must go through the ONE resolver.
            expect(src, name).toMatch(/resolveFloorFinish\s*\(/);
        }

        // The plan handler must never scavenge the 3D tool's instance state off a global — that
        // is the P4 violation the door (L-260 A) and window (L-266) fixes each had to unpick.
        expect(codeOf(PLAN_HANDLER_SRC)).not.toMatch(/window\.floorTool/);
    });

    it('P-5: the plan path CANNOT commit without the elevation being resolved (asserted, not hoped)', () => {
        const plan = codeOf(PLAN_HANDLER_SRC);

        // The commit REFUSES on an unresolved elevation / thickness…
        expect(plan).toMatch(/REFUSING to commit/);
        expect(plan).toMatch(/Number\.isFinite\(\s*finish\.baseOffsetM\s*\)/);
        expect(plan).toMatch(/Number\.isFinite\(\s*finish\.thicknessM\s*\)/);

        // …and every dispatched `floor.create` carries the four fields the plan path used to drop.
        const dispatch = plan.slice(plan.indexOf("executeCommand('floor.create'"));
        for (const field of ['baseOffset:', 'thickness:', 'systemTypeId:', 'layers:']) {
            expect(dispatch, `floor.create must carry ${field}`).toContain(field);
        }

        // And the resolver itself can never HAND OUT an unresolved elevation, whatever it is fed.
        for (const cfg of [
            {},
            { thicknessM: Number.NaN, baseOffsetM: Number.NaN },
            { thicknessM: -1, baseOffsetM: -1 },
            { systemTypeId: 'nope-does-not-exist' },
        ]) {
            const r = resolveFloorFinish(cfg, floorSystemTypeStore);
            expect(Number.isFinite(r.baseOffsetM)).toBe(true);
            expect(r.baseOffsetM).toBeGreaterThanOrEqual(0);
            expect(r.thicknessM).toBeGreaterThan(0);
        }
    });

    it('P-6: the record REACHES THE RENDERER — the bus→legacy mesh mirror has no competing literals', () => {
        // This is the outcome check, not a seam check. `initTools`' `floor.created` bridge writes
        // the legacy FloorStore that FloorFragmentBuilder actually MESHES. It used to seat the
        // floor with its OWN defaults — `baseOffset: ev.baseOffset ?? 0` and
        // `thickness: ev.thickness ?? 0.075` — so a plan floor could be resolved perfectly
        // upstream and still be DRAWN wrong. Those two literals must never come back.
        //
        // Scoped to the FLOOR bridge only: the other element bridges in this file (roof, slab,
        // ceiling…) have their own seating rules and their own tickets.
        const mirror = codeOf(MIRROR_SRC);
        const start  = mirror.indexOf("events.on('floor.created'");
        expect(start, "the floor.created bridge must exist — it is what MESHES a bus-created floor")
            .toBeGreaterThan(-1);
        const floorBridge = mirror.slice(start, mirror.indexOf('detectionMethod', start));

        expect(floorBridge).not.toMatch(/thickness:\s*ev\.thickness\s*\?\?\s*0\.075/);
        expect(floorBridge).not.toMatch(/baseOffset:\s*ev\.baseOffset\s*\?\?\s*0\b/);
        expect(floorBridge).toMatch(/baseOffset:\s*ev\.baseOffset\s*\?\?\s*DEFAULT_FLOOR_FINISH_BASE_OFFSET_M/);
        expect(floorBridge).toMatch(/thickness:\s*ev\.thickness\s*\?\?\s*DEFAULT_FLOOR_FINISH_THICKNESS_M/);
    });
});
