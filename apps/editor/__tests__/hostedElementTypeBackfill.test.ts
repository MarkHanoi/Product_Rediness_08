// @vitest-environment happy-dom
//
// happy-dom env: importing @pryzm/command-registry transitively loads
// @pryzm/core-app-model, whose ViewRenderCache attaches window listeners at module load.

/**
 * §FIX-UNTYPED-HOSTED-ELEMENT-BACKFILL (L-274) — THE MIGRATION GUARD.
 *
 * WHAT THIS FILE PROVES, AND WHAT IT REFUTED
 * ------------------------------------------
 * `doorCreationParity.test.ts` (D-2) pins the DISEASE: an untyped door is not broken,
 * it is a DIFFERENT door — and nothing backfills the record, so it stays different
 * forever. This file pins the CURE, and the two facts the cure rests on:
 *
 *   B-0  NO PRODUCER CAN STILL WRITE AN UNTYPED RECORD. Both store-record chokepoints
 *        (`buildDoorStoreRecord` / `buildWindowStoreRecord`) fall back to the ONE tool
 *        config when the caller omits the type, and that config's `systemTypeId` is
 *        structurally non-empty (`setDoorToolConfig` IGNORES an empty patch value). So
 *        even a sloppy creation path — the PDF-import batcher, `CreateWindowInAll-
 *        WindowsCommand`, an AI plan that forgets the field — CANNOT produce a typeless
 *        record. A backfill without closing the source is a treadmill; this asserts the
 *        source IS closed. The ONLY remaining writer of an untyped record is the LOAD /
 *        IMPORT path replaying a legacy `.pryzm` verbatim — which is correct behaviour
 *        (a loader that silently retypes the founder's file is the very thing §3 of the
 *        ticket forbids), and is exactly what this migration exists to answer.
 *
 *   B-1  A LEGACY UNTYPED RECORD MIGRATES TO A TYPED ONE …
 *   B-2  … WITHOUT MOVING THE GEOMETRY. This REFUTES the framing the ticket was written
 *        with (that the founder's doors would jump 0.900 → 0.926 wide). They do not:
 *        `width`/`height`/`offset`/`sillHeight` are PERSISTED ON THE RECORD and every
 *        builder reads them FROM the record — only the PRE-CREATION resolver falls back
 *        to `DEFAULT_DOOR_DIMENSIONS`. Moving them would also desynchronise the record
 *        from the flat `WallData.openings[]` void that actually cuts the wall (C15).
 *        What DOES change is what the TYPE owns — and that is verified at the OUTCOME:
 *
 *   B-3  THE MIGRATED RECORD REACHES THE RENDERER. Asserted through the very calls
 *        `DoorBuilder.buildVisuals` / `DoorPlanSymbolBuilder` make
 *        (`resolveDoorDimensions(record.systemTypeId, record.doorType)` and
 *        `doorSystemTypeStore.getById(record.systemTypeId)`), so the fix cannot be one
 *        that computes a perfect record and then leaves it where nothing reads it.
 *
 *   B-4  ONE UNDO ENTRY, AND IT RESTORES THE ORIGINAL UNTYPED RECORDS EXACTLY (C16).
 *   B-5  THE MIGRATION IS IDEMPOTENT — running it twice changes nothing the second time.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BackfillHostedElementTypesCommand } from '@pryzm/command-registry';
import {
    doorStore,
    doorSystemTypeStore,
    resolveDoorDimensions,
    buildDoorStoreRecord,
    planDoorTypeBackfill,
    resolveDefaultDoorSystemTypeId,
    DEFAULT_DOOR_TOOL_CONFIG,
} from '@pryzm/geometry-door';
import {
    windowStore,
    windowSystemTypeStore,
    buildWindowStoreRecord,
    planWindowTypeBackfill,
    resolveDefaultWindowSystemTypeId,
    DEFAULT_WINDOW_TOOL_CONFIG,
} from '@pryzm/geometry-window';

// A LEGACY record, exactly as a pre-chokepoint creation path (or a legacy `.pryzm`
// replayed through `ProjectLoader`) writes it: real geometry, NO systemTypeId.
const LEGACY_DOOR = {
    id: 'door-legacy-1',
    openingId: 'op-legacy-1',
    wallId: 'wall-1',
    offset: 1.5,
    width: 0.9,          // the DEFAULT_DOOR_DIMENSIONS width — the founder's 0.900 m door
    height: 2.1,
    sillHeight: 0,
    doorType: 'single' as const,
};

const LEGACY_WINDOW = {
    id: 'win-legacy-1',
    openingId: 'op-legacy-w1',
    wallId: 'wall-1',
    offset: 3.0,
    width: 1.2,
    height: 1.2,
    sillHeight: 1.0,
    windowType: 'single' as const,
};

/** Minimal command context — the migration only reads `wallStore.getById().levelId`. */
function makeCtx() {
    return {
        stores: {
            wallStore: { getById: (_id: string) => ({ levelId: 'L0' }) },
        },
    } as unknown as Parameters<BackfillHostedElementTypesCommand['execute']>[0];
}

describe('§FIX-UNTYPED-HOSTED-ELEMENT-BACKFILL (L-274)', () => {
    beforeEach(() => {
        doorStore.clear();
        windowStore.clear();
    });

    it('B-0: NO creation-path producer can write an untyped record — the chokepoints backstop the type', () => {
        // The store-record chokepoint is where EVERY creation path (3D tool, plan tool,
        // batch commands, AI planes, the PDF-import batcher) lands. Hand it an opening
        // with NO systemTypeId — the exact payload `CreateWindowInAllWindowsCommand` and
        // `FloorPlanCommandBatcher` construct — and it must STILL emit a typed record.
        const doorRec = buildDoorStoreRecord({
            opening: { id: 'op-x', elementId: 'door-x', type: 'door', doorType: 'single', offset: 0, width: 0.9, height: 2.1 },
            wallId: 'wall-1',
        });
        expect(typeof doorRec.systemTypeId).toBe('string');
        expect((doorRec.systemTypeId as string).length).toBeGreaterThan(0);

        const winRec = buildWindowStoreRecord({
            opening: { id: 'op-y', elementId: 'win-y', type: 'window', windowType: 'single', offset: 0, width: 1.2, height: 1.2, sillHeight: 1 },
            wallId: 'wall-1',
        });
        expect(typeof winRec.systemTypeId).toBe('string');
        expect((winRec.systemTypeId as string).length).toBeGreaterThan(0);

        // …and the type it backstops with is a REAL catalogue entry, not a dangling id.
        expect(doorSystemTypeStore.getById(doorRec.systemTypeId as string)).toBeDefined();
        expect(windowSystemTypeStore.getById(winRec.systemTypeId as string)).toBeDefined();
    });

    it('the default type comes from the CATALOGUE and is the one the creation path would choose', () => {
        // Not a literal, and not the LIVE tool config (that is the architect's current
        // ribbon pick — a migration must not depend on it). It is the canonical default,
        // validated against the catalogue, so a backfilled door === a newly-drawn door.
        const doorTypeId = resolveDefaultDoorSystemTypeId();
        const winTypeId = resolveDefaultWindowSystemTypeId();

        expect(doorTypeId).toBe(DEFAULT_DOOR_TOOL_CONFIG.systemTypeId);
        expect(winTypeId).toBe(DEFAULT_WINDOW_TOOL_CONFIG.systemTypeId);
        expect(doorSystemTypeStore.getById(doorTypeId!)).toBeDefined();
        expect(windowSystemTypeStore.getById(winTypeId!)).toBeDefined();
    });

    it('B-1/B-2: migrates every untyped record to a typed one WITHOUT moving its geometry', () => {
        doorStore.add({ ...LEGACY_DOOR });
        windowStore.add({ ...LEGACY_WINDOW });

        // The record really is untyped before the migration (the disease).
        expect(doorStore.getById(LEGACY_DOOR.id)!.systemTypeId).toBeUndefined();
        expect(windowStore.getById(LEGACY_WINDOW.id)!.systemTypeId).toBeUndefined();

        const cmd = new BackfillHostedElementTypesCommand();
        expect(cmd.canExecute(makeCtx()).ok).toBe(true);
        const res = cmd.execute(makeCtx());
        expect(res.success).toBe(true);

        const door = doorStore.getById(LEGACY_DOOR.id)!;
        const win = windowStore.getById(LEGACY_WINDOW.id)!;

        // B-1 — typed, from the catalogue.
        expect(door.systemTypeId).toBe(DEFAULT_DOOR_TOOL_CONFIG.systemTypeId);
        expect(win.systemTypeId).toBe(DEFAULT_WINDOW_TOOL_CONFIG.systemTypeId);

        // B-2 — THE GEOMETRY DID NOT MOVE. This is the assertion that refutes the
        // ticket's own framing: the door stays 0.900 m wide, because the RECORD is the
        // instance truth and the wall's void agrees with it (C15).
        expect(door.width).toBe(LEGACY_DOOR.width);
        expect(door.height).toBe(LEGACY_DOOR.height);
        expect(door.offset).toBe(LEGACY_DOOR.offset);
        expect(win.width).toBe(LEGACY_WINDOW.width);
        expect(win.height).toBe(LEGACY_WINDOW.height);
        expect(win.sillHeight).toBe(LEGACY_WINDOW.sillHeight);
        expect(win.offset).toBe(LEGACY_WINDOW.offset);

        // …and NO record anywhere lacks a type any more.
        expect(doorStore.getAll().every(d => !!d.systemTypeId)).toBe(true);
        expect(windowStore.getAll().every(w => !!w.systemTypeId)).toBe(true);

        // The report names what changed, from → to.
        const report = cmd.getReport()!;
        expect(report.doorsMigrated).toBe(1);
        expect(report.windowsMigrated).toBe(1);
        expect(report.doorTypeName.length).toBeGreaterThan(0);
    });

    it('B-3: the migrated record REACHES the renderer — the builders now resolve the TYPE', () => {
        doorStore.add({ ...LEGACY_DOOR });
        windowStore.add({ ...LEGACY_WINDOW });

        // BEFORE: this is what DoorBuilder.buildVisuals + DoorPlanSymbolBuilder compute
        // for the founder's legacy door — the DEFAULT frame/leaf, i.e. a different door.
        const before = doorStore.getById(LEGACY_DOOR.id)!;
        const dimsBefore = resolveDoorDimensions(before.systemTypeId, before.doorType);

        new BackfillHostedElementTypesCommand().execute(makeCtx());

        // AFTER: the SAME calls the builders make now resolve the TYPE's real sections.
        const after = doorStore.getById(LEGACY_DOOR.id)!;
        const dimsAfter = resolveDoorDimensions(after.systemTypeId, after.doorType);
        const sysType = doorSystemTypeStore.getById(after.systemTypeId!)!;

        expect(sysType).toBeDefined();
        // The frame member face width is what the plan symbol draws the jamb ticks at and
        // what the 3D frame is extruded to; the leaf thickness IS the swing-arc clear half.
        expect(dimsAfter.frameThickness).toBe(sysType.dimensions!.frameThickness);
        expect(dimsAfter.leafThickness).toBe(sysType.dimensions!.leafThickness);
        expect(dimsAfter.frameThickness).not.toBe(dimsBefore.frameThickness);

        // The finish the 3D builder colours the mesh with, and the schedule reads.
        expect(after.frameColor).toBe(sysType.frameFinish.materialColor);
        expect(after.leafColor).toBe(sysType.leafFinish.materialColor);
        expect(after.finishMaterial).toBe(sysType.leafFinish.name);
        expect(after.frameFinish?.name).toBe(sysType.frameFinish.name);

        // WINDOW — `columnRatios` is what says WHETHER THERE IS A MULLION AT ALL, and it
        // is stamped from the type. WindowBuilder + WindowPlanSymbolBuilder read it off
        // the record, so this is the outcome, not the seam.
        const winAfter = windowStore.getById(LEGACY_WINDOW.id)!;
        const winType = windowSystemTypeStore.getById(winAfter.systemTypeId!)!;
        if (winType.defaultColumnRatios?.length) {
            expect(winAfter.columnRatios).toEqual([...winType.defaultColumnRatios]);
        }
        expect(winAfter.frameColor).toBe(winType.frameFinish.materialColor);
        expect(winAfter.glassOpacity).toBe(winType.glazingOpacity);
    });

    it('B-4: ONE undo entry restores the ORIGINAL untyped records EXACTLY (C16)', () => {
        doorStore.add({ ...LEGACY_DOOR });
        windowStore.add({ ...LEGACY_WINDOW });

        const doorBefore = structuredClone(doorStore.getById(LEGACY_DOOR.id)!);
        const winBefore = structuredClone(windowStore.getById(LEGACY_WINDOW.id)!);

        const cmd = new BackfillHostedElementTypesCommand();
        cmd.execute(makeCtx());
        expect(doorStore.getById(LEGACY_DOOR.id)!.systemTypeId).toBeDefined();

        // ONE command → ONE undo. `update()` merges and can never UNSET a field, which is
        // why the stores gained `replace()`: the pre-image goes back verbatim.
        const undone = cmd.undo(makeCtx());
        expect(undone.success).toBe(true);

        expect(doorStore.getById(LEGACY_DOOR.id)).toEqual(doorBefore);
        expect(windowStore.getById(LEGACY_WINDOW.id)).toEqual(winBefore);
        expect(doorStore.getById(LEGACY_DOOR.id)!.systemTypeId).toBeUndefined();
        expect(windowStore.getById(LEGACY_WINDOW.id)!.systemTypeId).toBeUndefined();
    });

    it('B-5: the migration is IDEMPOTENT — a second run changes nothing', () => {
        doorStore.add({ ...LEGACY_DOOR });
        windowStore.add({ ...LEGACY_WINDOW });

        new BackfillHostedElementTypesCommand().execute(makeCtx());
        const doorAfterFirst = structuredClone(doorStore.getById(LEGACY_DOOR.id)!);
        const winAfterFirst = structuredClone(windowStore.getById(LEGACY_WINDOW.id)!);

        // The gate refuses (there is nothing left to migrate) …
        const second = new BackfillHostedElementTypesCommand();
        const gate = second.canExecute(makeCtx());
        expect(gate.ok).toBe(false);
        expect(gate.reason).toMatch(/already carries a system type/i);

        // … and even forced through, it is a no-op: nothing is pending.
        expect(planDoorTypeBackfill(doorStore.getAll()).entries).toHaveLength(0);
        expect(planWindowTypeBackfill(windowStore.getAll()).entries).toHaveLength(0);
        second.execute(makeCtx());
        expect(doorStore.getById(LEGACY_DOOR.id)).toEqual(doorAfterFirst);
        expect(windowStore.getById(LEGACY_WINDOW.id)).toEqual(winAfterFirst);
    });

    it('a record that ALREADY carries a type is never touched (no re-typing of the architect’s choice)', () => {
        doorStore.add({ ...LEGACY_DOOR, id: 'door-fd60', openingId: 'op-fd60', systemTypeId: 'dt-fire-rated-60' });
        doorStore.add({ ...LEGACY_DOOR });   // the untyped one

        const plan = planDoorTypeBackfill(doorStore.getAll());
        expect(plan.entries.map(e => e.id)).toEqual([LEGACY_DOOR.id]);

        new BackfillHostedElementTypesCommand().execute(makeCtx());
        expect(doorStore.getById('door-fd60')!.systemTypeId).toBe('dt-fire-rated-60');
    });
});
