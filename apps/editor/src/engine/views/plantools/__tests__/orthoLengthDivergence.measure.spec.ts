// @vitest-environment happy-dom
//
// §RULING-ORTHO-IS-THE-PERPENDICULAR-FOOT — ONE ORTHO GESTURE, ONE WALL LENGTH,
// MEASURED IN MILLIMETRES ACROSS BOTH PANES.
//
// ⭐ FOUNDER RULING, 2026-08-24: **PROJECTION — the perpendicular foot.** The endpoint
// tracks the cursor's perpendicular foot on the axis. Moving the cursor SIDEWAYS does
// not change the wall's length; moving ALONG the axis grows it. (AutoCAD/Revit.)
//
// His reasoning is his own earlier ruling turned back on itself — ORTHO IS A MODE, NOT
// AN AID. Under the rule this replaces, a wall could GROW out of a cursor motion with
// ZERO component along its own axis — ARM 2 below is exactly that gesture: axial frozen
// at 4.000 m, perpendicular swept to 3.9 m, rotation 4000 → 5587 mm. That is the mode
// REINTERPRETING a magnitude the user never made along that axis. Projection constrains
// the gesture; rotation reinterpreted it.
//
// ⚠ AN EARLIER DRAFT ILLUSTRATED THIS WITH "a 5 m drag at 80° still gives a 5 m wall".
// THAT IS WRONG, and ARM 1's own table refutes it: at 80° the NEARER cardinal is the
// other axis, so the drag is nearly AXIAL and the two rules differ by only 76 mm. The
// worst case is 45° at 1464 mm, where the two axes are equidistant.
//
// ⚠ HE WAS SHOWN THE COST AND CHOSE IT ANYWAY. The census (below) put the 3-D wall
// tool ALONE on projection — 1 of 8 — so the ruling moved SEVEN paths, not one, and it
// reverses part of a 2026-08-06 directive of his own. ⛔ Do not "simplify" back toward
// the cheaper migration.
//
// ── WHAT THIS FILE WAS, AND WHY IT READS AS A DIFF ─────────────────────────────
//
// It was §ORTHO-TWO-LENGTHS: a MEASUREMENT that pinned a divergence and asked for a
// decision (commit 3936601d). Every assertion has now INVERTED — the numbers it
// recorded are kept in the comments as the "before" column, because the pre-ruling
// figures are what make the post-ruling zeros mean anything:
//
//   ONE 5.000 m DRAG, both surfaces at exactly 0.000° off axis, PRE-RULING:
//     cursor  0°  PLAN 5000  3-D 5000  Δ    0 mm
//     cursor 15°  PLAN 5000  3-D 4830  Δ  170 mm
//     cursor 30°  PLAN 5000  3-D 4330  Δ  670 mm
//     cursor 44°  PLAN 5000  3-D 3597  Δ 1403 mm
//     cursor 45°  PLAN 5000  3-D 3536  Δ 1464 mm   ← worst, 29.3% of the drag
//     cursor 60°  PLAN 5000  3-D 4330  Δ  670 mm
//     cursor 80°  PLAN 5000  3-D 4924  Δ   76 mm
//   POST-RULING: Δ = 0 at every angle, to the micrometre.
//
//   SIDEWAYS MOTION, axial frozen at 4.000 m, PRE-RULING:
//     perp 0.0 m  PLAN 4000   perp 2.0 m  PLAN 4472   perp 3.9 m  PLAN 5587 mm
//   POST-RULING: 4000 mm throughout, in both panes.
//
// ⚠ BOTH RULES ARE EXACTLY 0.000° OFF AXIS. That is why every assertion here is in
// MILLIMETRES: no angle-based test in this lane could see this defect, and all of them
// passed on both sides of it.
//
// ── THE CENSUS, AND WHICH OF THE 8 PATHS MOVED ─────────────────────────────────
//
// CHANGED — 7 tools, via 3 entry points that now all delegate to ONE kernel function:
//   1. `geometry-slab/boundaryPath.orthoConstrain`  → and with it, riding that call:
//   2. `SlabTool` (3-D)          3. `FloorPlanToolHandler`
//   4. `CeilingPlanToolHandler`  5. `PoolPlanToolHandler`
//   6. `BoundaryLinePlanToolHandler`
//   7. `WallPlanToolHandler._snapOrtho`        (private copy → adapter)
//   8. `CurtainWallPlanToolHandler._snapOrtho` (private copy → adapter)
// UNCHANGED IN BEHAVIOUR — it already projected, and is now the same function:
//   9. `WallTool._applyOrthoLock` / `orthoLockXZ` (the 3-D wall tool)
//
// ⭐ IT WAS NEVER A "PLAN vs 3-D" SPLIT. `SlabTool` is a 3-D tool and it ROTATED; the
// 3-D WALL tool was the outlier, and the split ran between it and its own neighbours.
//
// ── DELIBERATELY OUT OF SCOPE — NAMED, SO THEY ARE NOT A NINTH SEMANTICS ──────
//
//   · `StairCreationController._snapOrtho` — returns a UNIT DIRECTION and never touches
//     a magnitude, so it cannot disagree about length. Nothing to harmonise.
//   · `geometry-slab/SlabSnapUtils.snapToAxisOrDiagonal` — the 45°/90° assist on
//     SlabTool's **LINEAR** branch, not its ortho branch (`SlabTool.ts:1002-1016`).
//     A different mode with its own history.
//   · `apps/editor/src/ui/geospatial/orthoSnap.resolveOrthoSnap` — the site-boundary
//     map tool. RELATIVE to the previous edge (not world cardinals), in SCREEN PIXELS,
//     with a ±8° tolerance band. It already PROJECTS, so it agrees with the ruling.
//   · `file-format/import/dxf/DxfToBimTracer.snapToAxis` — an IMPORT heuristic over
//     file geometry, not a user gesture.
//   · `WallPlanToolHandler._snapAngle` (the configurable degree-step lock) — STILL
//     ROTATES. ⚠ REPORTED, NOT CHANGED: the founder ruled on ORTHO, it does not share
//     this code path, and at step 90° it now disagrees with ortho by the same 1464 mm.
//     That is a separate behaviour with its own history and its own decision.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@pryzm/schemas', async importOriginal => ({
    ...(await importOriginal<Record<string, unknown>>()),
    createId: (p: string) => `${p}_ORTHOLEN`,
}));
vi.mock('@pryzm/snapping', () => ({ computeWallAlignmentInference: () => null }));

import { WallPlanToolHandler } from '../WallPlanToolHandler';
import type { WorldPoint } from '../PlanToolHandler';
import { orthoLockXZ, offAxisDeg } from '@pryzm/geometry-wall';
import { orthoConstrain } from '@pryzm/geometry-slab';

const START = { x: 0, z: 0 };
const SEG_START: WorldPoint = { worldX: 0, worldZ: 0 };

/** Drive the REAL plan handler in ORTHO and return the committed end point. */
function planCommittedEnd(cursor: WorldPoint): { x: number; z: number } {
    const dispatched: Array<{ baseLine: ReadonlyArray<{ x: number; z: number }> }> = [];
    const w = window as unknown as Record<string, unknown>;
    w.runtime = {
        bus: {
            executeCommand: (n: string, p: { baseLine: ReadonlyArray<{ x: number; z: number }> }) => {
                if (n === 'wall.create') dispatched.push(p);
                return Promise.resolve();
            },
        },
    };
    w.wallModePicker = { getActiveMode: () => 'ortho', getAngleStep: () => 15 };
    w.__pryzmPlanWallAlignInference = false;
    w.wallStore = { getAll: () => [] };

    const h = new WallPlanToolHandler();
    const a = h as unknown as Record<string, unknown>;
    a._ctx = { viewDef: { spatial: { levelId: 'L0' } } };
    a._dimInput = { isActive: false, getLengthMeters: () => null, reset() {}, dispose() {} };
    a._drawWallPreview = () => {};
    a._drawSetOutPreviewOnly = () => {};
    a._syncCreationHud = () => {};
    a._clearOverlay = () => {};

    h.onClick(SEG_START);
    h.onMouseMove(cursor);
    h.onClick(cursor);
    expect(dispatched).toHaveLength(1);
    const e = dispatched[0]!.baseLine[1]!;
    return { x: e.x, z: e.z };
}

const lenMm = (p: { x: number; z: number }) => Math.hypot(p.x - START.x, p.z - START.z) * 1000;

describe('§RULING-ORTHO-IS-THE-PERPENDICULAR-FOOT — one ortho gesture, one length, both panes', () => {
    // ── ARM 1 — THE TABLE THE FOUNDER RULED FROM, NOW AT PARITY ──────────────────
    it('ARM 1: one cursor → ONE committed length in both panes, 0 mm apart at every angle', () => {
        const REACH_M = 5;
        const rows: string[] = [];
        let worstDeltaMm = 0;
        let worstDeg = 0;

        for (const deg of [0, 5, 15, 30, 44, 45, 60, 80, 89]) {
            const rad = deg * Math.PI / 180;
            const cursor: WorldPoint = {
                worldX: REACH_M * Math.cos(rad),
                worldZ: REACH_M * Math.sin(rad),
            };
            const planEnd = planCommittedEnd(cursor);
            const threeDEnd = orthoLockXZ(START, { x: cursor.worldX, z: cursor.worldZ });

            const planMm = lenMm(planEnd);
            const threeDMm = lenMm(threeDEnd);
            const deltaMm = planMm - threeDMm;
            if (Math.abs(deltaMm) > Math.abs(worstDeltaMm)) { worstDeltaMm = deltaMm; worstDeg = deg; }

            // BOTH are exactly on axis. An angle test cannot see this defect.
            expect(offAxisDeg(START, planEnd), `plan @ ${deg} deg`).toBeLessThan(1e-9);
            expect(offAxisDeg(START, threeDEnd), `3-D @ ${deg} deg`).toBeLessThan(1e-9);

            rows.push(
                `  cursor ${String(deg).padStart(2)} deg @ 5.000 m ` +
                `(${cursor.worldX.toFixed(3)}, ${cursor.worldZ.toFixed(3)})  ` +
                `PLAN ${planMm.toFixed(0).padStart(5)} mm   ` +
                `3-D ${threeDMm.toFixed(0).padStart(5)} mm   ` +
                `delta ${deltaMm.toFixed(0).padStart(5)} mm`,
            );
        }

        console.log(
            '[ORTHO42 LEN ARM 1] ONE 5.000 m DRAG, ORTHO ARMED, BOTH TOOLS 0.000 deg OFF AXIS:\n' +
            rows.join('\n') +
            `\n  WORST divergence ${worstDeltaMm.toFixed(0)} mm at ${worstDeg} deg ` +
            `(${(worstDeltaMm / (REACH_M * 1000) * 100).toFixed(1)}% of the drag)`,
        );

        // ⭐ THE RULING, IN ONE ASSERTION: one gesture, ONE length, in both panes.
        // PRE-RULING this read `toBeCloseTo(1464)` — the divergence. It is now ZERO
        // to the micrometre at every angle in the sweep.
        expect(worstDeltaMm).toBeLessThan(1e-6);
    });

    // ── ARM 2 — THE PROPERTY THE RULING BOUGHT, ISOLATED ───────────────────
    it('ARM 2: PURELY PERPENDICULAR cursor motion changes NEITHER wall length', () => {
        // The cleanest statement of the difference. The cursor's AXIAL component is
        // frozen at 4.000 m; only the perpendicular offset moves. Under PROJECT the
        // wall cannot change — the endpoint is the perpendicular foot. Under ROTATE
        // the wall grows out of a motion with ZERO component along it.
        const AXIAL_M = 4;
        const rows: string[] = [];
        for (const perp of [0, 0.5, 1, 2, 3, 3.9]) {
            const cursor: WorldPoint = { worldX: AXIAL_M, worldZ: perp };
            const planMm = lenMm(planCommittedEnd(cursor));
            const threeDMm = lenMm(orthoLockXZ(START, { x: AXIAL_M, z: perp }));
            rows.push(
                `  perpendicular offset ${perp.toFixed(1)} m (axial frozen at 4.000 m)  ` +
                `PLAN ${planMm.toFixed(0).padStart(5)} mm   3-D ${threeDMm.toFixed(0).padStart(5)} mm`,
            );
            // 3-D: unchanged, always the axial component. This is the invariant
            // "moving sideways does nothing" that PROJECT buys.
            expect(threeDMm, `3-D @ perp ${perp}`).toBeCloseTo(AXIAL_M * 1000, 6);
        }
        console.log('[ORTHO42 LEN ARM 2] SIDEWAYS MOTION, ZERO AXIAL CHANGE:\n' + rows.join('\n'));

        // ⭐ THE PROPERTY THE RULING BOUGHT. PRE-RULING the plan wall grew 4000 → 5587 mm
        // out of a motion with NO axial component at all; the assertion here was
        // `expect(at39 - at0).toBeGreaterThan(1500)`. It is now ZERO: sideways motion
        // moves the endpoint not at all, in BOTH panes.
        const at0 = lenMm(planCommittedEnd({ worldX: AXIAL_M, worldZ: 0 }));
        const at39 = lenMm(planCommittedEnd({ worldX: AXIAL_M, worldZ: 3.9 }));
        expect(at0).toBeCloseTo(4000, 6);
        expect(at39).toBeCloseTo(4000, 6);
        expect(Math.abs(at39 - at0)).toBeLessThan(1e-6);
    });

    // ── ARM 3 — THE MIRROR CLAIM, VERIFIED NOT ASSUMED ───────────────────────
    it('ARM 3: the plan handler and the slab family are the SAME function now (7 tools, one semantic)', () => {
        // `boundaryPath.ts` CLAIMS `orthoConstrain` is "a verbatim mirror of
        // WallPlanToolHandler._snapOrtho". The census by COUNT is only sound if that
        // claim is TRUE, so it is measured rather than quoted.
        for (const [x, z] of [[3, 4], [5, 1], [-2, 7], [1.5, -1.5], [-6, -0.2]]) {
            const planEnd = planCommittedEnd({ worldX: x!, worldZ: z! });
            const slabEnd = orthoConstrain(START, { x: x!, z: z! });
            expect(planEnd.x, `x @ (${x},${z})`).toBeCloseTo(slabEnd.x, 9);
            expect(planEnd.z, `z @ (${x},${z})`).toBeCloseTo(slabEnd.z, 9);
        }
        console.log('[ORTHO42 LEN ARM 3] plan _snapOrtho === geometry-slab orthoConstrain on 5 fixtures');
    });

    // ── ARM 4 — THE TRIPWIRE ─────────────────────────────────────────────────
    it('ARM 4: PARITY is PINNED — neither side may drift away from the ruling', () => {
        // If either implementation drifts off the ruling, this goes RED and names
        // which side moved. It was a DIVERGENCE tripwire before the ruling; it is a
        // PARITY tripwire now, and it is the same three lines either way.
        const cursor = { x: 3, z: 4 };                       // |cursor| = 5, ~53 deg → +Z
        const slabFamily = orthoConstrain(START, cursor);    // 7 tools ride this
        const wall3D = orthoLockXZ(START, cursor);           // the 3-D wall tool
        // PRE-RULING: 5000 mm vs 4000 mm, a 1000 mm disagreement on this fixture.
        expect(lenMm(slabFamily)).toBeCloseTo(4000, 6);
        expect(lenMm(wall3D)).toBeCloseTo(4000, 6);
        expect(Math.abs(lenMm(slabFamily) - lenMm(wall3D))).toBeLessThan(1e-6);
        console.log('[ORTHO42 LEN ARM 4] cursor (3,4): slab-family 4000 mm · 3-D wall 4000 mm · delta 0 mm');
    });
});
