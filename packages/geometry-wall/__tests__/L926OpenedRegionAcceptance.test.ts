/**
 * §L-926 ACCEPTANCE — the founder's gesture, end to end, judged by the SYMPTOM.
 *
 * WHAT THE FOUNDER ACTUALLY REPORTED is not a baseline coordinate. It is:
 * *"§OPENED-REGION offering to CREATE a wall along the 2.27 m gap"* on a room
 * that had merged into its neighbour, and *"in this case it is NOT NECESSARY —
 * the interior walls should simply EXTEND."* So the acceptance criterion is the
 * ABSENCE OF THE OFFER, asserted on the detector's own output — not a geometry
 * assertion that stands in for it and hopes.
 *
 * THE FIXTURE, and why this shape. A 12 × 8 m outer rectangle with a full-width
 * partition P at z=4 and an interior stem T rising from P's BODY at x=6 — three
 * rooms (48 / 24 / 24 m²). P is then moved 0.773 m south, the founder's own
 * number. P's junctions are all T-terminations onto the side walls' BODIES, so
 * the gesture involves NO corner incumbent and nothing in it is forbidden by
 * C83 §10.2.2: the only question the fixture asks is whether T follows P.
 *
 * NOTHING IS ASSUMED ABOUT THE ROOMS. They are derived from the walls by the
 * production topology tracer (`buildWallGraph` → `computeTopology`), so "the
 * room survived" is a consequence of the geometry this engine produced, not a
 * polygon the test author drew to match. `splitAtTJunctions` below supplies the
 * one thing the tracer does not do for itself — see its own note.
 *
 * THREE ARMS, and the third is the one that makes the first mean anything:
 *   1. §L-926-ZERO-PROPOSALS       fix on  ⇒ 3 rooms → 3, ZERO findings.
 *   2. §L-926-DETECTOR-IS-LIVE     fix off ⇒ 3 rooms → 2, the offer FIRES.
 *   3. §L-926-GENUINE-DELETION     wall really deleted ⇒ the offer STILL FIRES.
 * Arm 1 alone is satisfiable by breaking the detector. Arms 2 and 3 prove the
 * detector was never touched: it still reports this exact geometry when the
 * stem is orphaned, and it still reports a wall that genuinely went away. The
 * cause was fixed; the messenger was not muted. `OpenedRegionDetector.ts` is
 * imported, never modified — this suite adds no file to that package.
 *
 * @file packages/geometry-wall/__tests__/L926OpenedRegionAcceptance.test.ts
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { computeMoveReweldPlan, type ReweldBaseline } from '../src/WallMoveReweld';
// L2 → L2 (eslint.config.js: room-topology and geometry-wall are both L2), and
// `check-layer-boundaries.ts` skips `__tests__` paths entirely. Deep relative
// rather than the `@pryzm/room-topology` barrel on purpose: room-topology
// DEPENDS on geometry-wall, so the bare specifier would draw a package cycle
// through a test. `OpenedRegionDetector` itself pulls no THREE and no DOM.
import {
    scanForOpenedRegions,
    type RegionSnapshot,
    type SurvivingWall,
} from '../../room-topology/src/OpenedRegionDetector';
import { buildWallGraph } from '../../room-topology/src/WallIntersectionResolver';
import { computeTopology } from '../../room-topology/src/PlanarTopologyEngine';

// ── The model ────────────────────────────────────────────────────────────────

const T_WALL = 0.2;
const LEVEL = 'L0';

interface WallSpec { id: string; a: [number, number]; b: [number, number] }

const bl = (a: [number, number], b: [number, number]): ReweldBaseline =>
    [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }];

/** The founder's shape, as it stands BEFORE the gesture. */
const BEFORE: WallSpec[] = [
    { id: 'W', a: [0, 0], b: [0, 8] },       // perimeter west
    { id: 'E', a: [12, 0], b: [12, 8] },     // perimeter east
    { id: 'S', a: [0, 0], b: [12, 0] },      // perimeter south
    { id: 'N', a: [0, 8], b: [12, 8] },      // perimeter north
    { id: 'P', a: [0, 4], b: [12, 4] },      // THE SUBJECT — full-width partition
    { id: 'T', a: [6, 4], b: [6, 8] },       // THE DEPENDENT — stem on P's body
];

/** P moves 0.773 m south. Founder's number, founder's direction. */
const P_MOVED: ReweldBaseline = bl([0, 4 - 0.773], [12, 4 - 0.773]);

// ── Rooms, DERIVED from the walls ────────────────────────────────────────────

/**
 * `buildWallGraph` creates nodes at wall ENDPOINTS only, so a wall whose end
 * lands mid-span on another contributes no vertex and the face never closes —
 * measured: the fixture below traces as ONE 96 m² outer face without this step.
 * Production does the equivalent inside `RoomDetectionEngine` (its T-junction
 * rescue), which needs live stores; this is the same subdivision expressed
 * purely. It is deliberately GEOMETRIC and unconditional: it splits wherever an
 * endpoint actually lies on a body, so a stem that stops 0.773 m short creates
 * no split and the loop stays open — which is precisely the behaviour under
 * test. It cannot manufacture the passing result.
 */
interface Seg { wallUUID: string; start: THREE.Vector3; end: THREE.Vector3 }

function splitAtTJunctions(walls: readonly WallSpec[]): Seg[] {
    const pts = walls.flatMap(w => [w.a, w.b]);
    const out: Seg[] = [];
    for (const w of walls) {
        const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1];
        const l2 = dx * dx + dz * dz;
        const ts = new Set<number>([0, 1]);
        for (const p of pts) {
            const t = ((p[0] - w.a[0]) * dx + (p[1] - w.a[1]) * dz) / l2;
            if (t <= 1e-9 || t >= 1 - 1e-9) continue;
            if (Math.hypot(p[0] - (w.a[0] + dx * t), p[1] - (w.a[1] + dz * t)) > 1e-9) continue;
            ts.add(t);
        }
        const sorted = [...ts].sort((m, n) => m - n);
        for (let i = 0; i < sorted.length - 1; i++) {
            const t0 = sorted[i]!, t1 = sorted[i + 1]!;
            out.push({
                wallUUID: `${w.id}#${i}`,
                start: new THREE.Vector3(w.a[0] + dx * t0, 0, w.a[1] + dz * t0),
                end: new THREE.Vector3(w.a[0] + dx * t1, 0, w.a[1] + dz * t1),
            });
        }
    }
    return out;
}

/** Rooms as the tracer sees them, in a stable order so ids are comparable. */
function roomsOf(walls: readonly WallSpec[]): RegionSnapshot[] {
    const topo = computeTopology(buildWallGraph(splitAtTJunctions(walls)));
    return topo.rooms
        .map(r => ({
            polygon: r.polygonVertices.map(v => ({ x: v.x, z: v.z })),
            key: `${r.centroid.z.toFixed(4)}:${r.centroid.x.toFixed(4)}`,
        }))
        .sort((m, n) => (m.key < n.key ? -1 : 1))
        .map((r, i) => ({ id: `R${i}`, name: `Room 00-00${i + 1}`, polygon: r.polygon }));
}

const survivingWalls = (walls: readonly WallSpec[]): SurvivingWall[] =>
    walls.map(w => ({
        id: w.id,
        start: { x: w.a[0], z: w.a[1] },
        end: { x: w.b[0], z: w.b[1] },
        thickness: T_WALL,
    }));

const areasOf = (rooms: readonly RegionSnapshot[]): number[] =>
    rooms.map(r => {
        let s = 0;
        for (let i = 0; i < r.polygon.length; i++) {
            const p = r.polygon[i]!, q = r.polygon[(i + 1) % r.polygon.length]!;
            s += p.x * q.z - q.x * p.z;
        }
        return +Math.abs(s / 2).toFixed(3);
    }).sort((m, n) => m - n);

/**
 * Run the gesture. `withAuthorship` false reproduces `19ddf6bb` EXACTLY, by the
 * engine's own declared route: no host thickness ⇒ no declared band ⇒ no
 * authorship verdict ⇒ every partner takes the incumbent-preserving path. The
 * broken arm is therefore the real shipped code path, not a hand-edited fixture.
 */
function runGesture(withAuthorship: boolean) {
    const partners = BEFORE.filter(w => w.id !== 'P').map(w => ({ id: w.id, baseLine: bl(w.a, w.b) }));
    const plan = computeMoveReweldPlan(
        {
            id: 'P',
            prevBaseLine: bl([0, 4], [12, 4]),
            newBaseLine: P_MOVED,
            ...(withAuthorship ? { thickness: T_WALL } : {}),
        },
        partners,
    );

    // Apply the gesture: the subject's own move, then the plan, as one batch.
    const after: WallSpec[] = BEFORE.map(w =>
        w.id === 'P' ? { id: 'P', a: [P_MOVED[0].x, P_MOVED[0].z], b: [P_MOVED[1].x, P_MOVED[1].z] } : { ...w });
    for (const e of plan.entries) {
        const target = after.find(w => w.id === e.wallId);
        if (!target) continue;
        target.a = [e.newBaseLine[0].x, e.newBaseLine[0].z];
        target.b = [e.newBaseLine[1].x, e.newBaseLine[1].z];
    }

    const roomsBefore = roomsOf(BEFORE);
    const roomsAfter = roomsOf(after);
    return {
        plan, after, roomsBefore, roomsAfter,
        scan: scanForOpenedRegions({
            levelId: LEVEL, roomsBefore, roomsAfter, wallsAfter: survivingWalls(after),
        }),
    };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('§L-926-ZERO-PROPOSALS — the founder\'s gesture offers nothing, because nothing opened', () => {
    it('the stem follows, all three rooms survive, and the detector produces ZERO findings', () => {
        const { plan, scan, roomsBefore, roomsAfter } = runGesture(true);

        // The dependent followed…
        const eT = plan.entries.find(e => e.wallId === 'T')!;
        expect(eT).toBeTruthy();
        expect(eT.newBaseLine[0].z).toBeCloseTo(4 - 0.773, 9); // foot re-seated on P
        expect(eT.newBaseLine[1]).toEqual({ x: 6, y: 0, z: 8 }); // head untouched
        expect(plan.refusals).toEqual([]);
        // …and no perimeter wall was proposed at all (C83 §10.2.2 intact).
        expect(plan.entries.map(e => e.wallId).sort()).toEqual(['T']);

        // The rooms are DERIVED, and they survive.
        expect(areasOf(roomsBefore)).toEqual([24, 24, 48]);
        expect(areasOf(roomsAfter)).toEqual([28.638, 28.638, 38.724]);
        expect(roomsAfter).toHaveLength(3);

        // THE ACCEPTANCE CRITERION — the user-visible symptom, absent.
        expect(scan.findings).toEqual([]);
        expect(scan.roomsBefore).toBe(3);
        expect(scan.roomsAfter).toBe(3);
    });
});

describe('§L-926-DETECTOR-IS-LIVE — the same geometry WITHOUT the follow still fires the offer', () => {
    it('reproduces the founder\'s report: rooms merge and §OPENED-REGION proposes a wall', () => {
        const { plan, scan, roomsAfter } = runGesture(false);

        // `19ddf6bb`'s behaviour, reached by the engine's own no-thickness route.
        expect(plan.entries).toEqual([]);
        expect(plan.refusals.map(r => r.partnerId)).toEqual(['T']);

        // Two of three rooms merged — the founder's Room 00-005 swallowed by its
        // neighbour, here 24 + 24 + the freed strip = 57.276 m².
        expect(roomsAfter).toHaveLength(2);
        expect(areasOf(roomsAfter)).toEqual([38.724, 57.276]);

        // And the offer the founder saw, from an unmodified detector.
        expect(scan.findings).toHaveLength(1);
        const f = scan.findings[0]!;
        expect(f.cause).toBe('merged-into-neighbour');
        expect(f.kind).toBe('region-opened');
        if (f.kind !== 'region-opened') throw new Error('unreachable');
        // The gap it offers to close is the stretch the stem should have covered.
        expect(f.gap.lengthM).toBeGreaterThan(5.5);
        expect(f.gap.thicknessM).toBe(T_WALL);
    });

    it('THE ZERO IS A REAL ZERO: same detector, same fixture, opposite answers', () => {
        expect(runGesture(true).scan.findings).toHaveLength(0);
        expect(runGesture(false).scan.findings).toHaveLength(1);
    });
});

describe('§L-926-GENUINE-DELETION — the messenger is intact, not muted', () => {
    it('a wall that is REALLY deleted still produces the proposal, with no move involved', () => {
        // No gesture at all: the stem is simply gone. If the fix had worked by
        // suppressing the detector rather than by closing the loop, this would
        // now be silent — and a user who deletes a wall would lose the offer
        // that tells them a room stopped existing.
        const deleted = BEFORE.filter(w => w.id !== 'T');
        const roomsBefore = roomsOf(BEFORE);
        const roomsAfter = roomsOf(deleted);
        expect(roomsBefore).toHaveLength(3);
        expect(roomsAfter).toHaveLength(2);

        const scan = scanForOpenedRegions({
            levelId: LEVEL, roomsBefore, roomsAfter, wallsAfter: survivingWalls(deleted),
        });
        expect(scan.findings).toHaveLength(1);
        expect(scan.findings[0]!.cause).toBe('merged-into-neighbour');
        expect(scan.findings[0]!.kind).toBe('region-opened');
        expect(scan.roomsBefore).toBe(3);
        expect(scan.roomsAfter).toBe(2);
    });
});

describe('§L-926-ONE-GESTURE-ONE-UNDO', () => {
    it('every entry carries its own pre-gesture datum, so ONE revert restores host AND stem', () => {
        const { plan, after } = runGesture(true);

        // The undo datum is the wall AS IT STOOD, not as the subject left it.
        const eT = plan.entries.find(e => e.wallId === 'T')!;
        expect(eT.prevBaseLine).toEqual([{ x: 6, y: 0, z: 4 }, { x: 6, y: 0, z: 8 }]);

        // Revert exactly as CascadeWallBaselineCommand.undo does — restore every
        // entry's prevBaseLine — and put the subject back. One step, both walls.
        const reverted: WallSpec[] = after.map(w => ({ ...w }));
        for (const e of plan.entries) {
            const t = reverted.find(w => w.id === e.wallId)!;
            t.a = [e.prevBaseLine[0].x, e.prevBaseLine[0].z];
            t.b = [e.prevBaseLine[1].x, e.prevBaseLine[1].z];
        }
        const p = reverted.find(w => w.id === 'P')!;
        p.a = [0, 4]; p.b = [12, 4];

        // Byte-identical to the world before the gesture, walls and rooms alike.
        expect(JSON.stringify(reverted)).toBe(JSON.stringify(BEFORE));
        expect(areasOf(roomsOf(reverted))).toEqual([24, 24, 48]);

        // And the round trip leaves nothing for the detector to report either.
        const back = scanForOpenedRegions({
            levelId: LEVEL,
            roomsBefore: roomsOf(after),
            roomsAfter: roomsOf(reverted),
            wallsAfter: survivingWalls(reverted),
        });
        expect(back.findings).toEqual([]);
    });

    it('host + stem arrive as ONE plan — one array, therefore one cascade, therefore one undo', () => {
        // The service hands `plan.entries` to a single CascadeWallBaselineCommand.
        // A stem that came back as a SECOND dispatch would be a second history
        // entry and two Ctrl+Zs — the shape §L-874 already had to unpick once.
        const { plan } = runGesture(true);
        expect(Array.isArray(plan.entries)).toBe(true);
        expect(plan.entries).toHaveLength(1);
        expect(new Set(plan.entries.map(e => e.wallId)).size).toBe(plan.entries.length);
    });
});
