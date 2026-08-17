// @vitest-environment happy-dom
//
// L-935 — MEASUREMENT ONLY. No fix in this commit.
//
// FOUNDER REPORT (2026-08-17, PRODUCTION): draw a wall polyline in ORTHOGONAL mode;
// on the SECOND segment place the second point by snapping to the MIDPOINT of an
// existing wall that is NOT aligned with the orthogonal projection of the segment
// being drawn. "The wall reaches the requested point — and narrows progressively as
// it approaches it."
//
// The orchestrator's hypothesis to test FIRST:
//   "the wall is being built as a QUADRILATERAL from two independently-solved side
//    lines, rather than as a CENTRELINE plus a constant half-thickness."
//
// This file measures TWO layers and commits the numbers before anything is changed:
//
//   ARM A — THE TOOL. What does `WallPlanToolHandler` actually COMMIT when the two
//           constraints conflict? Ortho constrains the DIRECTION; the midpoint snap
//           constrains the END POINT. The input is over-constrained: the tool must
//           either drop ortho, or refuse the snap. Measured: which (if either) it does,
//           and by how far the committed end MISSES the point the user snapped to.
//
//   ARM B — THE DERIVED SOLID. Feed the scene the tool just produced into the LIVE
//           junction pipeline (`WallPipelineV2Cache` → `JunctionResolverV2` →
//           `buildWallFootprint`) and measure the ONE thing that decides whether the
//           model is geometrically valid: the SIGNED PERPENDICULAR OFFSET of every
//           footprint side-corner from the wall's own centreline. A wall has ONE
//           thickness ⟺ every left corner sits at exactly +halfT and every right
//           corner at exactly −halfT. Anything else IS the taper.
//
//           ⚠ NOTE THE MEASURE. `|sL − sR|` is NOT the thickness: at a mitred end the
//           two corners slide ALONG their own face lines, so that distance legitimately
//           exceeds the thickness on an oblique cut. The perpendicular offset from the
//           centreline is the measure that separates a legitimate miter from a taper.
//
// Tolerances are CONSUMED from `@pryzm/geometry-kernel` (C73 §2.2) — never minted here.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@pryzm/schemas', async importOriginal => ({
    ...(await importOriginal<Record<string, unknown>>()),
    createId: (p: string) => `${p}_L935GUEST`,
}));
// Alignment inference is linear-mode only and would not run in ortho anyway; stubbed
// so ARM A measures the ortho ↔ snap conflict in isolation.
vi.mock('@pryzm/snapping', () => ({ computeWallAlignmentInference: () => null }));

import { WallPlanToolHandler } from '../WallPlanToolHandler';
import type { WorldPoint } from '../PlanToolHandler';
import { WallPipelineV2Cache, buildWallFootprint, type LevelWallSpec } from '@pryzm/geometry-wall';
import { COINCIDENT_M } from '@pryzm/geometry-kernel';

// ── The scenario, stated in numbers ───────────────────────────────────────────
//
// The second segment starts at the origin. The user's cursor lands on the MIDPOINT
// of an existing wall that sits ~9.1° off the +x ortho ray at ~4 m — chosen because
// it reproduces the founder's own trace, which reports a 636 mm dangling gap:
//     miss = 2 · d · sin(θ/2) = 2 · 4 · sin(4.56°) ≈ 0.636 m.
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

interface Dispatched {
    readonly baseLine: ReadonlyArray<{ x: number; y: number; z: number }>;
    readonly thickness: number;
}

/** Drive the REAL handler in ortho mode; capture every `wall.create` it dispatches. */
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
    // The existing host wall, visible to the tool's set-out / reference reads.
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
    return { h, dispatched };
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

describe('L-935 MEASUREMENT — ortho direction vs midpoint-snap end point', () => {
    beforeEach(() => { vi.restoreAllMocks(); });

    // ── ARM A — THE TOOL ─────────────────────────────────────────────────────
    it('ARM A: ortho mode — what the tool COMMITS when the two constraints conflict', () => {
        const { h, dispatched } = harness('ortho');

        h.onClick(SEG_START);

        // The cursor lands on the existing wall's MIDPOINT — a STRONG object snap.
        const snapped: WorldPoint = { worldX: M.x, worldZ: M.z, snapType: 'midpoint' };
        h.onMouseMove(snapped);
        h.onClick(snapped);

        // FACT 1 — did the tool REFUSE the over-constrained input? (0 = refused)
        const committed = dispatched.length;

        // FACT 2 — where did the committed end LAND, and how far is that from the
        //          point the user explicitly snapped to?
        const end = committed > 0 ? dispatched[0]!.baseLine[1]! : null;
        const missM = end ? Math.hypot(end.x - M.x, end.z - M.z) : Number.NaN;

        // FACT 3 — is the committed direction the ortho ray, or the true direction
        //          to the snapped point?
        const committedAngleDeg = end
            ? (Math.atan2(end.z - SEG_START.worldZ, end.x - SEG_START.worldX) / DEG)
            : Number.NaN;
        const trueAngleDeg = Math.atan2(M.z - SEG_START.worldZ, M.x - SEG_START.worldX) / DEG;

        console.log(
            '[L-935 ARM A] dispatched=%d  committedEnd=(%s, %s)  snappedMidpoint=(%s, %s)\n' +
            '              MISS=%s mm   committedAngle=%s°   trueAngleToSnap=%s°',
            committed,
            end?.x.toFixed(6), end?.z.toFixed(6),
            M.x.toFixed(6), M.z.toFixed(6),
            (missM * 1000).toFixed(1),
            committedAngleDeg.toFixed(3),
            trueAngleDeg.toFixed(3),
        );

        // MEASURED STATE — locked as it is TODAY, before any fix.
        expect(committed).toBe(1);                       // the tool does NOT refuse
        expect(end).not.toBeNull();
        // The committed direction IS the ortho ray (0°), not the direction to the snap.
        expect(Math.abs(committedAngleDeg)).toBeLessThan(1e-9);
        // …so the committed end MISSES the snapped midpoint by a construction-scale gap.
        expect(missM).toBeGreaterThan(COINCIDENT_M);
        // The gap is the founder's own order of magnitude (his trace: 636 mm).
        expect(missM * 1000).toBeGreaterThan(500);
    });

    it('ARM A/control: angle-step mode LETS THE STRONG SNAP WIN (no conflict)', () => {
        // `_resolveConstrainedPoint` guards the angle-step branch with `!isStrongSnap(pt)`.
        // Ortho has no such guard (§STRICT-ORTHO). This control proves the asymmetry is
        // real and is the ONLY difference between the two branches.
        const { h, dispatched } = harness('angle');
        h.onClick(SEG_START);
        const snapped: WorldPoint = { worldX: M.x, worldZ: M.z, snapType: 'midpoint' };
        h.onMouseMove(snapped);
        h.onClick(snapped);
        expect(dispatched).toHaveLength(1);
        const end = dispatched[0]!.baseLine[1]!;
        const miss = Math.hypot(end.x - M.x, end.z - M.z);
        console.log('[L-935 ARM A/control] angle-step MISS=%s mm', (miss * 1000).toFixed(6));
        expect(miss).toBeLessThan(COINCIDENT_M);   // the snap is honoured EXACTLY
    });

    // ── ARM B — THE DERIVED SOLID ────────────────────────────────────────────
    it('ARM B: the derived footprint — is every side corner at exactly ±halfT?', () => {
        const { h, dispatched } = harness('ortho');
        h.onClick(SEG_START);
        const snapped: WorldPoint = { worldX: M.x, worldZ: M.z, snapType: 'midpoint' };
        h.onMouseMove(snapped);
        h.onClick(snapped);
        expect(dispatched).toHaveLength(1);
        const guestBl = dispatched[0]!.baseLine;

        // The scene EXACTLY as the store now holds it: the pre-existing host + the
        // wall the tool just committed.
        const scene: LevelWallSpec[] = [
            {
                id: 'wall_L935HOST',
                startXZ: HOST_START,
                endXZ:   HOST_END,
                thickness: THICKNESS_M,
            },
            {
                id: 'wall_L935GUEST',
                startXZ: { x: guestBl[0]!.x, z: guestBl[0]!.z },
                endXZ:   { x: guestBl[1]!.x, z: guestBl[1]!.z },
                thickness: THICKNESS_M,
            },
        ];

        const cache = new WallPipelineV2Cache();
        cache.refresh(scene);

        const halfT = THICKNESS_M / 2;
        const report: string[] = [];
        let worstDeviationM = 0;

        for (const spec of scene) {
            const wallInput = cache.getWall(spec.id);
            expect(wallInput).not.toBeNull();
            const fp = buildWallFootprint(wallInput!, cache.getMiter(spec.id));
            const miter = cache.getMiter(spec.id);

            // The FOUR side corners, read exactly as `buildWallFootprint` reads them
            // (including its documented endLeft/endRight swap).
            const leftP = (() => {
                const dx = spec.endXZ.x - spec.startXZ.x;
                const dz = spec.endXZ.z - spec.startXZ.z;
                const L = Math.hypot(dx, dz) || 1;
                return { x: -dz / L, z: dx / L };
            })();
            const corners: Array<[string, { x: number; z: number }, number]> = [
                ['sL', miter?.startLeft  ?? { x: spec.startXZ.x + leftP.x * halfT, z: spec.startXZ.z + leftP.z * halfT }, +halfT],
                ['sR', miter?.startRight ?? { x: spec.startXZ.x - leftP.x * halfT, z: spec.startXZ.z - leftP.z * halfT }, -halfT],
                ['eL', miter?.endRight   ?? { x: spec.endXZ.x   + leftP.x * halfT, z: spec.endXZ.z   + leftP.z * halfT }, +halfT],
                ['eR', miter?.endLeft    ?? { x: spec.endXZ.x   - leftP.x * halfT, z: spec.endXZ.z   - leftP.z * halfT }, -halfT],
            ];

            for (const [name, pt, expected] of corners) {
                const off = perpOffset(spec.startXZ, spec.endXZ, pt);
                const dev = Math.abs(off - expected);
                worstDeviationM = Math.max(worstDeviationM, dev);
                report.push(
                    `${spec.id}.${name}: perpOffset=${(off * 1000).toFixed(3)} mm ` +
                    `(expected ${(expected * 1000).toFixed(1)} mm, deviation ${(dev * 1000).toFixed(3)} mm)`,
                );
            }
            report.push(`${spec.id}: polygon vertices=${fp.polygon.length} invalid=${!!fp.invalid}`);
        }

        console.log('[L-935 ARM B]\n' + report.join('\n'));
        console.log(
            '[L-935 ARM B] WORST corner deviation from ±halfT = %s mm',
            (worstDeviationM * 1000).toFixed(4),
        );

        // MEASURED STATE. If this passes, the derived solid has ONE thickness and the
        // orchestrator's "two independently-solved side lines" hypothesis is REFUTED
        // at this layer — the defect is then the tool's silent over-constraint (ARM A),
        // not the footprint builder.
        expect(worstDeviationM).toBeLessThan(COINCIDENT_M);
    });

    // ── ARM C — THE GEOMETRY THE FIX WOULD PRODUCE ───────────────────────────
    //
    // ARM B measured the CURRENT (ortho-wins) scene, in which the guest's end lands
    // 636 mm from the host and NO junction forms at all — so it could not, on its own,
    // rule out a taper appearing once the two walls actually MEET. This arm closes that
    // hole: it places the guest's end exactly ON the host's midpoint — the T-junction
    // the founder asked for, and the geometry option (a) would commit — and measures
    // the same invariant. It must hold BEFORE the tool is changed, or option (a) would
    // trade a reach defect for a thickness defect.
    it('ARM C: guest end ON the host midpoint (a real T-junction) — still ±halfT?', () => {
        const scene: LevelWallSpec[] = [
            { id: 'wall_L935HOST',  startXZ: HOST_START,             endXZ: HOST_END,   thickness: THICKNESS_M },
            { id: 'wall_L935GUEST', startXZ: { x: 0, z: 0 },         endXZ: { x: M.x, z: M.z }, thickness: THICKNESS_M },
        ];
        const cache = new WallPipelineV2Cache();
        cache.refresh(scene);

        const halfT = THICKNESS_M / 2;
        const report: string[] = [];
        let worstDeviationM = 0;
        let junctionEnds = 0;

        for (const spec of scene) {
            const wallInput = cache.getWall(spec.id);
            expect(wallInput).not.toBeNull();
            const miter = cache.getMiter(spec.id);
            const fp = buildWallFootprint(wallInput!, miter);
            const dx = spec.endXZ.x - spec.startXZ.x;
            const dz = spec.endXZ.z - spec.startXZ.z;
            const L = Math.hypot(dx, dz) || 1;
            const leftP = { x: -dz / L, z: dx / L };
            const corners: Array<[string, { x: number; z: number } | undefined, { x: number; z: number }, number]> = [
                ['sL', miter?.startLeft,  { x: spec.startXZ.x + leftP.x * halfT, z: spec.startXZ.z + leftP.z * halfT }, +halfT],
                ['sR', miter?.startRight, { x: spec.startXZ.x - leftP.x * halfT, z: spec.startXZ.z - leftP.z * halfT }, -halfT],
                ['eL', miter?.endRight,   { x: spec.endXZ.x   + leftP.x * halfT, z: spec.endXZ.z   + leftP.z * halfT }, +halfT],
                ['eR', miter?.endLeft,    { x: spec.endXZ.x   - leftP.x * halfT, z: spec.endXZ.z   - leftP.z * halfT }, -halfT],
            ];
            for (const [name, mitred, fallback, expected] of corners) {
                if (mitred) junctionEnds++;
                const pt = mitred ?? fallback;
                const off = perpOffset(spec.startXZ, spec.endXZ, pt);
                const dev = Math.abs(off - expected);
                worstDeviationM = Math.max(worstDeviationM, dev);
                report.push(
                    `${spec.id}.${name}: ${mitred ? 'MITRED' : 'square-cap'} ` +
                    `perpOffset=${(off * 1000).toFixed(3)} mm (expected ${(expected * 1000).toFixed(1)} mm, ` +
                    `deviation ${(dev * 1000).toFixed(3)} mm)`,
                );
            }
            report.push(`${spec.id}: polygon vertices=${fp.polygon.length} invalid=${!!fp.invalid}`);
        }

        console.log('[L-935 ARM C]\n' + report.join('\n'));
        console.log(
            '[L-935 ARM C] mitred corners=%d  WORST corner deviation from ±halfT = %s mm',
            junctionEnds, (worstDeviationM * 1000).toFixed(4),
        );

        // The junction MUST actually form — otherwise this arm proves nothing.
        expect(junctionEnds).toBeGreaterThan(0);
        // …and every side corner still sits at exactly ±halfT: ONE thickness.
        expect(worstDeviationM).toBeLessThan(COINCIDENT_M);
    });
});
