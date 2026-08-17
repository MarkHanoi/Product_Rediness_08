// @vitest-environment happy-dom
//
// L-935 — §FIX-ORTHO-YIELDS-TO-OBJECT-SNAP.
//
// FOUNDER REPORT (2026-08-17, PRODUCTION): draw a wall polyline in ORTHOGONAL mode;
// on the SECOND segment place the second point by snapping to the MIDPOINT of an
// existing wall that is NOT aligned with the orthogonal projection of the segment
// being drawn. "The wall reaches the requested point — and narrows progressively as
// it approaches it."
//
// ── WHAT WAS MEASURED, AND WHAT IT REFUTED ───────────────────────────────────
//
// The orchestrator's hypothesis was that the wall is "built as a QUADRILATERAL from
// two independently-solved side lines, rather than as a CENTRELINE plus a constant
// half-thickness". That is REFUTED, and ARM C below keeps the evidence permanently:
// in the exact scene the defect produced, every footprint side corner sits at exactly
// ±halfThickness from its own centreline (worst deviation 0.0000 mm), and the same
// holds once the two walls actually meet (ARM B). `buildMiterPrism` cannot taper
// either — it projects BOTH side corners ALONG the wall direction from ±halfT offsets,
// so its two faces are parallel by construction. The wall never had two thicknesses.
//
// What it had was an END POINT 636 mm from where the user clicked. Ortho constrains
// the segment's DIRECTION; the midpoint snap constrains its END POINT; the input is
// OVER-CONSTRAINED and §STRICT-ORTHO resolved that silently in favour of ortho:
//
//     snapped midpoint  (3.949434, -0.634011)
//     committed end     (4.000000,  0.000000)   ← pre-fix
//     MISS              636.0 mm      committed angle 0.000°, true angle -9.120°
//
// 636 mm is the same figure the founder's trace reports §DIAG-PARTITION-REACH
// rescuing as a "dangling gap" — the emitter placing the end wrong, with a downstream
// rescuer papering over it. (Honest note: the fixture's off-axis angle was chosen to
// land on that number, so the match confirms the MECHANISM reaches it at plausible
// geometry — it does not independently recover the founder's angle.) A wall ending
// 636 mm past the wall it was meant to meet CROSSES it at a shallow angle, and the
// interpenetrating bands are what read as a wedge in plan.
//
// THE DECISION: the strong object snap WINS and ortho is dropped for that segment —
// which is what `PlanToolHandler.ts` already declares ("an explicit object snap always
// wins"), what the angle-step branch of the same function already did, and what
// §STRICT-ORTHO contradicted with no contract, ADR or SPEC behind it. And the tool
// SAYS SO, with both numbers.
//
// ── THE MEASURE, AND WHY IT IS NOT |sL − sR| ─────────────────────────────────
//
// `|sL − sR|` is NOT the thickness: at a mitred end the two corners slide ALONG their
// own face lines, so that distance legitimately exceeds the thickness on an oblique
// cut. The invariant that separates a legitimate miter from a taper is the SIGNED
// PERPENDICULAR OFFSET of each side corner from the wall's own centreline: a wall has
// ONE thickness ⟺ every left corner is at +halfT and every right corner at −halfT.
//
// Tolerances are CONSUMED from `@pryzm/geometry-kernel` (C73 §2.2) — never minted here.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@pryzm/schemas', async importOriginal => ({
    ...(await importOriginal<Record<string, unknown>>()),
    createId: (p: string) => `${p}_L935GUEST`,
}));
// Alignment inference is linear-mode only and would not run in ortho anyway; stubbed
// so the ortho ↔ snap conflict is measured in isolation.
vi.mock('@pryzm/snapping', () => ({ computeWallAlignmentInference: () => null }));

import { WallPlanToolHandler } from '../WallPlanToolHandler';
import type { WorldPoint } from '../PlanToolHandler';
import { WallPipelineV2Cache, buildWallFootprint, type LevelWallSpec } from '@pryzm/geometry-wall';
import { COINCIDENT_M } from '@pryzm/geometry-kernel';

// ── The scenario, stated in numbers ───────────────────────────────────────────
//
// The second segment starts at the origin. The user's cursor lands on the MIDPOINT
// of an existing wall that sits 9.12° off the +x ortho ray at 4 m.
const SEG_START: WorldPoint = { worldX: 0, worldZ: 0 };
const SNAP_DIST_M = 4;
const SNAP_OFF_AXIS_DEG = 9.12;
const DEG = Math.PI / 180;

/** The midpoint the user snapped to — NOT on the ortho ray. */
const M = {
    x: SNAP_DIST_M * Math.cos(-SNAP_OFF_AXIS_DEG * DEG),
    z: SNAP_DIST_M * Math.sin(-SNAP_OFF_AXIS_DEG * DEG),
};

// The existing (host) wall, centred on M and running at 25° — deliberately NOT
// aligned with the ortho projection of the segment being drawn (the founder's word).
const HOST_DIR_DEG = 25;
const HOST_HALF_LEN_M = 1.5;
const HOST_DIR = { x: Math.cos(HOST_DIR_DEG * DEG), z: Math.sin(HOST_DIR_DEG * DEG) };
const HOST_START = { x: M.x - HOST_DIR.x * HOST_HALF_LEN_M, z: M.z - HOST_DIR.z * HOST_HALF_LEN_M };
const HOST_END   = { x: M.x + HOST_DIR.x * HOST_HALF_LEN_M, z: M.z + HOST_DIR.z * HOST_HALF_LEN_M };

const THICKNESS_M = 0.2;

/** The pre-fix committed end — kept so ARM C measures the DEFECT's own scene. */
const PRE_FIX_END = { x: SNAP_DIST_M, z: 0 };

interface Dispatched {
    readonly baseLine: ReadonlyArray<{ x: number; y: number; z: number }>;
    readonly thickness: number;
}

/** Drive the REAL handler; capture every `wall.create` it dispatches. */
function harness(mode: string) {
    const dispatched: Dispatched[] = [];
    const w = window as unknown as Record<string, unknown>;
    w.runtime = {
        bus: {
            executeCommand: (name: string, payload: Dispatched) => {
                if (name === 'wall.create') dispatched.push(payload);
                return Promise.resolve();
            },
        },
    };
    w.wallModePicker = { getActiveMode: () => mode, getAngleStep: () => 15 };
    w.__pryzmPlanWallAlignInference = false;
    w.wallStore = {
        getAll: () => [{
            id: 'wall_L935HOST',
            levelId: 'L0',
            baseLine: [{ x: HOST_START.x, z: HOST_START.z }, { x: HOST_END.x, z: HOST_END.z }],
            thickness: THICKNESS_M,
        }],
    };

    const h = new WallPlanToolHandler();
    const anyH = h as unknown as Record<string, unknown>;
    anyH._ctx = { viewDef: { spatial: { levelId: 'L0' } } };
    anyH._dimInput = { isActive: false, getLengthMeters: () => null, reset() {}, dispose() {} };
    // Canvas-bound draws are not the subject; the geometry decision is.
    anyH._drawWallPreview = () => {};
    anyH._drawSetOutPreviewOnly = () => {};
    anyH._syncCreationHud = () => {};
    anyH._clearOverlay = () => {};
    return { h, dispatched, anyH };
}

/**
 * Draw one segment ending on `pt`, and capture the dropped-constraint note AS THE
 * PREVIEW HOLDS IT — i.e. after the mouse-move resolve and before the commit clears
 * it. That is where the note lives and where the chip reads it; `_commitWall`
 * deliberately nulls it afterwards so it can never outlive the point it describes.
 */
function drawSecondPoint(mode: string, pt: WorldPoint) {
    const { h, dispatched, anyH } = harness(mode);
    h.onClick(SEG_START);
    h.onMouseMove(pt);
    const noteAtPreview = anyH._orthoYield as { missM: number; offAxisDeg: number } | null;
    h.onClick(pt);
    return { dispatched, anyH, noteAtPreview };
}

/** Signed perpendicular offset of `p` from the infinite line through a→b, LEFT positive. */
function perpOffset(
    a: { x: number; z: number },
    b: { x: number; z: number },
    p: { x: number; z: number },
): number {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L = Math.hypot(dx, dz) || 1;
    // LEFT perpendicular of (dx,dz) is (-dz, dx) — same convention as WallFootprint2D.
    return ((p.x - a.x) * -dz + (p.z - a.z) * dx) / L;
}

/**
 * Run the LIVE junction pipeline over a scene and report, per wall, the perpendicular
 * offset of each footprint side corner from that wall's own centreline.
 */
function measureFootprints(scene: readonly LevelWallSpec[]) {
    const cache = new WallPipelineV2Cache();
    cache.refresh(scene);
    const halfT = (t: number) => t / 2;
    const lines: string[] = [];
    let worstDeviationM = 0;
    let mitredCorners = 0;

    for (const spec of scene) {
        const wallInput = cache.getWall(spec.id);
        if (!wallInput) throw new Error(`no WallInput for ${spec.id}`);
        const miter = cache.getMiter(spec.id);
        const fp = buildWallFootprint(wallInput, miter);
        const h = halfT(spec.thickness);
        const dx = spec.endXZ.x - spec.startXZ.x;
        const dz = spec.endXZ.z - spec.startXZ.z;
        const L = Math.hypot(dx, dz) || 1;
        const leftP = { x: -dz / L, z: dx / L };
        // Read the four side corners EXACTLY as `buildWallFootprint` reads them,
        // including its documented endLeft/endRight swap at the END.
        const corners: Array<[string, { x: number; z: number } | undefined, { x: number; z: number }, number]> = [
            ['sL', miter?.startLeft,  { x: spec.startXZ.x + leftP.x * h, z: spec.startXZ.z + leftP.z * h }, +h],
            ['sR', miter?.startRight, { x: spec.startXZ.x - leftP.x * h, z: spec.startXZ.z - leftP.z * h }, -h],
            ['eL', miter?.endRight,   { x: spec.endXZ.x   + leftP.x * h, z: spec.endXZ.z   + leftP.z * h }, +h],
            ['eR', miter?.endLeft,    { x: spec.endXZ.x   - leftP.x * h, z: spec.endXZ.z   - leftP.z * h }, -h],
        ];
        for (const [name, mitred, fallback, expected] of corners) {
            if (mitred) mitredCorners++;
            const off = perpOffset(spec.startXZ, spec.endXZ, mitred ?? fallback);
            const dev = Math.abs(off - expected);
            worstDeviationM = Math.max(worstDeviationM, dev);
            lines.push(
                `${spec.id}.${name}: ${mitred ? 'MITRED    ' : 'square-cap'} ` +
                `perpOffset=${(off * 1000).toFixed(3)} mm ` +
                `(expected ${(expected * 1000).toFixed(1)} mm, deviation ${(dev * 1000).toFixed(3)} mm)`,
            );
        }
        lines.push(`${spec.id}: polygon vertices=${fp.polygon.length} invalid=${!!fp.invalid}`);
    }
    return { worstDeviationM, mitredCorners, report: lines.join('\n') };
}

const hostSpec: LevelWallSpec = {
    id: 'wall_L935HOST', startXZ: HOST_START, endXZ: HOST_END, thickness: THICKNESS_M,
};
const guestSpec = (end: { x: number; z: number }): LevelWallSpec => ({
    id: 'wall_L935GUEST', startXZ: { x: 0, z: 0 }, endXZ: end, thickness: THICKNESS_M,
});

describe('L-935 §FIX-ORTHO-YIELDS-TO-OBJECT-SNAP — ortho direction vs midpoint-snap end', () => {
    beforeEach(() => { vi.restoreAllMocks(); });

    // ── ARM A — THE TOOL: which constraint wins ──────────────────────────────
    it('ARM A: the wall LANDS ON the snapped midpoint, and ortho is the constraint dropped', () => {
        const snapped: WorldPoint = { worldX: M.x, worldZ: M.z, snapType: 'midpoint' };
        const { dispatched, noteAtPreview } = drawSecondPoint('ortho', snapped);

        expect(dispatched).toHaveLength(1);
        const end = dispatched[0]!.baseLine[1]!;
        const missM = Math.hypot(end.x - M.x, end.z - M.z);
        const committedAngleDeg = Math.atan2(end.z - SEG_START.worldZ, end.x - SEG_START.worldX) / DEG;

        console.log(
            '[L-935 ARM A] committedEnd=(%s, %s)  snappedMidpoint=(%s, %s)  MISS=%s mm  angle=%s°',
            end.x.toFixed(6), end.z.toFixed(6), M.x.toFixed(6), M.z.toFixed(6),
            (missM * 1000).toFixed(6), committedAngleDeg.toFixed(3),
        );

        // THE FIX: the explicit object snap is honoured EXACTLY. Pre-fix this was 636.0 mm.
        expect(missM).toBeLessThan(COINCIDENT_M);
        // …and the segment therefore takes the TRUE direction to the snap, not the ortho ray.
        expect(committedAngleDeg).toBeCloseTo(-SNAP_OFF_AXIS_DEG, 9);

        // AND IT SAID SO, with both numbers — the dropped constraint is on the record,
        // not resolved behind the user's back.
        expect(noteAtPreview).not.toBeNull();
        // The gap ortho WOULD have opened is the defect's own 636 mm.
        expect(noteAtPreview!.missM * 1000).toBeCloseTo(636.0, 1);
        expect(noteAtPreview!.offAxisDeg).toBeCloseTo(SNAP_OFF_AXIS_DEG, 9);
    });

    it('ARM A/control: angle-step mode was ALREADY doing this — the branches now agree', () => {
        // `_resolveConstrainedPoint`'s angle-step branch has always been guarded with
        // `!isStrongSnap(pt)`. Ortho was the only branch that was not. This pins the
        // agreement so the two cannot drift apart again.
        const snapped: WorldPoint = { worldX: M.x, worldZ: M.z, snapType: 'midpoint' };
        const { dispatched } = drawSecondPoint('angle', snapped);
        expect(dispatched).toHaveLength(1);
        const end = dispatched[0]!.baseLine[1]!;
        expect(Math.hypot(end.x - M.x, end.z - M.z)).toBeLessThan(COINCIDENT_M);
    });

    it('ARM A/inertness: with NO strong snap, ortho still locks the direction exactly', () => {
        // The fix must not weaken ortho for ordinary free-hand drawing. A bare cursor
        // point — and the low-priority 'nearest' fallback, which `isStrongSnap` excludes
        // by name — both stay under the 90° lock.
        for (const pt of [
            { worldX: M.x, worldZ: M.z } as WorldPoint,
            { worldX: M.x, worldZ: M.z, snapType: 'nearest' } as WorldPoint,
        ]) {
            const { dispatched, noteAtPreview } = drawSecondPoint('ortho', pt);
            expect(dispatched).toHaveLength(1);
            const end = dispatched[0]!.baseLine[1]!;
            // Ortho-locked to +x at the cursor's own distance — byte-identical to pre-fix.
            expect(end.x).toBeCloseTo(SNAP_DIST_M, 12);
            expect(end.z).toBeCloseTo(0, 12);
            // Nothing was dropped, so nothing is claimed.
            expect(noteAtPreview).toBeNull();
        }
    });

    it('ARM A/agreement: a strong snap ALREADY ON the ortho ray reports no dropped constraint', () => {
        // Both constraints agree here, so there is no conflict to decide and nothing to
        // announce. Guards against the chip/log firing on every ordinary ortho snap.
        const onRay: WorldPoint = { worldX: SNAP_DIST_M, worldZ: 0, snapType: 'endpoint' };
        const { dispatched, noteAtPreview } = drawSecondPoint('ortho', onRay);
        expect(dispatched).toHaveLength(1);
        const end = dispatched[0]!.baseLine[1]!;
        expect(end.x).toBeCloseTo(SNAP_DIST_M, 12);
        expect(end.z).toBeCloseTo(0, 12);
        expect(noteAtPreview).toBeNull();
    });

    // ── ARM B — THE DERIVED SOLID, as the tool now produces it ───────────────
    it('ARM B: the wall the tool now commits meets the host AND keeps ONE thickness', () => {
        const snapped: WorldPoint = { worldX: M.x, worldZ: M.z, snapType: 'midpoint' };
        const { dispatched } = drawSecondPoint('ortho', snapped);
        const bl = dispatched[0]!.baseLine;
        const scene = [hostSpec, guestSpec({ x: bl[1]!.x, z: bl[1]!.z })];

        const { worstDeviationM, mitredCorners, report } = measureFootprints(scene);
        console.log('[L-935 ARM B]\n' + report);
        console.log('[L-935 ARM B] mitred corners=%d  WORST deviation from ±halfT = %s mm',
            mitredCorners, (worstDeviationM * 1000).toFixed(4));

        // The T-junction the founder was drawing now actually forms…
        expect(mitredCorners).toBeGreaterThan(0);
        // …and every side corner still sits at exactly ±halfT: ONE thickness. The fix
        // buys the reach WITHOUT trading it for the thickness defect it was accused of.
        expect(worstDeviationM).toBeLessThan(COINCIDENT_M);
    });

    // ── ARM C — THE REFUTATION, kept permanently ─────────────────────────────
    it('ARM C: even the DEFECT\'s own scene had one thickness — the taper hypothesis is refuted', () => {
        // This is the scene §STRICT-ORTHO produced: the guest ends at (4, 0), 636 mm from
        // the host it was meant to meet. If the wall were "a quadrilateral from two
        // independently-solved side lines", THIS is where the two thicknesses would show.
        // They do not — and no junction forms at all, because 636 mm is far outside the
        // 0.20 m junction band. The wall did not taper; it did not arrive.
        const scene = [hostSpec, guestSpec(PRE_FIX_END)];
        const { worstDeviationM, mitredCorners, report } = measureFootprints(scene);
        console.log('[L-935 ARM C]\n' + report);
        console.log('[L-935 ARM C] mitred corners=%d  WORST deviation from ±halfT = %s mm',
            mitredCorners, (worstDeviationM * 1000).toFixed(4));

        expect(mitredCorners).toBe(0);                       // the walls never met
        expect(worstDeviationM).toBeLessThan(COINCIDENT_M);  // and neither of them tapered
    });
});
