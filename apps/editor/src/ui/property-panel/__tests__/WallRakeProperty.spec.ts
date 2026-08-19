/**
 * @file apps/editor/src/ui/property-panel/__tests__/WallRakeProperty.spec.ts
 *
 * §WALL-RAKE — the authoring surface for a wall's vertical angle (ADR-0310).
 *
 * The feature shipped WITHOUT a UI control on purpose (C65 §3.9 — no affordance
 * without a wired implementation), because `WallStore` REFUSES a non-vertical
 * rake on three wall shapes. This suite pins the thing that made the control
 * safe to add: the panel reports the SAME refusal the store makes, with a reason,
 * instead of offering a box whose value is silently discarded.
 *
 * ⚠ An enabled field over a refusing store is worse than no field. The user types
 * 75, presses Apply, and the wall stays vertical with nothing said — a refusal and
 * a success rendered identically. That is §CONTEXT-DATA-HONESTY, the defect behind
 * L-716, L-752 and L-779.
 */
import { describe, it, expect } from 'vitest';
import { generateDescriptors } from '../PropertyDescriptorGenerator';
import { RAKE_MIN_DEG, RAKE_MAX_DEG, RAKE_VERTICAL_DEG } from '@pryzm/geometry-wall';

const straightWall = (over: Record<string, unknown> = {}) => ({
    id: 'wall_1',
    elementType: 'wall',
    height: 2.8,
    baseOffset: 0,
    ...over,
});

const rakeRow = (el: Record<string, unknown>) =>
    generateDescriptors(el).find(d => d.key === 'rakeAngleDeg');

describe('§WALL-RAKE — the row exists and is authorable on a plain wall', () => {
    it('offers an editable Vertical Angle row in the INSTANCE section', () => {
        const row = rakeRow(straightWall());
        expect(row).toBeDefined();
        expect(row!.editable).toBe(true);
        expect(row!.section).toBe('instance');
        // Instance, NOT definition — a type edit propagates to every instance
        // (C65 §3.6), and one leaning feature wall must not tilt its whole type.
        expect(row!.category).toBe('instance');
        expect(row!.hint).toBeUndefined();
    });

    it('carries the bounds from the ONE authority, not re-typed literals', () => {
        const row = rakeRow(straightWall())!;
        expect(row.min).toBe(RAKE_MIN_DEG);
        expect(row.max).toBe(RAKE_MAX_DEG);
        // Guards the constants themselves: if someone "simplifies" the source of
        // truth, 90 must remain inside the authorable range or vertical walls
        // become unauthorable.
        expect(RAKE_VERTICAL_DEG).toBeGreaterThan(RAKE_MIN_DEG);
        expect(RAKE_VERTICAL_DEG).toBeLessThan(RAKE_MAX_DEG);
    });

    it('is labelled for an architect, not for the codebase', () => {
        // "Rake" is jargon; the panel is read by people who draw buildings.
        expect(rakeRow(straightWall())!.label).toBe('Vertical Angle');
        expect(rakeRow(straightWall())!.unit).toBe('°');
    });
});

describe('§WALL-RAKE — the store refusals are MIRRORED, with a reason', () => {
    // §RAKE-HOSTED-OPENING (founder 2026-08-18) — 'hosts an opening' left this
    // table. The store stopped refusing that case, and a panel that kept greying
    // the row out would have shipped the feature UNREACHABLE: the store accepts
    // the edit, the user cannot make it. A stale mirror is not a safe mirror.
    // ⚠ THIS TABLE IS NOW EMPTY OF SHAPE-BASED REFUSALS, AND THAT IS THE FINDING.
    //
    // It has lost a row to every lane that BUILT the thing it refused: `{openings}` to
    // §RAKE-HOSTED-OPENING, `{layers}` to §FEAT-RAKE-LAYERED, `layered + opening` to
    // §FEAT-RAKE-LAYERED-OPENINGS (L-1064), and `curved` to §FEAT-RAKE-CURVED under the
    // founder's 2026-08-19 mandate. **No wall SHAPE greys the Vertical Angle control any
    // more.**
    //
    // The one refusal that survives is not a shape but a NUMBER — a curved lean deeper
    // than the wall's own turn radius — and this PANEL CANNOT RAISE IT. The panel judges a
    // selected wall without resolving its centreline, so it supplies neither `height` nor
    // `curveMinRadiusM`, and `rakeAuthorability` answers "unjudgeable ⇒ allow". That is
    // the correct answer for this caller and it is asserted below rather than left
    // implicit, because the alternative — a panel that greys out every curved wall to be
    // safe — is exactly the stale-mirror defect this spec was written to catch.
    const CASES: ReadonlyArray<readonly [string, Record<string, unknown>, RegExp]> = [];

    for (const [name, shape, expected] of CASES) {
        it(`${name}: read-only AND says why`, () => {
            const row = rakeRow(straightWall(shape))!;
            expect(row.editable).toBe(false);
            // ⚠ The REASON is the point. `editable:false` alone is a silent
            // refusal — indistinguishable from "derived" or "broken".
            expect(row.hint).toBeTruthy();
            expect(row.hint).toMatch(expected);
        });
    }

    it('§FEAT-RAKE-CURVED — a CURVED wall is now EDITABLE in the panel', () => {
        // The founder asked for curved raked walls by name. A panel that kept greying the
        // control out would ship the feature unreachable while every geometry test passed
        // — the §AUTHORED-BUT-UNWIRED failure this file exists to prevent.
        expect(rakeRow(straightWall({ curve: { bulge: 0.4 } }))!.editable).toBe(true);
    });

    it('L-1064 — a LAYERED wall that hosts an opening is editable, at ONE layer and at THREE', () => {
        // Asserted at both counts together: the arm that stood here was off by one
        // (`layers.length > 1`) against a body path entered on `> 0`, so the panel greyed
        // out the three-layer wall and offered the one-layer wall for geometry that is
        // identical.
        expect(rakeRow(straightWall({ layers: [{ t: 0.2 }], openings: ['door_1'] }))!.editable).toBe(true);
        expect(rakeRow(straightWall({
            layers: [{ t: 0.1 }, { t: 0.1 }, { t: 0.05 }], openings: ['door_1'],
        }))!.editable).toBe(true);
    });

    it('the panel does NOT invent the collapse refusal it cannot judge', () => {
        // A curved wall whose lean WOULD collapse is still editable HERE, because the
        // panel holds no radius. The refusal belongs to the write boundary that does
        // (`UpdateWallsRakeBatchCommand` supplies `height` + `curveMinRadiusM`). A panel
        // that guessed would refuse walls that build correctly.
        expect(rakeRow(straightWall({ curve: { bulge: 4 } }))!.editable).toBe(true);
    });

    it('a layered wall with a SINGLE layer is still authorable', () => {
        // The refusal is about layers being measured perpendicular; one layer has
        // no stack to re-thicken. Over-refusing would quietly remove the feature
        // from most real walls.
        expect(rakeRow(straightWall({ layers: [{ t: 0.2 }] }))!.editable).toBe(true);
    });

    it('§FEAT-RAKE-LAYERED — a MULTI-layer wall with no openings is authorable in the PANEL', () => {
        // The founder's feature has to be reachable from the control the founder uses.
        // The panel mirrors `rakeAuthorability`, so a stale mirror here would leave the
        // Vertical Angle field greyed out on every layered wall and the whole lane would
        // be unreachable from the UI while every geometry test passed.
        expect(rakeRow(straightWall({ layers: [{ t: 0.1 }, { t: 0.075 }, { t: 0.0125 }] }))!.editable)
            .toBe(true);
        expect(rakeRow(straightWall({ layers: [{ t: 0.1 }, { t: 0.1 }], openings: [] }))!.editable)
            .toBe(true);
    });

    it('an EMPTY openings array does not refuse', () => {
        // A wall that once hosted a door and no longer does must not stay locked.
        expect(rakeRow(straightWall({ openings: [] }))!.editable).toBe(true);
    });

    it('§RAKE-HOSTED-OPENING — a wall that HOSTS a door is authorable, with no hint', () => {
        // The founder's request, at the surface he types into. This is the
        // assertion that would have caught "shipped but unreachable": every
        // store-level test could be green while this row stayed grey.
        const row = rakeRow(straightWall({ openings: ['door_1'], childrenIds: ['door_1'] }))!;
        expect(row.editable).toBe(true);
        expect(row.hint).toBeUndefined();
    });

    it('POSITIVE CONTROL — a plain wall is NOT refused, so the cases above mean something', () => {
        // If the gate refused everything, all the assertions above would pass
        // while the feature was entirely unreachable. This is the L-774 lesson:
        // a check that cannot distinguish is decoration.
        const row = rakeRow(straightWall())!;
        expect(row.editable).toBe(true);
        expect(row.hint).toBeUndefined();
    });
});

describe('§WALL-RAKE — the gate is scoped to walls', () => {
    it('does not add the row to other element types', () => {
        // `openings`/`layers` exist on slabs too; the rake gate must not leak.
        const slab = generateDescriptors({ id: 's1', elementType: 'slab', thickness: 0.2 });
        expect(slab.find(d => d.key === 'rakeAngleDeg')).toBeUndefined();
    });
});
