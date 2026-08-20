/**
 * §ELEV-SYMBOL-WALL (L-1242) — **THE PROBE.** The measurement that split the founder's two wall
 * reports into TWO ROOTS, and killed the causal half of the proposed one.
 *
 * ⛔ **NOTHING IS SIMULATED.** Real `buildWallHoleBodyGeometry` and `buildCurvedLayerGeometry`
 * output, the real `_applyRakeShearToChildren` matrix (copied element-for-element), real
 * `THREE.EdgesGeometry` at the projector's own `angleDeg`, real
 * `OBC.TechnicalDrawing.toDrawingSpace` and the real `orientTo`. A fake built from the
 * hypothesis could not have falsified the hypothesis — which is the whole point, because the
 * hypothesis was half wrong.
 *
 * ═══ THE HYPOTHESIS UNDER TEST ═══
 * *"A wall still projects its raw solid: front face, back face, and the connecting edges between
 * them. **On a RAKED wall** those three sets separate and cross."*
 *
 * ⭐ **CASE C0 IS THE CONTROL THAT KILLS THE CAUSAL HALF.** An oblique wall with **NO RAKE AT
 * ALL** already doubles. Rake is neither necessary nor sufficient for the doubling — it adds only
 * the lean. Without this control the fix would have been attributed to rake and would have looked
 * correct while resting on a false cause.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import {
    buildWallHoleBodyGeometry,
    buildCurvedLayerGeometry,
    computeStations,
    rakeShearPerMetre,
} from '@pryzm/geometry-wall';

/** A drawing oriented by the REAL `orientTo`. */
function drawingFor(dir: THREE.Vector3): OBC.TechnicalDrawing {
    const three = new THREE.Object3D();
    (OBC.TechnicalDrawing.prototype as unknown as {
        orientTo(this: { three: THREE.Object3D }, d: THREE.Vector3): void;
    }).orientTo.call({ three }, dir);
    three.updateWorldMatrix(true, false);
    return { three } as unknown as OBC.TechnicalDrawing;
}

interface Tally {
    horiz: number;
    plumb: number;
    diag: number;
    degenerate: number;
    /** Distinct `h` positions of the plumb lines — the picket-fence counter. */
    plumbHs: Set<string>;
    diagAngles: number[];
}

/** Project a mesh exactly as `EdgeProjectorService` does, and classify every segment. */
function tally(mesh: THREE.Mesh, dir: THREE.Vector3, angleDeg = 1): Tally {
    const eg = new THREE.EdgesGeometry(mesh.geometry, angleDeg);
    mesh.updateWorldMatrix(true, false);
    eg.applyMatrix4(mesh.matrixWorld);
    const ls = new THREE.LineSegments(eg, new THREE.LineBasicMaterial());
    ls.updateWorldMatrix(true, false);
    const p = OBC.TechnicalDrawing.toDrawingSpace(ls, drawingFor(dir)).geometry.getAttribute('position');

    const t: Tally = { horiz: 0, plumb: 0, diag: 0, degenerate: 0, plumbHs: new Set(), diagAngles: [] };
    for (let i = 0; i + 1 < p.count; i += 2) {
        const h0 = p.getX(i), v0 = -p.getZ(i), h1 = p.getX(i + 1), v1 = -p.getZ(i + 1);
        const dh = h1 - h0, dv = v1 - v0;
        if (Math.hypot(dh, dv) < 1e-7) { t.degenerate++; continue; }
        let a = (Math.atan2(dv, dh) * 180) / Math.PI;
        if (a < 0) a += 180;
        if (a >= 180 - 1e-6) a = 0;
        if (a < 0.5 || a > 179.5) t.horiz++;
        else if (Math.abs(a - 90) < 0.5) { t.plumb++; t.plumbHs.add(h0.toFixed(3)); }
        else { t.diag++; t.diagAngles.push(a); }
    }
    return t;
}

/** REAL `_applyRakeShearToChildren` matrix — a world shear about `y = baseOffset`. */
function shear(o: THREE.Object3D, k: number, dirX: number, dirZ: number, y0: number): void {
    const L = Math.hypot(dirX, dirZ);
    const dx = dirX / L, dz = dirZ / L;
    const sx = k * -dz, sz = k * dx;
    o.updateMatrix();
    o.matrixAutoUpdate = false;
    o.matrix.premultiply(new THREE.Matrix4().set(
        1, sx, 0, -sx * y0,
        0, 1,  0, 0,
        0, sz, 1, -sz * y0,
        0, 0,  0, 1,
    ));
    o.matrixWorldNeedsUpdate = true;
}

/** WEST elevation — the founder's view. `h` = −Z, `v` = world Y. */
const WEST = new THREE.Vector3(-1, 0, 0);

/** A 6 × 3 × 0.3 m wall with one window, built by the REAL plain-straight body arm. */
const WALL_GEO = buildWallHoleBodyGeometry({
    length: 6, height: 3, thickness: 0.3, baseOffset: 0,
    openings: [{ offset: 2.4, width: 1.2, height: 1.4, sillHeight: 0.9 }],
})!;

/** Seated so the wall runs along Z (square-on to a West elevation) plus `bearingDeg`. */
function wallMesh(bearingDeg: number): THREE.Mesh {
    const m = new THREE.Mesh(WALL_GEO.clone());
    m.rotation.y = -Math.PI / 2 + (bearingDeg * Math.PI) / 180;
    return m;
}

describe('THE PROBE — root 1: the elevation draws the SOLID, and OBLIQUITY is what exposes it', () => {
    it('the real body arm produced a wall to measure (positive control)', () => {
        expect(WALL_GEO.getAttribute('position').count).toBeGreaterThan(0);
    });

    it('CASE A — straight, SQUARE-ON: 8 horizontals, 8 plumb at only 5 distinct h — clean', () => {
        const t = tally(wallMesh(0), WEST);
        expect(t.horiz).toBe(8);
        expect(t.plumb).toBe(8);
        expect(t.diag).toBe(0);
        // ⭐ 5 distinct h for 8 plumb lines: the two faces land EXACTLY on top of each other, and
        // the four depth edges collapse to points (hence 8 degenerate). THIS is why the defect
        // survived — the stock N/S/E/W elevations of an axis-aligned building look clean.
        expect(t.plumbHs.size).toBe(5);
        expect(t.degenerate).toBe(8);
    });

    it('CASE B — RAKED 75°, SQUARE-ON: byte-identical to A (rake alone changes NOTHING)', () => {
        const m = wallMesh(0);
        shear(m, rakeShearPerMetre(75), 0, 1, 0);
        const t = tally(m, WEST);
        expect({ h: t.horiz, p: t.plumb, d: t.diag, deg: t.degenerate, hs: t.plumbHs.size })
            .toEqual({ h: 8, p: 8, d: 0, deg: 8, hs: 5 });
    });

    it('⭐ CASE C0 — THE CONTROL: an OBLIQUE wall with NO RAKE already DOUBLES', () => {
        const t = tally(wallMesh(20), WEST);
        // Horizontals double 8 -> 16 and the plumb lines split 5 -> 8 distinct positions.
        expect(t.horiz).toBe(16);
        expect(t.plumb).toBe(8);
        expect(t.plumbHs.size).toBe(8);
        expect(t.diag).toBe(0);
        // ⛔ THE FALSIFICATION: the proposed root was "on a RAKED wall the faces separate". They
        // separate with no rake at all, by exactly `thickness * sin(bearing)`.
        // 2 decimals, not 4: `plumbHs` buckets each position with `toFixed(3)`, so a difference
        // of two bucketed values carries +/-0.001 of quantisation. The prediction is 0.10261 and
        // the measurement is 0.102 — the gap IS the bucketing, and tightening the assertion would
        // only be asserting the rounding.
        const hs = [...t.plumbHs].map(Number).sort((a, b) => a - b);
        expect(hs[1]! - hs[0]!).toBeCloseTo(0.3 * Math.sin((20 * Math.PI) / 180), 2);
    });

    it('CASE C — RAKED + oblique: the same 8 lines LEAN, and the lean is atan(cot·sin)', () => {
        const m = wallMesh(20);
        const bearing = -Math.PI / 2 + (20 * Math.PI) / 180;
        shear(m, rakeShearPerMetre(75), Math.cos(-bearing), Math.sin(-bearing), 0);
        const t = tally(m, WEST);
        expect(t.horiz).toBe(16);
        expect(t.plumb).toBe(0);
        expect(t.diag).toBe(8);
        const expected = 90 + (Math.atan(rakeShearPerMetre(75) * Math.sin((20 * Math.PI) / 180)) * 180) / Math.PI;
        expect(expected).toBeCloseTo(95.24, 2);
        for (const a of t.diagAngles) expect(a).toBeCloseTo(expected, 3);
    });
});

describe('THE PROBE — root 2: a curved wall draws its TESSELLATION, and the count proves it', () => {
    function curved(segments: number): THREE.Mesh {
        const start = new THREE.Vector3(0, 0, -3);
        const end = new THREE.Vector3(0, 0, 3);
        const control = new THREE.Vector3(1.6, 0, 0);
        const stations = computeStations(start, end, control, segments);
        const geo = buildCurvedLayerGeometry(
            {} as never, 0, stations, 3, 0, 0.15,
        );
        const m = new THREE.Mesh(geo);
        m.position.set(start.x, 0, start.z);
        return m;
    }

    it.each([[16, 34], [32, 66]])(
        '⭐ %i segments ⇒ EXACTLY %i plumb lines = 2 × (segments + 1) — a drawing of the mesh, not the building',
        (segments, expectedPlumb) => {
            const t = tally(curved(segments), WEST, 1);
            expect(t.plumb).toBe(expectedPlumb);
            expect(t.plumbHs.size).toBe(expectedPlumb);
            expect(t.plumb).toBe(2 * (segments + 1));
        },
    );

    it('the picket fence is INDEPENDENT of the obliquity root — it is there square-on too', () => {
        // Root 1 needs an oblique wall; this one does not. Two reports, two roots.
        const t = tally(curved(16), new THREE.Vector3(0, 0, -1), 1);
        expect(t.plumb).toBeGreaterThan(20);
    });

    it('DIFFERENTIATING — raising the dihedral threshold collapses the seams to the two REAL ends', () => {
        // Shown to establish that the seams ARE sub-threshold facets and not real features. ⛔ It
        // is NOT the shipped fix: a global threshold would drop genuine edges elsewhere. The
        // shipped fix draws the arc as a continuous polyline and suppresses the faceted solid.
        for (const segments of [16, 32]) {
            const t = tally(curved(segments), WEST, 30);
            expect(t.plumb, `segments ${segments}`).toBe(4);      // two ends x two faces
        }
    });

    it('…and the horizontal arc rings SURVIVE that threshold — they are the wall, not the seams', () => {
        expect(tally(curved(16), WEST, 1).horiz).toBe(68);
        expect(tally(curved(16), WEST, 30).horiz).toBe(68);
    });
});
