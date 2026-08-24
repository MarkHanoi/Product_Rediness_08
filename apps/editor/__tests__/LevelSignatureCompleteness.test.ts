// @vitest-environment happy-dom
//
// §DIAG-INVALIDATION-COMPLETENESS — close the bug CLASS that cost three deploys.
//
// ─── The class ───────────────────────────────────────────────────────────────
// A wall geometry edit must clear THREE hand-written content-addressed gates or
// it is silently ignored:
//
//   1. WallFragmentBuilder._composeCacheKey       (geometry build)
//   2. WallFragmentBuilder._versionForBuild       (plan-projection token)
//   3. WallRebuildCoordinator._levelWallSig       (per-LEVEL no-progress gate)
//
// Gate 3 sits UPSTREAM of the other two: if the level signature does not move,
// `_flush` returns early and NEITHER of the other two ever runs. That is exactly
// what happened with `rakeAngleDeg` (L-813, fixed f5cad681) — the founder reported
// "the wall only gets angled after another element is created or modified", and
// two earlier fixes to gates 1 and 2 changed nothing observable because gate 3
// returned first. Every one of the three keys is maintained BY HAND, and nothing
// enforced that a new geometry field appears in them.
//
// ─── Why this test is behavioural, not textual ───────────────────────────────
// Asserting "the source string of _levelWallSig mentions field X" would pass for
// a field that is read but mis-composed, and would break on any harmless
// refactor. Instead each case MUTATES one field on an otherwise identical wall
// and asserts the signature CHANGES. That is the property we actually depend on:
//
//     different geometry  ⇒  different signature
//
// A new geometry-affecting field added to WallData without being folded into the
// signature will fail here the moment someone adds its case — and the FIELD
// INVENTORY case below fails immediately if a field is added to WallData and not
// listed, which is what makes this a class-closer rather than one more instance.

import { describe, it, expect } from 'vitest';
import { WallRebuildCoordinator } from '../src/engine/WallRebuildCoordinator';

/** Minimal store stub — `_levelWallSig` only calls `getAll()`. */
function storeOf(walls: unknown[]): { getAll(): any[] } {
    return { getAll: () => walls as any[] };
}

/** A complete, geometrically ordinary wall on level L0. */
function baseWall(): Record<string, unknown> {
    return {
        id: 'w1',
        levelId: 'L0',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
        thickness: 0.2,
        height: 3,
        baseOffset: 0,
        openings: [{ offset: 2, width: 0.9, sillHeight: 0, height: 2.1 }],
        layers: [{ thickness: 0.2 }],
        curve: null,
        materialId: 'mat-a',
        materialColor: '#ffffff',
        rakeAngleDeg: 90,
        // §GRAPH43 (L-10806) — present on the fixture at last: the inventory
        // below DECLARED this field while `baseWall()` did not carry it, so the
        // classification was never actually exercised against anything.
        systemTypeId: 'sys-a',
    };
}

/**
 * Reach the private signature the same way production does. Casting is confined
 * to this one helper so the intent stays legible: we are testing an internal
 * invariant deliberately, not leaking the type hole into every case.
 */
function sig(walls: unknown[]): string {
    const coord = Object.create(WallRebuildCoordinator.prototype) as {
        _levelWallSig(levelId: string, store: { getAll(): any[] }): string;
    };
    return coord._levelWallSig('L0', storeOf(walls));
}

/**
 * Every geometry-affecting field, with a mutation that must move the signature.
 * ADD A ROW HERE whenever WallData gains a field that changes built geometry.
 */
const GEOMETRY_FIELDS: Array<{ field: string; mutate: (w: Record<string, unknown>) => void }> = [
    { field: 'baseLine (start)', mutate: w => { (w.baseLine as any[])[0] = { x: 0.5, y: 0, z: 0 }; } },
    { field: 'baseLine (end)',   mutate: w => { (w.baseLine as any[])[1] = { x: 6, y: 0, z: 0 }; } },
    { field: 'thickness',        mutate: w => { w.thickness = 0.3; } },
    { field: 'height',           mutate: w => { w.height = 4; } },
    { field: 'baseOffset',       mutate: w => { w.baseOffset = 0.5; } },
    { field: 'openings.offset',  mutate: w => { (w.openings as any[])[0].offset = 3; } },
    { field: 'openings.width',   mutate: w => { (w.openings as any[])[0].width = 1.2; } },
    { field: 'openings.sill',    mutate: w => { (w.openings as any[])[0].sillHeight = 0.9; } },
    { field: 'openings.height',  mutate: w => { (w.openings as any[])[0].height = 2.4; } },
    { field: 'openings (added)', mutate: w => { (w.openings as any[]).push({ offset: 4, width: 0.6, sillHeight: 1, height: 1.2 }); } },
    { field: 'layers.thickness', mutate: w => { (w.layers as any[])[0].thickness = 0.35; } },
    { field: 'curve',            mutate: w => { w.curve = { control: { x: 2.5, z: -1 }, segments: 24 }; } },
    { field: 'materialId',       mutate: w => { w.materialId = 'mat-b'; } },
    { field: 'materialColor',    mutate: w => { w.materialColor = '#ff0000'; } },
    // The one that cost three deploys. Kept explicitly so a regression is named.
    { field: 'rakeAngleDeg',     mutate: w => { w.rakeAngleDeg = 70; } },
    // ⭐⭐ §GRAPH43-SYSTEMTYPE-IS-A-JUNCTION-INPUT (L-10806) — the fourth
    //    recurrence, and the first where the field was CLASSIFIED AND WRONGLY SO.
    //    It sat in `nonGeometric` below reading *"resolves to layers/thickness,
    //    both covered"*. It does not: it is threaded into the V2 junction solve as
    //    its OWN field and compared directly there, so two walls with identical
    //    layers and thickness resolve their shared corner DIFFERENTLY.
    { field: 'systemTypeId',     mutate: w => { w.systemTypeId = 'sys-b'; } },
];

describe('§DIAG-INVALIDATION-COMPLETENESS — the level signature covers every geometry input', () => {
    it('is stable for an unchanged wall (otherwise every edit is a false positive)', () => {
        expect(sig([baseWall()])).toBe(sig([baseWall()]));
    });

    it.each(GEOMETRY_FIELDS)('changing $field moves the level signature', ({ mutate }) => {
        const before = sig([baseWall()]);
        const w = baseWall();
        mutate(w);
        expect(sig([w])).not.toBe(before);
    });

    it('adding a wall moves the signature (the count prefix)', () => {
        const before = sig([baseWall()]);
        const second = { ...baseWall(), id: 'w2' };
        expect(sig([baseWall(), second])).not.toBe(before);
    });

    it('is order-independent — two walls in either order hash the same', () => {
        const a = baseWall();
        const b = { ...baseWall(), id: 'w2' };
        expect(sig([a, b])).toBe(sig([b, a]));
    });

    it('ignores walls on OTHER levels', () => {
        const other = { ...baseWall(), id: 'w9', levelId: 'L1', thickness: 9 };
        expect(sig([baseWall(), other])).toBe(sig([baseWall()]));
    });

    // ─── The class-closer ────────────────────────────────────────────────────
    // If someone adds a geometry-affecting field to WallData and does not fold it
    // into the signature, the failure mode is SILENT: their edit simply never
    // renders, and they spend three deploys finding out why. This inventory makes
    // that failure LOUD at the moment the field is added, by forcing an explicit
    // decision — cover it above, or declare it non-geometric here.
    it('FIELD INVENTORY — every known WallData field is classified', () => {
        const covered = new Set([
            'baseLine', 'thickness', 'height', 'baseOffset',
            'openings', 'layers', 'curve', 'materialId', 'materialColor',
            'rakeAngleDeg',
            // ⭐ MOVED FROM `nonGeometric` 2026-08-24 (§GRAPH43, L-10806). See the
            //   correction note below — the old reason was measurably false.
            'systemTypeId',
        ]);
        // Fields that legitimately do NOT affect built geometry. Each is listed
        // with the reason, so removing one from this list is a deliberate act.
        const nonGeometric = new Set([
            'id',             // identity, already in the per-wall key
            'levelId',        // selects which signature the wall belongs to
            '_renderVersion', // a counter DERIVED from edits, not an input
            'name', 'metadata', 'locked', 'visible', 'tags',
        ]);

        const declared = new Set([...covered, ...nonGeometric]);
        const present = Object.keys(baseWall());
        const unclassified = present.filter(k => !declared.has(k));

        // ⛔⛔ CORRECTED 2026-08-24 (§GRAPH43-SYSTEMTYPE-IS-A-JUNCTION-INPUT,
        //    L-10806) — `systemTypeId` WAS LISTED HERE AS NON-GEOMETRIC, reading
        //    *"resolves to layers/thickness, both covered"*. **That reason is
        //    measurably false**, and it is worse than an omission: an omission is
        //    an oversight, whereas a wrong classification with a stated reason
        //    reads as a decision somebody already checked.
        //
        //    `systemTypeId` is threaded into the V2 junction solve as its OWN
        //    field (`WallRebuildCoordinator.ts:1909`,
        //    §FIX-WALL-V2-EXISTING-CORNER-IMMUTABLE / L-130 — *"so it freezes an
        //    existing same-type L-corner when a DIFFERENT-type wall joins"*) and
        //    `JunctionResolverV2` compares it directly (`sysTypeOf`, `:418`).
        //    Identical layers + identical thickness + different system type
        //    ⇒ a DIFFERENT resolved corner.
        //
        //    ⚠ And it was never exercised: `baseWall()` did not carry the field,
        //    so `present` never contained it and this inventory passed vacuously
        //    over its own wrong entry. The fixture now carries it.
        expect(
            unclassified,
            `Unclassified WallData field(s): ${unclassified.join(', ')}. ` +
            `If a field changes built geometry it MUST appear in _levelWallSig and get a ` +
            `case in GEOMETRY_FIELDS above — otherwise editing it silently renders nothing ` +
            `(L-813). If it does not, add it to nonGeometric with a reason.`,
        ).toEqual([]);
    });

    /**
     * ⭐⭐ §GRAPH43 (L-10806) — THE CONSEQUENCE THAT REACHES FURTHER THAN PIXELS,
     *    AND THE REASON THIS ONE IS NOT JUST ANOTHER INVENTORY ROW.
     *
     * This gate sits UPSTREAM of everything. When `_flush` returns on it, it never
     * reaches `writeJoinedToEdgesForLevel` (`WallRebuildCoordinator.ts:1958`) — so
     * the `joinedTo` GRAPH keeps edges derived under the old system type.
     * [C71 §3.4](../../../docs/02-decisions/contracts/C71-GRAPH-AND-TOPOLOGY.md)
     * makes stale-edge removal *"part of the writer, not a follow-up"*, and **a
     * writer that never runs cannot remove anything.**
     *
     * That is the `joinedTo` staleness SOURCE this lane was asked to measure
     * before fixing (C85 §10.8, SPEC-LIVING-WALL-RELATIONSHIPS W3) — and it is
     * NOT the mechanism the lane was briefed with. The brief said the writer sits
     * after a no-progress `return`, which is TRUE but is not by itself a defect:
     * if no wall moved, no junction moved either. **The defect is that the gate
     * cannot SEE a change that does move junctions.**
     *
     * ⛔ The fix is therefore in the SIGNATURE, not in the guard's placement.
     * Moving the writer above the `return` would re-open the self-re-arming flush
     * loop L-97 exists to break (see ADR-0129).
     */
    it('§GRAPH43 — a system-type change moves the signature, so the joinedTo writer is reached', () => {
        const a = baseWall();
        const b = baseWall();
        b.systemTypeId = 'sys-b';

        // Same geometry in every other respect — identical layers AND thickness,
        // which is exactly what the old `nonGeometric` reason claimed was enough.
        expect(a.layers).toEqual(b.layers);
        expect(a.thickness).toBe(b.thickness);

        // ⭐ RED before the fix: the two signatures were byte-identical, `anyProgress`
        //   stayed false, `_flush` returned, and the joinedTo edges were never
        //   re-emitted.
        expect(sig([b])).not.toBe(sig([a]));
    });
});
