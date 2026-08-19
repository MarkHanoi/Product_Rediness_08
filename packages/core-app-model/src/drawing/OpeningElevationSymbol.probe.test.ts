/**
 * §ELEV-SYMBOL-OPENING (L-1240) — **THE PROBE.** The measurement that separated three defects
 * that had been read as one, kept as a suite so the separation cannot silently un-separate.
 *
 * ═══ WHY THIS IS A COMMITTED TEST AND NOT A DISCARDED SCRATCH SCRIPT ═══
 *
 * The lane opened with a stated lead theory: *"in elevation a window is not a symbol — it is
 * whatever its 3-D MESH projects to; on a raked host the mesh is SHEARED, and its front and back
 * faces sit at different heights, so the projected wireframe reads as a leaning box."* **Half of
 * that is right and the causal half is wrong**, and only a dump could tell which — which is this
 * repo's own recorded lesson: *"two rival theories both 'confirmed' and both wrong — probe
 * GEOMETRY, not the number."*
 *
 * ⛔ **NOTHING IS SIMULATED.** Every number below comes from the REAL
 * `OBC.TechnicalDrawing.toDrawingSpace`, the REAL `orientTo`, the REAL `THREE.EdgesGeometry`,
 * the REAL `rakeShearPerMetre`, and a group transform copied line-for-line from
 * `WindowBuilder._seatHostedLeaf` (TRS, then the local one-element shear `z ↦ z + k·y`, written
 * straight onto `group.matrix` with `matrixAutoUpdate` off — exactly as the builder does it,
 * because a shear has no TRS decomposition). A fake built from the header could not have
 * falsified the header.
 *
 * ═══ WHAT IT MEASURED (angles of the projected segment in the sheet's (h, v) frame) ═══
 *
 * | case | host                                  | view         | head / sill | jambs      |
 * |------|---------------------------------------|--------------|-------------|------------|
 * | A    | vertical, parallel to picture plane   | CARDINAL     | 0°          | ±90°       |
 * | B    | RAKED 75°, parallel to picture plane   | CARDINAL     | 0°          | ±90°       |
 * | C    | vertical, bearing 30°                 | NON-CARDINAL | **30°**     | **−60°**   |
 * | E    | vertical, bearing +20°                | CARDINAL     | 0°          | ±90°       |
 * | G    | RAKED 75°, bearing +20°               | CARDINAL     | 0°          | **84.76°** |
 *
 * **VERDICT ON THE FOUR CANDIDATE THEORIES:**
 *  - **(a) no elevation symbol ⇒ raw mesh wireframe — CONFIRMED AS FACT, REFUTED AS THE SKEW
 *    CAUSE.** `symbolicRuleForLayer` declined every non-plan view, so an opening in elevation
 *    was `EdgesGeometry(mesh.geometry)`: 12 edges, both faces, depth edges between. But on a
 *    cardinal sheet that dump is still a clean rectangle (A/B/E). Raw mesh is *too many lines*,
 *    not *angled head and sill*.
 *  - **(b) HLR not reaching openings — CONFIRMED, and it COEXISTS with (a).** In A/B the back
 *    outline lands exactly on the front one; in E/F/G it separates and both are drawn.
 *    `HiddenLineRemoval` groups occluders by `userData.elementUUID` so *"an element never hides
 *    its own linework"* — a window therefore always draws both of its faces.
 *  - **(c) a 2-D skew applied to the symbol — REFUTED.** Case C's sides are 1.0392 and 0.1500 —
 *    unequal, so not a parallelogram from a shear; and the whole figure is the PLAN footprint.
 *  - **(d) not rake at all — CONFIRMED, in a sharper form than posed.** ⭐ **Case B is the
 *    falsification that matters: a raked host viewed square-on is BYTE-IDENTICAL to an unraked
 *    one.** Rake alone skews nothing and foreshortens nothing here. The lean needs rake AND an
 *    oblique sheet (G); the true skew needs a NON-CARDINAL view direction (C), which is a
 *    different bug in a different file — `orientTo`'s six-axis fail-open.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { rakeShearPerMetre } from '@pryzm/geometry-wall';

/** A drawing carrying only `.three`, oriented by the REAL `orientTo`. */
function drawingFor(dir: THREE.Vector3): OBC.TechnicalDrawing {
    const three = new THREE.Object3D();
    (OBC.TechnicalDrawing.prototype as unknown as {
        orientTo(this: { three: THREE.Object3D }, d: THREE.Vector3): void;
    }).orientTo.call({ three }, dir);
    three.updateWorldMatrix(true, false);
    return { three } as unknown as OBC.TechnicalDrawing;
}

interface ProbeSeg { h0: number; v0: number; h1: number; v1: number; deg: number }

/** Project a group's real mesh edges exactly as `EdgeProjectorService` does. */
function project(group: THREE.Group, dir: THREE.Vector3): ProbeSeg[] {
    const drawing = drawingFor(dir);
    group.updateWorldMatrix(true, true);
    const out: ProbeSeg[] = [];
    group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!(m as unknown as { isMesh?: boolean }).isMesh) return;
        const eg = new THREE.EdgesGeometry(m.geometry, 1);     // the projector's own angleDeg
        eg.applyMatrix4(m.matrixWorld);
        const ls = new THREE.LineSegments(eg, new THREE.LineBasicMaterial());
        ls.updateWorldMatrix(true, false);
        const p = OBC.TechnicalDrawing.toDrawingSpace(ls, drawing).geometry.getAttribute('position');
        for (let i = 0; i + 1 < p.count; i += 2) {
            // PlanViewCanvas's own elevation read: H = x, V = -z.
            const h0 = p.getX(i), v0 = -p.getZ(i);
            const h1 = p.getX(i + 1), v1 = -p.getZ(i + 1);
            const dh = h1 - h0, dv = v1 - v0;
            if (Math.hypot(dh, dv) < 1e-9) continue;           // degenerate, dropped
            let deg = (Math.atan2(dv, dh) * 180) / Math.PI;
            if (deg < 0) deg += 180;
            if (deg >= 180 - 1e-9) deg = 0;
            out.push({ h0, v0, h1, v1, deg });
        }
    });
    return out;
}

/** `WindowBuilder._seatHostedLeaf`, reproduced transform-for-transform. */
function hostedLeaf(o: { rotationY: number; rakeDeg: number | null }): THREE.Group {
    const W = 1.2, H = 1.4, D = 0.3, CX = 5, CZ = 0, CY = 13.11, RISE = 0.9 + 1.4 / 2;
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(W, H, D)));
    g.position.set(CX, CY, CZ);
    g.rotation.y = o.rotationY;
    const k = rakeShearPerMetre(o.rakeDeg);
    if (k !== 0) {
        const dirX = Math.cos(o.rotationY), dirZ = -Math.sin(o.rotationY);
        const lp = { x: -dirZ, z: dirX };                     // leftPerp, the one notion of "left"
        const shift = RISE * k;                              // rakeTopOffset at the leaf's own rise
        g.position.set(CX + lp.x * shift, CY, CZ + lp.z * shift);
        g.updateMatrix();
        g.matrixAutoUpdate = false;
        g.matrix.multiply(new THREE.Matrix4().set(
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, k, 1, 0,
            0, 0, 0, 1,
        ));
        g.matrixWorldNeedsUpdate = true;
    }
    return g;
}

const FRONT = new THREE.Vector3(0, 0, -1);
const normalFor = (rotY: number) =>
    new THREE.Vector3(-Math.sin(rotY + Math.PI / 2), 0, -Math.cos(rotY + Math.PI / 2)).normalize();

/** The two near-horizontal edge angles, rounded — head and sill live here. */
const horizontals = (s: ProbeSeg[]) => s.filter(x => x.deg < 45 || x.deg > 135);
const steep = (s: ProbeSeg[]) => s.filter(x => x.deg >= 45 && x.deg <= 135);

describe('THE PROBE — what an opening ACTUALLY projects to in elevation today', () => {
    it('the raw dump is the SOLID: 12 edges, both faces, depth edges between (theory (a) + (b))', () => {
        const segs = project(hostedLeaf({ rotationY: 0, rakeDeg: null }), FRONT);
        // A box has 12 edges; on a square-on sheet the back outline lands ON the front one and
        // the four depth edges collapse to points and are dropped — 8 survive.
        expect(segs.length).toBe(8);
        const oblique = project(hostedLeaf({ rotationY: Math.PI / 9, rakeDeg: null }), FRONT);
        // Off-square, the back outline separates and BOTH are drawn — (b): a window never
        // occludes itself, so HLR cannot remove either.
        expect(oblique.length).toBe(12);
    });

    it('CASE A — vertical host, square-on: head and sill 0°, jambs 90°', () => {
        const s = project(hostedLeaf({ rotationY: 0, rakeDeg: null }), FRONT);
        for (const e of horizontals(s)) expect(e.deg).toBeCloseTo(0, 6);
        for (const e of steep(s)) expect(e.deg).toBeCloseTo(90, 6);
    });

    it('⭐ CASE B — THE FALSIFICATION: a RAKED host square-on is BYTE-IDENTICAL to an unraked one', () => {
        const key = (s: ProbeSeg[]) => s
            .map(e => `${e.h0.toFixed(6)},${e.v0.toFixed(6)}→${e.h1.toFixed(6)},${e.v1.toFixed(6)}`)
            .sort().join('|');
        expect(key(project(hostedLeaf({ rotationY: 0, rakeDeg: 75 }), FRONT)))
            .toBe(key(project(hostedLeaf({ rotationY: 0, rakeDeg: null }), FRONT)));
    });

    it('⭐ CASE B — and there is NO vertical foreshortening: the projected rise is the authored 1.4 m', () => {
        // The lane brief asserted "a rake FORESHORTENS the opening vertically". Measured FALSE
        // for this repo's rake, which displaces horizontally about the base and keeps the height
        // PLUMB. Pinned so the false physics is never written into a contract as an invariant.
        for (const rake of [null, 75, 110]) {
            const vs = project(hostedLeaf({ rotationY: 0, rakeDeg: rake }), FRONT).flatMap(e => [e.v0, e.v1]);
            // 5 decimals, not 9: `BufferAttribute` positions are Float32, so a 1.4 m rise
            // round-trips as 1.40000057. That is the storage, not the geometry.
            expect(Math.max(...vs) - Math.min(...vs), `rake ${rake}`).toBeCloseTo(1.4, 5);
        }
    });

    it('⛔ CASE C — a NON-CARDINAL view: orientTo fails OPEN and the head comes back at the BEARING', () => {
        const bearing = Math.PI / 6;                            // 30°
        const s = project(hostedLeaf({ rotationY: bearing, rakeDeg: null }), normalFor(bearing));
        // Every one of the twelve is at the plan bearing or its perpendicular — because this is
        // the model's PLAN, not its elevation.
        const angles = [...new Set(s.map(e => Math.round(e.deg * 100) / 100))].sort((a, b) => a - b);
        expect(angles).toEqual([30, 120]);
        // …and `v` is not a height: the opening sits at world Y 12.41–13.81 and comes back near 0.
        const vs = s.flatMap(e => [e.v0, e.v1]);
        expect(Math.max(...vs)).toBeLessThan(1);
    });

    it('⛔ CASE G — a RAKED host on a CARDINAL sheet: head/sill STAY horizontal, the JAMBS lean', () => {
        const bearingDeg = 20, rakeDeg = 75;
        const s = project(hostedLeaf({ rotationY: (bearingDeg * Math.PI) / 180, rakeDeg }), FRONT);
        for (const e of horizontals(s)) expect(e.deg).toBeCloseTo(0, 6);
        const k = 1 / Math.tan((rakeDeg * Math.PI) / 180);
        const expected = (Math.atan2(1.4, k * 1.4 * Math.sin((bearingDeg * Math.PI) / 180)) * 180) / Math.PI;
        expect(expected).toBeCloseTo(84.76, 2);                 // the number in the header table
        for (const e of steep(s)) expect(e.deg).toBeCloseTo(expected, 4);
    });

    it('CASE E — the same oblique host WITHOUT rake keeps its jambs PLUMB (G’s control)', () => {
        const s = project(hostedLeaf({ rotationY: Math.PI / 9, rakeDeg: null }), FRONT);
        for (const e of steep(s)) expect(e.deg).toBeCloseTo(90, 6);
        for (const e of horizontals(s)) expect(e.deg).toBeCloseTo(0, 6);
    });
});
