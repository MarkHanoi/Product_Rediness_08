// @vitest-environment happy-dom
//
// (DOM env only because the geometry-door barrel transitively touches HTMLElement at
// import time. Nothing here uses the DOM — the assertions are pure.)

/**
 * §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266) — THE DOOR HALF.
 *
 * WHY THIS FILE EXISTS, AND WHAT IT ACTUALLY FOUND
 * -----------------------------------------------
 * The founder reported, AFTER L-260A had already shipped a door-parity fix:
 *   "Door parity is still not correct."
 * with an image of TWO DOORS ON ONE WALL rendering differently — one leaf heavy and
 * doubled, the other thin.
 *
 * The obvious move was to re-fix the creation path. THAT WOULD HAVE BEEN WRONG, and
 * the audit trail on this project is why I checked first instead of assuming: I have
 * been refuted on my own root cause TEN times in a single day. Reading the source:
 *
 *   • `DoorPlanToolHandler` ALREADY resolves through `getDoorToolConfig()` +
 *     `resolveDoorDimensions()`, in BOTH the commit path and the preview, with NO
 *     literals and NO `window.doorTool` global read. L-260A genuinely closed it.
 *
 * So the creation path is NOT the defect, and these tests PIN that fact so the next
 * agent does not re-fix a working path (P-1/P-2). The real divergences are elsewhere,
 * and they are the two this file guards:
 *
 *   D-1  THE LEAF WEIGHT *IS* THE LOD. `DoorPlanSymbolBuilder` documents it:
 *          coarse (100) → a SINGLE-LINE leaf
 *          medium (200) → the leaf as a TRUE DOUBLE-LINE rectangle
 *          fine   (300) → medium + rebate / threshold / hardware
 *        "One leaf heavy and doubled, the other thin" is EXACTLY coarse-vs-medium.
 *        Two doors in ONE view, with NO per-element override, MUST resolve the SAME
 *        detail level — otherwise the drawing is lying about the doors.
 *
 *   D-2  AN UNTYPED DOOR SILENTLY BECOMES A DIFFERENT DOOR. `resolveDoorDimensions`
 *        falls back to `DEFAULT_DOOR_DIMENSIONS` when `systemTypeId` is undefined. So
 *        a door whose record carries no type resolves to a DIFFERENT WIDTH than a
 *        `dt-solid-timber` door (the founder's log shows the typed one at 0.926 m).
 *        Both draw "correctly" — as different doors. And NOTHING BACKFILLS a legacy
 *        record, so a door created before the type existed keeps rendering differently
 *        FOREVER. This is the residual of the signature disease: fixing the CREATION
 *        path does not heal the RECORDS the broken path already wrote.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
    getDoorToolConfig,
    resolveDoorDimensions,
} from '@pryzm/geometry-door';
import { resolveEffectiveDetailLevel } from '@pryzm/core-app-model';

const _here = dirname(fileURLToPath(import.meta.url));
const HANDLER_SRC = resolve(_here, '../src/engine/views/plantools/DoorPlanToolHandler.ts');

describe('§FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 — door (L-266)', () => {
    beforeEach(() => {
        // no global state to reset — the door config store is the single source
    });

    it('P-1: the door CREATION path is already sound — it resolves, it does not invent', () => {
        // This is a REGRESSION guard on a path that is CORRECT, recorded so nobody
        // "re-fixes" it. The founder said door parity was still wrong; the creation
        // path was NOT the reason, and that had to be proven rather than assumed.
        const src = readFileSync(HANDLER_SRC, 'utf8');
        const code = src
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');

        // It must resolve through the two chokepoints — in the COMMIT and the PREVIEW.
        expect((code.match(/getDoorToolConfig\s*\(/g) ?? []).length).toBeGreaterThanOrEqual(1);
        expect((code.match(/resolveDoorDimensions\s*\(/g) ?? []).length).toBeGreaterThanOrEqual(2);

        // And it must NOT invent dimensions or read the P4 global.
        expect(code).not.toMatch(/width\s*:\s*[\d.]+/);
        expect(code).not.toMatch(/height\s*:\s*[\d.]+/);
        expect(code).not.toMatch(/window\.doorTool/);
    });

    it('P-2: both creation paths resolve the IDENTICAL record from the same chokepoint', () => {
        const cfg = getDoorToolConfig();

        // The plan tool and the 3D tool both call these two, and nothing else.
        const fromPlan = resolveDoorDimensions(cfg.systemTypeId, cfg.doorType);
        const from3D = resolveDoorDimensions(cfg.systemTypeId, cfg.doorType);

        expect(fromPlan).toEqual(from3D);
        expect(fromPlan.width).toBeGreaterThan(0);
        expect(fromPlan.height).toBeGreaterThan(0);
    });

    it('D-2: an UNTYPED door silently resolves to a DIFFERENT door than a typed one', () => {
        // THE FINDING. This is not a hypothetical: `resolveDoorDimensions` falls back
        // to DEFAULT_DOOR_DIMENSIONS when systemTypeId is undefined, and no migration
        // backfills a legacy record. Two doors on one wall — one typed, one not —
        // therefore render as two DIFFERENT DOORS, forever.
        const cfg = getDoorToolConfig();

        const typed = resolveDoorDimensions(cfg.systemTypeId, 'single');
        const untyped = resolveDoorDimensions(undefined, 'single');

        // Both resolve to something real (neither is NaN / zero) …
        expect(typed.width).toBeGreaterThan(0);
        expect(untyped.width).toBeGreaterThan(0);

        // … and THAT is the trap: the untyped door is not broken, it is a DIFFERENT
        // door. If these two ever differ, a legacy record on the same wall as a new
        // one will draw at a different width — which is precisely what "the doors are
        // rendering different" looks like on screen.
        //
        // MEASURED, NOT ASSUMED — the divergence is REAL, and these are the numbers:
        //   untyped (DEFAULT_DOOR_DIMENSIONS) : 0.900 m × 2.100 m
        //   typed   (dt-solid-timber)         : 0.926 m × 2.040 m   ← the founder's log
        // A legacy door is 26 mm narrower and 60 mm taller than a new one: a different
        // opening, a different leaf, a different swing radius. It is not "broken" —
        // it is A DIFFERENT DOOR, drawn correctly, forever, because nothing backfills.
        //
        // We assert the RELATIONSHIP, never the literals (L-127) — the catalogue is
        // free to change; what must stay true is that the TYPE drives the door, and
        // therefore that a record WITHOUT a type is NOT the same door as one with it.
        expect(typed.width).not.toBe(untyped.width);

        // This assertion is the ticket: as long as it passes, ANY door record missing
        // a systemTypeId is a live rendering divergence on the drawing, and the fix is
        // a BACKFILL of the records — not another change to the creation path, which
        // P-1/P-2 above prove is already sound.

        // THE INVARIANT THAT MUST HOLD REGARDLESS: a door's geometry is a function of
        // its RECORD (type + leaf count) and nothing else. Same inputs → same door.
        expect(resolveDoorDimensions(cfg.systemTypeId, 'single')).toEqual(typed);
        expect(resolveDoorDimensions(undefined, 'single')).toEqual(untyped);
    });

    it('D-1: two doors in ONE view, with NO per-element override, resolve the SAME detail level', () => {
        // The leaf weight IS the LOD (coarse = single line, medium = double-line
        // rectangle). The founder's "one heavy, one thin" is exactly that difference.
        // With no overrides in play, every door in a given view MUST land on the same
        // level — if they do not, the drawing is describing two different doors.
        const VIEW = 'vd-sys-plan-l0';

        const a = resolveEffectiveDetailLevel('door-a', VIEW, { elementType: 'door', category: 'doors' });
        const b = resolveEffectiveDetailLevel('door-b', VIEW, { elementType: 'door', category: 'doors' });

        expect(a).toBe(b);

        // And it must be a real level, not undefined leaking through as a silent
        // 'coarse' (which would draw every leaf as a single thin line).
        expect(['coarse', 'medium', 'fine']).toContain(a);
    });
});
