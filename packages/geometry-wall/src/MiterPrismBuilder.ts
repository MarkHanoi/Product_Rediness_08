import * as THREE from '@pryzm/renderer-three/three';

/**
 * Builds a custom BufferGeometry for a wall section that has correct miter cuts
 * at its start and/or end faces.
 *
 * For layered walls, centerlineStart/End define the miter planes, while
 * worldStart/End are the layer centerlines (offset from centerline).
 *
 * The wall runs from `worldStart` to `worldEnd` in world XZ.
 * `halfT` is the half-thickness.
 * `startMN` and `endMN` are the miter-plane normals (unit {x,z} vectors) at each end.
 *   - If absent, the end cap is perpendicular (normal = wall direction).
 *
 * For layered walls:
 * - centerlineStart/End are the actual centerline endpoints (define miter planes)
 * - worldStart/End are the layer centerlines (shifted by lateral offset)
 * - Vertices project along wallDir to miter planes at centerline endpoints
 *
 * For single-layer walls:
 * - centerlineStart = worldStart, centerlineEnd = worldEnd
 * - Vertices project to miter planes at layer positions
 *
 * Projection formula:
 *   t = MN · (miterPlaneOrigin - V) / (MN · wallDir)
 *   V' = V + t * wallDir
 *
 * Geometry: 6 faces (outer, inner, top, bottom, start cap, end cap).
 * Each face uses its own vertices with face-aligned normals → hard edges everywhere.
 */
export function buildMiterPrism(
    worldStart: THREE.Vector3,
    worldEnd:   THREE.Vector3,
    centerlineStart: THREE.Vector3,
    centerlineEnd: THREE.Vector3,
    halfT:      number,
    height:     number,
    baseOffset: number,
    startMN?: { nx: number; nz: number } | null,
    endMN?:   { nx: number; nz: number } | null,
): THREE.BufferGeometry {

    const wallDir = new THREE.Vector3().subVectors(worldEnd, worldStart).normalize();
    const outward = new THREE.Vector3(-wallDir.z, 0, wallDir.x);

    const S = worldStart.clone();
    const E = worldEnd.clone();

    const yBot = worldStart.y + baseOffset;
    const yTop = worldStart.y + baseOffset + height;

    type P3 = [number, number, number];

    function startBase(sign: number, y: number): P3 {
        return [
            S.x + outward.x * sign * halfT,
            y,
            S.z + outward.z * sign * halfT
        ];
    }
    function endBase(sign: number, y: number): P3 {
        return [
            E.x + outward.x * sign * halfT,
            y,
            E.z + outward.z * sign * halfT
        ];
    }

    function project(
        base: P3,
        miterPlaneOrigin: THREE.Vector3,
        mn: { nx: number; nz: number } | null | undefined,
        dir: THREE.Vector3
    ): P3 {
        if (!mn) return base;

        const mnDotDir = mn.nx * dir.x + mn.nz * dir.z;
        if (Math.abs(mnDotDir) < 1e-9) return base;

        const dx = miterPlaneOrigin.x - base[0];
        const dz = miterPlaneOrigin.z - base[2];
        let t = (mn.nx * dx + mn.nz * dz) / mnDotDir;

        // §MITER-T-CLAMP (founder 2026-06-18 "some walls go off extruding really a lot").
        // `t ≈ 1/sin(θ)` — when the miter normal is near-parallel to the wall direction (a
        // very-acute/degenerate corner, or a degenerate consensus square-cap whose MN is
        // bad), the denominator → 0 and the cap vertex slides METRES past the wall end (the
        // white stub poking into empty space). A REAL miter projects at most a few wall
        // thicknesses, so clamp the projection distance: a degenerate corner now square-caps
        // (≈ the wall end) instead of extruding off-screen. Legitimate mitres (small t) are
        // byte-identical — this only catches the runaway.
        const tMax = 4 * halfT + 0.05;
        if (t > tMax) t = tMax;
        else if (t < -tMax) t = -tMax;

        return [base[0] + t * dir.x, base[1], base[2] + t * dir.z];
    }

    const sDir = wallDir.clone();
    const eDir = wallDir.clone();

    const sOB = project(startBase(+1, yBot), centerlineStart, startMN, sDir);
    const sOT = project(startBase(+1, yTop), centerlineStart, startMN, sDir);
    const sIB = project(startBase(-1, yBot), centerlineStart, startMN, sDir);
    const sIT = project(startBase(-1, yTop), centerlineStart, startMN, sDir);

    const eOB = project(endBase(+1, yBot), centerlineEnd, endMN, eDir);
    const eOT = project(endBase(+1, yTop), centerlineEnd, endMN, eDir);
    const eIB = project(endBase(-1, yBot), centerlineEnd, endMN, eDir);
    const eIT = project(endBase(-1, yTop), centerlineEnd, endMN, eDir);

    const pos: number[] = [];
    const nrm: number[] = [];

    function tri(a: P3, b: P3, c: P3, nx: number, ny: number, nz: number) {
        pos.push(...a, ...b, ...c);
        nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    }
    function quad(a: P3, b: P3, c: P3, d: P3, nx: number, ny: number, nz: number) {
        tri(a, b, c, nx, ny, nz);
        tri(a, c, d, nx, ny, nz);
    }

    quad(sOB, eOB, eOT, sOT,  outward.x, 0, outward.z);
    quad(sIB, sIT, eIT, eIB, -outward.x, 0, -outward.z);
    quad(sOT, eOT, eIT, sIT,  0, 1, 0);
    quad(sIB, eIB, eOB, sOB,  0, -1, 0);
    quad(sOB, sOT, sIT, sIB, -wallDir.x, 0, -wallDir.z);
    quad(eOB, eIB, eIT, eOT,  wallDir.x, 0,  wallDir.z);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('normal',   new THREE.Float32BufferAttribute(nrm, 3));
    return geom;
}
