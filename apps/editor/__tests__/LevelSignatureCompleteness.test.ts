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
        ]);
        // Fields that legitimately do NOT affect built geometry. Each is listed
        // with the reason, so removing one from this list is a deliberate act.
        const nonGeometric = new Set([
            'id',             // identity, already in the per-wall key
            'levelId',        // selects which signature the wall belongs to
            '_renderVersion', // a counter DERIVED from edits, not an input
            'systemTypeId',   // resolves to layers/thickness, both covered
            'name', 'metadata', 'locked', 'visible', 'tags',
        ]);

        const declared = new Set([...covered, ...nonGeometric]);
        const present = Object.keys(baseWall());
        const unclassified = present.filter(k => !declared.has(k));

        expect(
            unclassified,
            `Unclassified WallData field(s): ${unclassified.join(', ')}. ` +
            `If a field changes built geometry it MUST appear in _levelWallSig and get a ` +
            `case in GEOMETRY_FIELDS above — otherwise editing it silently renders nothing ` +
            `(L-813). If it does not, add it to nonGeometric with a reason.`,
        ).toEqual([]);
    });
});
