// @vitest-environment happy-dom
//
// §SHEET-SURVIVES-CLOSE-AND-REOPEN (L-3800) — the save → clear → load round-trip.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// The founder, 2026-08-21: *"sheets must survive project close and reopen —
// today they apparently do not."*
//
// ⚠ THE BRIEF'S PREMISE DID NOT SURVIVE MEASUREMENT, AND THAT IS RECORDED
// RATHER THAN QUIETLY DROPPED. The lane was briefed to WIRE the two snapshot
// legs on the model of `analysisLayout.ts` (L-3007), whose header states the
// rule this suite exists to hold: *a half-wired field — written on save,
// dropped on load — is STRICTLY WORSE than a browser-local one, because it
// looks persistent and silently is not.*
//
// Both legs were already wired. Measured before writing a line of fix:
//
//   grep -n "sheet" packages/persistence-client/src/loader/ProjectSerializer.ts
//     → :916  `sheets: sheetStore.serialize() as ProjectSnapshot['sheets'],`
//   grep -n "sheet" packages/persistence-client/src/loader/ProjectLoader.ts
//     → :1191 `sheetStore.deserialize((snapshot as any).sheets);`
//
// and the SECOND serializer/loader pair under `apps/editor/src/engine/persistence/`
// carries the same two calls (`ProjectSerializer.ts:1459`, `ProjectLoader.ts:2166`).
// So this is C01 §6 rule 6 in its exact form: the capability is not ABSENT, and
// "wire it" would have been a fix for a defect that is not there. ABSENT and
// UNREACHABLE have opposite fixes, and writing the second one for the first
// produces a duplicate leg, not a working feature.
//
// ── WHAT THIS SUITE THEREFORE DOES ──────────────────────────────────────────
// It PINS the round-trip that already works, field by field, so the next lane
// cannot quietly regress it — and so that "sheets persist" is a measured claim
// with an executable witness rather than a reading of two grep hits. It runs
// the founder's exact sequence: build a sheet, SAVE (serialize), CLEAR (reset —
// the same call `projectScopeRegistry` makes on project close), LOAD
// (deserialize), assert the sheet came back.
//
// ⛔ THE PER-FIELD ASSERTIONS ARE THE POINT, not the sheet count. A snapshot
// that restores a sheet whose viewports lost their `crop` and `scale` has
// restored a DIFFERENT DRAWING under the same name — which is the half-wired
// failure one level down, and the level at which it is actually plausible here,
// because `crop` (L-1840) and per-placement `scale` are the two youngest fields
// on `SheetViewport`.
//
// Contracts: C05 (persistence & file format) · C01 §6 rule 6 (measure before
// claiming absence).

import { describe, it, expect, beforeEach } from 'vitest';
import { sheetStore } from '@pryzm/core-app-model';

const SHEET_ID = 'sheet-roundtrip-1';

const CROP = { minX: -4.5, minZ: -2.25, maxX: 11.75, maxZ: 6.5 } as const;

/**
 * A sheet carrying every field the founder can author from the sheet editor:
 * two viewports, one cropped, both at a non-default scale, at real positions.
 *
 * ⛔ BUILT THROUGH THE REAL STORE API — `create` / `addViewport` /
 * `updateViewportCrop` — never by injecting a literal into the private map. A
 * fixture assembled by hand can carry a shape the product cannot actually
 * produce, and then the round-trip is proved for a sheet that never exists
 * [fake-more-capable-than-real]. These are the same three methods the sheet
 * commands call.
 *
 * Positions are deliberately NOT (0,0): a `position` that round-trips as zero
 * is indistinguishable from a `position` that was dropped and re-defaulted by
 * the `viewIds[]` migration branch in `SheetStore.deserialize`.
 */
function buildSheet(): void {
    sheetStore.create({
        id:          SHEET_ID,
        sheetNumber: 'A001',
        name:        'Sheet 01',
        revision:    'B',
        titleBlock:  'a1-standard',
        issueDate:   '2026-08-21',
        status:      'draft',
    });
    sheetStore.addViewport(SHEET_ID, {
        id:       'vp-plan',
        viewId:   'view-plan-1',
        position: { x: 120.5, y: 240.25 },
        scale:    50,
    });
    sheetStore.addViewport(SHEET_ID, {
        id:       'vp-elev',
        viewId:   'view-elev-1',
        position: { x: 600, y: 90 },
        scale:    200,
    });
    sheetStore.updateViewportCrop(SHEET_ID, 'vp-elev', { ...CROP });
}

describe('§SHEET-SURVIVES-CLOSE-AND-REOPEN (L-3800)', () => {
    beforeEach(() => {
        sheetStore.reset();
    });

    it('restores the sheet after save → clear → load', () => {
        buildSheet();
        expect(sheetStore.getAll()).toHaveLength(1);

        // SAVE — the exact call `ProjectSerializer` makes.
        const snapshot = sheetStore.serialize();

        // CLOSE — the exact call `projectScopeRegistry` makes on project close
        // (`SheetStore.ts`: `clear: () => sheetStore.reset()`).
        sheetStore.reset();
        expect(sheetStore.getAll()).toHaveLength(0);

        // REOPEN — the exact call `ProjectLoader` makes.
        sheetStore.deserialize(snapshot);

        const restored = sheetStore.get(SHEET_ID);
        expect(restored).toBeDefined();
        expect(restored!.name).toBe('Sheet 01');
        expect(restored!.sheetNumber).toBe('A001');
        expect(restored!.revision).toBe('B');
        expect(restored!.titleBlock).toBe('a1-standard');
    });

    it('restores every viewport field, not merely the viewport count', () => {
        buildSheet();
        const snapshot = sheetStore.serialize();
        sheetStore.reset();
        sheetStore.deserialize(snapshot);

        const restored = sheetStore.get(SHEET_ID);
        expect(restored!.viewports).toHaveLength(2);

        const plan = restored!.viewports.find(v => v.id === 'vp-plan');
        expect(plan).toBeDefined();
        expect(plan!.viewId).toBe('view-plan-1');
        // A dropped position re-defaults to {0,0} via the viewIds[] migration
        // branch — which is why these are asserted as VALUES, not as truthiness.
        expect(plan!.position).toEqual({ x: 120.5, y: 240.25 });
        expect(plan!.scale).toBe(50);

        const elev = restored!.viewports.find(v => v.id === 'vp-elev');
        expect(elev).toBeDefined();
        expect(elev!.position).toEqual({ x: 600, y: 90 });
        expect(elev!.scale).toBe(200);
    });

    it('restores the per-placement crop (L-1840) — a lost crop is a different drawing', () => {
        buildSheet();
        const snapshot = sheetStore.serialize();
        sheetStore.reset();
        sheetStore.deserialize(snapshot);

        const elev = sheetStore.get(SHEET_ID)!.viewports.find(v => v.id === 'vp-elev');
        expect(elev!.crop).toEqual({ ...CROP });

        // And an UNCROPPED viewport must not acquire one. `crop: undefined` and
        // `crop: {0,0,0,0}` are opposite statements — the second is a degenerate
        // rectangle the composer REFUSES as 'bad-crop'.
        const plan = sheetStore.get(SHEET_ID)!.viewports.find(v => v.id === 'vp-plan');
        expect(plan!.crop).toBeUndefined();
    });

    it('survives a JSON transit — the snapshot crosses the wire as text', () => {
        // `serialize()` is structurally cloned into the project snapshot and
        // written as JSON. A field that survives an in-memory round-trip but not
        // `JSON.parse(JSON.stringify(...))` (a Map, a Date, an undefined-valued
        // key) would pass every assertion above and still be lost on a real save.
        buildSheet();
        const wire = JSON.parse(JSON.stringify(sheetStore.serialize()));
        sheetStore.reset();
        sheetStore.deserialize(wire);

        const restored = sheetStore.get(SHEET_ID);
        expect(restored).toBeDefined();
        expect(restored!.viewports).toHaveLength(2);
        expect(restored!.viewports.find(v => v.id === 'vp-elev')!.crop)
            .toEqual({ ...CROP });
    });

    it('refuses a malformed snapshot rather than clearing the sheets it holds', () => {
        // A loader that treats "unreadable snapshot" as "no sheets" deletes the
        // user's work on a version skew. `deserialize` returns early on a bad
        // shape, BEFORE `this._sheets.clear()`.
        buildSheet();
        sheetStore.deserialize(null);
        sheetStore.deserialize({ version: 99, sheets: [] });
        sheetStore.deserialize({ version: 1, sheets: 'not-an-array' });

        expect(sheetStore.get(SHEET_ID)).toBeDefined();
    });
});
