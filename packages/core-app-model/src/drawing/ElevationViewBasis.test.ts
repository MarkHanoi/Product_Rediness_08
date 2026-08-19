/**
 * §ELEV-SYMBOL-OPENING (L-1240) — the elevation basis, and the parity that makes adopting it safe.
 *
 * ⛔ **NOTHING HERE IS STUBBED.** §A runs the REAL `OBC.TechnicalDrawing.prototype.orientTo` on a
 * bare host and compares its quaternion with this module's, then runs the REAL
 * `OBC.TechnicalDrawing.toDrawingSpace` through BOTH and compares the projected points. A fake
 * built from `orientTo`'s six-branch table could not have falsified `orientTo`'s six-branch
 * table — which is the whole finding.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import {
    OBC_CARDINAL_QUATERNIONS,
    elevationViewBasis,
    elevationBasisRefusal,
    projectToElevation,
} from './ElevationViewBasis';

/** The REAL `orientTo`, invoked on a host that exposes only the `.three` it touches. */
function obcQuaternionFor(dir: THREE.Vector3): THREE.Quaternion {
    const three = new THREE.Object3D();
    (OBC.TechnicalDrawing.prototype as unknown as {
        orientTo(this: { three: THREE.Object3D }, d: THREE.Vector3): void;
    }).orientTo.call({ three }, dir);
    return three.quaternion.clone();
}

/** A drawing stand-in carrying only `.three` — the sole field `toDrawingSpace` reads. */
function drawingWithQuaternion(q: readonly [number, number, number, number]): OBC.TechnicalDrawing {
    const three = new THREE.Object3D();
    three.quaternion.set(q[0], q[1], q[2], q[3]);
    three.updateWorldMatrix(true, false);
    return { three } as unknown as OBC.TechnicalDrawing;
}

/** Project one world point through the REAL `toDrawingSpace`, read as `PlanViewCanvas` reads it. */
function projectViaOBC(
    q: readonly [number, number, number, number],
    p: THREE.Vector3,
): { h: number; v: number } {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([p.x, p.y, p.z, p.x, p.y, p.z], 3));
    const ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial());
    ls.updateWorldMatrix(true, false);
    const out = OBC.TechnicalDrawing.toDrawingSpace(ls, drawingWithQuaternion(q));
    const pos = out.geometry.getAttribute('position');
    // PlanViewCanvas: H = x, V = -z (its `_sectionFlipV` branch).
    return { h: pos.getX(0), v: -pos.getZ(0) };
}

const CARDINALS: Array<[string, THREE.Vector3]> = [
    ['+X', new THREE.Vector3(1, 0, 0)],
    ['-X', new THREE.Vector3(-1, 0, 0)],
    ['+Z', new THREE.Vector3(0, 0, 1)],
    ['-Z', new THREE.Vector3(0, 0, -1)],
];

describe('§A — parity with OBC on the four horizontal cardinals (the safety argument)', () => {
    it.each(CARDINALS)('%s — the quaternion is BYTE-IDENTICAL to the real orientTo', (_label, dir) => {
        const basis = elevationViewBasis(dir);
        expect(basis).not.toBeNull();
        const obc = obcQuaternionFor(dir);
        expect(basis!.quaternion[0]).toBeCloseTo(obc.x, 12);
        expect(basis!.quaternion[1]).toBeCloseTo(obc.y, 12);
        expect(basis!.quaternion[2]).toBeCloseTo(obc.z, 12);
        expect(basis!.quaternion[3]).toBeCloseTo(obc.w, 12);
    });

    it('the table of OBC literals this module documents matches the library it names', () => {
        // POSITIVE CONTROL for the table itself: if @thatopen/components ever changes these
        // values, this fails here rather than silently invalidating §A's claim.
        for (const row of OBC_CARDINAL_QUATERNIONS) {
            const obc = obcQuaternionFor(new THREE.Vector3(row.direction.x, row.direction.y, row.direction.z));
            expect([obc.x, obc.y, obc.z, obc.w]).toEqual(
                row.quaternion.map(v => expect.closeTo(v, 12)),
            );
        }
    });

    it.each(CARDINALS)('%s — projects a world point identically to OBC, through the real toDrawingSpace', (_l, dir) => {
        const basis = elevationViewBasis(dir)!;
        const p = new THREE.Vector3(4.137, 12.21, -7.913);
        const mine = projectToElevation(basis, p);
        const theirs = projectViaOBC(
            [obcQuaternionFor(dir).x, obcQuaternionFor(dir).y, obcQuaternionFor(dir).z, obcQuaternionFor(dir).w],
            p,
        );
        // 5 decimals, not 9: `toDrawingSpace` round-trips through a Float32 BufferAttribute, so
        // -7.913 comes back as -7.9130001. That is the storage, not a disagreement about the
        // rotation — which §A's first case asserts to 12 decimals on the quaternion itself.
        expect(mine.h).toBeCloseTo(theirs.h, 5);
        expect(mine.v).toBeCloseTo(theirs.v, 5);
    });
});

describe('§B — the NON-CARDINAL case: what orientTo silently does, and what this fixes', () => {
    // A wall bearing 30°, viewed along its own normal — the direction SectionPlanToolHandler
    // writes verbatim from the tail the user drew.
    const bearing = Math.PI / 6;
    const dir = new THREE.Vector3(
        -Math.sin(bearing + Math.PI / 2), 0, -Math.cos(bearing + Math.PI / 2),
    ).normalize();

    it('DIFFERENTIATING — the real orientTo REFUSES this direction and leaves the quaternion IDENTITY', () => {
        const three = new THREE.Object3D();
        const before = three.quaternion.clone();
        (OBC.TechnicalDrawing.prototype as unknown as {
            orientTo(this: { three: THREE.Object3D }, d: THREE.Vector3): void;
        }).orientTo.call({ three }, dir);
        // Unchanged — this is the fail-open. If OBC ever starts handling arbitrary directions,
        // this test goes red and the module's premise must be re-measured, which is the point.
        expect(three.quaternion.equals(before)).toBe(true);
        expect(before.equals(new THREE.Quaternion(0, 0, 0, 1))).toBe(true);
    });

    // The wall runs PERPENDICULAR to the view direction — derived from `dir` rather than
    // re-stated from `bearing`, so the fixture cannot disagree with itself about which way the
    // wall faces. (The first draft of this test did exactly that and put the head parallel to
    // the view direction, where its projected length is legitimately zero.)
    const along = { x: -dir.z, z: dir.x };

    it('DIFFERENTIATING — under that identity, a HORIZONTAL world line comes back TILTED by the bearing', () => {
        // Two ends of a window head: same world Y, 1.2 m apart along that wall.
        const y = 13.81;
        const a = new THREE.Vector3(5 - 0.6 * along.x, y, 0 - 0.6 * along.z);
        const b = new THREE.Vector3(5 + 0.6 * along.x, y, 0 + 0.6 * along.z);
        const IDENTITY = [0, 0, 0, 1] as const;
        const pa = projectViaOBC(IDENTITY, a);
        const pb = projectViaOBC(IDENTITY, b);
        const angleDeg = Math.abs((Math.atan2(pb.v - pa.v, pb.h - pa.h) * 180) / Math.PI);
        // ⭐ THE CLAIM, stated so it cannot be satisfied by coincidence: the projected angle of a
        // HORIZONTAL world line equals that line's PLAN BEARING, read through the elevation
        // canvas's own (H = x, V = −z) map. That equality IS the finding — the drawing is the
        // model's plan. Here it is 120°; the founder's "we ANGLED them", and left-or-right by the
        // sign of the host's bearing.
        const planBearingDeg = Math.abs((Math.atan2(-along.z, along.x) * 180) / Math.PI);
        expect(planBearingDeg).toBeCloseTo(120, 9);
        expect(angleDeg).toBeCloseTo(planBearingDeg, 4);
        // …and it is emphatically not horizontal, which is the whole complaint.
        expect(Math.min(angleDeg, 180 - angleDeg)).toBeGreaterThan(1);
        // …and `v` is not a height at all: both ends sit far from world Y 13.81.
        expect(Math.abs(pa.v - y)).toBeGreaterThan(10);
    });

    it('THE FIX — the same head projects PERFECTLY HORIZONTAL through this basis', () => {
        const basis = elevationViewBasis(dir)!;
        const y = 13.81;
        const a = { x: 5 - 0.6 * along.x, y, z: 0 - 0.6 * along.z };
        const b = { x: 5 + 0.6 * along.x, y, z: 0 + 0.6 * along.z };
        const pa = projectToElevation(basis, a);
        const pb = projectToElevation(basis, b);
        expect(pb.v - pa.v).toBeCloseTo(0, 12);
        expect(pa.v).toBeCloseTo(y, 12);          // v IS the world height
        expect(Math.abs(pb.h - pa.h)).toBeCloseTo(1.2, 9); // and the head keeps its true length
    });

    it('holds for a swept range of bearings, not just the one that was measured', () => {
        for (let deg = -175; deg <= 180; deg += 5) {
            const r = (deg * Math.PI) / 180;
            const basis = elevationViewBasis({ x: Math.cos(r), z: Math.sin(r) });
            expect(basis, `bearing ${deg}`).not.toBeNull();
            const p1 = projectToElevation(basis!, { x: -3.5, y: 12.21, z: 8.25 });
            const p2 = projectToElevation(basis!, { x: 11.75, y: 12.21, z: -2.5 });
            expect(p2.v - p1.v, `bearing ${deg}`).toBeCloseTo(0, 12);
            expect(p1.v, `bearing ${deg}`).toBeCloseTo(12.21, 12);
        }
    });
});

describe('§C — the refusal (C16 CA-18)', () => {
    it('refuses a vertical direction and names condition, reason and alternative', () => {
        expect(elevationViewBasis({ x: 0, y: -1, z: 0 })).toBeNull();
        const r = elevationBasisRefusal({ x: 0, y: -1, z: 0 });
        expect(r.code).toBe('VERTICAL_DIRECTION');
        expect(r.reason).toMatch(/vertical/i);
        expect(r.alternative).toMatch(/plan/i);
    });

    it('refuses a non-finite direction, distinctly from a vertical one', () => {
        expect(elevationViewBasis({ x: Number.NaN, z: 1 })).toBeNull();
        expect(elevationBasisRefusal({ x: Number.NaN, z: 1 }).code).toBe('DEGENERATE_DIRECTION');
    });

    it('FLATTENS a tilted direction rather than refusing it — matching resolveSectionDepthPlane', () => {
        // A direction with a vertical component still names an elevation; only its horizontal
        // part defines the (vertical) picture plane. Agreeing with the rest of the pipeline is
        // the requirement here — disagreeing would put two answers in for one question.
        const basis = elevationViewBasis({ x: 0, y: -0.7, z: -0.7 });
        expect(basis).not.toBeNull();
        expect(basis!.n.y).toBe(0);
        expect(basis!.n.z).toBeCloseTo(-1, 12);
    });
});

describe('§D — the basis is orthonormal and right-handed at every angle', () => {
    it('holds across a bearing sweep', () => {
        for (let deg = 0; deg < 360; deg += 7) {
            const r = (deg * Math.PI) / 180;
            const b = elevationViewBasis({ x: Math.cos(r), z: Math.sin(r) })!;
            const dot = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) =>
                p.x * q.x + p.y * q.y + p.z * q.z;
            expect(dot(b.h, b.h), `|h| ${deg}`).toBeCloseTo(1, 12);
            expect(dot(b.n, b.n), `|n| ${deg}`).toBeCloseTo(1, 12);
            expect(dot(b.h, b.n), `h·n ${deg}`).toBeCloseTo(0, 12);
            expect(dot(b.h, b.v), `h·v ${deg}`).toBeCloseTo(0, 12);
            expect(dot(b.n, b.v), `n·v ${deg}`).toBeCloseTo(0, 12);
            expect(b.v).toEqual({ x: 0, y: 1, z: 0 });
        }
    });
});
