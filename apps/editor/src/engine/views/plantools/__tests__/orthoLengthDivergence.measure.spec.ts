// @vitest-environment happy-dom
//
// §ORTHO-TWO-LENGTHS — ONE GESTURE, TWO WALL LENGTHS, MEASURED IN MILLIMETRES.
//
// ⛔ THIS SPEC CHANGES NOTHING. It MEASURES a divergence that exists on today's HEAD
// and pins it so neither side can move without a decision. The founder rules on which
// semantic survives; his standing rule for spatial behaviour is ASK, never auto-edit.
//
// ── THE TWO RULES ────────────────────────────────────────────────────────────
//
//   ROTATE  (`WallPlanToolHandler._snapOrtho`, `geometry-slab/orthoConstrain`)
//           snap the DIRECTION to the nearest cardinal, PRESERVE the radial
//           distance |cursor − start|.  "The length you drag is the length you get."
//
//   PROJECT (`WallTool._applyOrthoLock` → `orthoLockXZ`)
//           drop the perpendicular component; the endpoint is the perpendicular
//           FOOT on the nearer axis.  The AutoCAD/Revit ortho convention.
//
// Both are exactly 0.000° off axis. They differ only in LENGTH — which is why an
// angle-based test can never see this, and why every assertion here is in mm.
//
// ── THE CENSUS (MEASURED FROM SOURCE, 2026-08-24) ───────────────────────────
//
// ROTATE — 7 tools, 3 implementations:
//   · `geometry-slab/boundaryPath.orthoConstrain`  ← consumed by SlabTool (3-D!),
//     FloorPlanToolHandler, CeilingPlanToolHandler, PoolPlanToolHandler,
//     BoundaryLinePlanToolHandler
//   · `WallPlanToolHandler._snapOrtho`             ← private copy, same maths
//   · `CurtainWallPlanToolHandler._snapOrtho`      ← private copy, same maths
//
// PROJECT — 1 tool, 1 implementation:
//   · `WallTool._applyOrthoLock` / `orthoLockXZ`   ← the 3-D wall tool, alone
//
// NOT COMPARABLE: `StairCreationController._snapOrtho` returns a UNIT DIRECTION and
// never touches a magnitude, so it cannot disagree about length.
//
// ⭐⭐ THIS IS NOT A "PLAN vs 3-D" SPLIT. `SlabTool` is a 3-D tool and it ROTATES.
// The 3-D WALL tool is the outlier — 1 of 8 — and the split runs between it and
// everything else, including its own 3-D neighbours.
//
// ⭐⭐ AND ROTATE IS NOT AN ACCIDENT. `boundaryPath.ts` was written on 2026-08-06 on
// a founder directive — "During SLAB creation, FLOOR FINISH creation and CEILING
// creation I want the SAME OPTIONS as during WALL creation" — and the floor and
// ceiling handlers, which until then PROJECTED, were deliberately CHANGED to rotate
// because projection "is not what the wall tool does". `boundaryPath.test.ts` pins it
// green today: "A 45° drag of length 5 must give a 5 m axis segment — NOT the 3.53 m
// the old floor/ceiling projection produced."

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

describe('§ORTHO-TWO-LENGTHS — the same ortho gesture commits two different lengths', () => {
    // ── ARM 1 — THE TABLE THE FOUNDER DECIDES FROM ───────────────────────────
    it('ARM 1: one cursor, two committed lengths — the divergence in millimetres', () => {
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

        // THE FINDING, pinned: the plan wall is never SHORTER, and at 45 deg it is
        // 1464 mm longer on a 5 m drag — 29% of the gesture.
        expect(worstDeltaMm).toBeCloseTo(5000 - 5000 * Math.cos(Math.PI / 4), 6);
        expect(worstDeltaMm).toBeGreaterThan(1400);
    });

    // ── ARM 2 — THE PROPERTY THE COORDINATOR IDENTIFIED, ISOLATED ────────────
    it('ARM 2: PURELY PERPENDICULAR cursor motion LENGTHENS the plan wall and not the 3-D one', () => {
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

        // PLAN: grows monotonically out of a motion with no axial component at all.
        const at0 = lenMm(planCommittedEnd({ worldX: AXIAL_M, worldZ: 0 }));
        const at39 = lenMm(planCommittedEnd({ worldX: AXIAL_M, worldZ: 3.9 }));
        expect(at0).toBeCloseTo(4000, 6);
        expect(at39).toBeCloseTo(Math.hypot(4, 3.9) * 1000, 6);
        expect(at39 - at0).toBeGreaterThan(1500);   // +1583 mm from pure sideways motion
    });

    // ── ARM 3 — THE MIRROR CLAIM, VERIFIED NOT ASSUMED ───────────────────────
    it('ARM 3: the plan handler and the slab family really are the SAME rule (7 tools, one semantic)', () => {
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
    it('ARM 4: the divergence is PINNED — neither side may move without a decision', () => {
        // If someone "harmonises" either implementation without the founder ruling,
        // this goes RED and names which side moved. That is the whole point: today's
        // state is a KNOWN, DECLARED disagreement, not an accident nobody noticed.
        const cursor = { x: 3, z: 4 };                       // |cursor| = 5, ~53 deg → +Z
        const rotate = orthoConstrain(START, cursor);
        const project = orthoLockXZ(START, cursor);
        expect(lenMm(rotate)).toBeCloseTo(5000, 6);          // ROTATE keeps the 5 m drag
        expect(lenMm(project)).toBeCloseTo(4000, 6);         // PROJECT keeps the 4 m z-component
        expect(lenMm(rotate) - lenMm(project)).toBeCloseTo(1000, 6);
        console.log('[ORTHO42 LEN ARM 4] cursor (3,4): ROTATE 5000 mm · PROJECT 4000 mm · delta 1000 mm');
    });
});
