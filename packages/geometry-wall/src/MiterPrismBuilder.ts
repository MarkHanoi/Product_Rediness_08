import * as THREE from '@pryzm/renderer-three/three';

// §WALL-NAN-GUARD (2026-06-25) — one-shot latch so the non-finite fallback in
// buildMiterPrism() logs ONCE per process rather than every wall rebuild.
let _miterPrismNanWarned = false;

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

    // §WALL-NAN-GUARD (2026-06-25) — coerce non-finite scalar inputs so a bad
    // baseOffset/height (the §RESI-FACADE layered regression class) cannot seed a
    // NaN Y into every cap vertex. The plain-wall path defaults baseOffset to 0;
    // mirror that here for the layered miter-prism path.
    const _baseOffset = Number.isFinite(baseOffset) ? baseOffset : 0;
    const _height     = Number.isFinite(height)     ? height     : 0;

    let wallDir = new THREE.Vector3().subVectors(worldEnd, worldStart).normalize();
    // A zero-length layer centreline normalises to (0,0,0) → every projected/extruded
    // vertex would be NaN-free here but the cap orientation is undefined; default to
    // +X so the geometry is finite and the §WALL-NAN-GUARD backstop below is a no-op.
    if (!Number.isFinite(wallDir.x) || !Number.isFinite(wallDir.z) || wallDir.lengthSq() < 1e-12) {
        wallDir = new THREE.Vector3(1, 0, 0);
    }
    const outward = new THREE.Vector3(-wallDir.z, 0, wallDir.x);

    const S = worldStart.clone();
    const E = worldEnd.clone();

    const yBot = worldStart.y + _baseOffset;
    const yTop = worldStart.y + _baseOffset + _height;

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

    // §MITER-SEGMENT-CLAMP (L-93, founder 2026-07-04) — axial bounds of the two miter
    // planes (centreline endpoints) measured along the wall direction from `S`. A cap
    // vertex projected along `wallDir` may legitimately extend PAST its own end (the outer
    // miter overhang that meets the neighbour's outer face), but it must NEVER RETREAT past
    // the OPPOSITE cap's plane — that is the self-intersecting spike the founder sees when a
    // door sits within a half-thickness of an L-corner (the tiny wall sliver between the door
    // jamb and the corner is shorter than the 45° miter reach, so the inner corner slides
    // BACKWARD into the door void → a triangular notch/spike in plan). Clamping the retreat
    // keeps the sliver a clean, positive-area, non-self-intersecting prism.
    const _axialOf = (p: THREE.Vector3): number => (p.x - S.x) * wallDir.x + (p.z - S.z) * wallDir.z;
    const _axialStart = _axialOf(centerlineStart);
    const _axialEnd = _axialOf(centerlineEnd);

    function project(
        base: P3,
        miterPlaneOrigin: THREE.Vector3,
        mn: { nx: number; nz: number } | null | undefined,
        dir: THREE.Vector3,
        isEnd: boolean = false,
    ): P3 {
        if (!mn) return base;

        // §WALL-NAN-GUARD (2026-06-25) — if the miter normal itself is non-finite
        // (a degenerate consensus/bisector that escaped the resolver guards) the
        // existing `Math.abs(mnDotDir) < 1e-9` test FAILS OPEN, because
        // `Math.abs(NaN) < 1e-9` is false — so a NaN `t` would slide into the
        // vertex and poison computeBoundingBox()/Sphere(). Square-cap (return the
        // un-projected base) when MN is non-finite so the cap is valid, not NaN.
        if (!Number.isFinite(mn.nx) || !Number.isFinite(mn.nz)) return base;

        const mnDotDir = mn.nx * dir.x + mn.nz * dir.z;
        if (!Number.isFinite(mnDotDir) || Math.abs(mnDotDir) < 1e-9) return base;

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

        // §MITER-SEGMENT-CLAMP (L-93) — forbid a cap vertex from crossing the OPPOSITE
        // miter plane along the wall axis (the spike). The forward overhang is preserved.
        const baseAxial = (base[0] - S.x) * wallDir.x + (base[2] - S.z) * wallDir.z;
        const projAxial = baseAxial + t;
        if (isEnd) {
            // End cap: may extend past `_axialEnd`, but must not retreat behind the START plane.
            if (projAxial < _axialStart) t += (_axialStart - projAxial);
        } else {
            // Start cap: may extend before `_axialStart`, but must not advance past the END plane.
            if (projAxial > _axialEnd) t -= (projAxial - _axialEnd);
        }

        return [base[0] + t * dir.x, base[1], base[2] + t * dir.z];
    }

    const sDir = wallDir.clone();
    const eDir = wallDir.clone();

    const sOB = project(startBase(+1, yBot), centerlineStart, startMN, sDir, false);
    const sOT = project(startBase(+1, yTop), centerlineStart, startMN, sDir, false);
    const sIB = project(startBase(-1, yBot), centerlineStart, startMN, sDir, false);
    const sIT = project(startBase(-1, yTop), centerlineStart, startMN, sDir, false);

    const eOB = project(endBase(+1, yBot), centerlineEnd, endMN, eDir, true);
    const eOT = project(endBase(+1, yTop), centerlineEnd, endMN, eDir, true);
    const eIB = project(endBase(-1, yBot), centerlineEnd, endMN, eDir, true);
    const eIT = project(endBase(-1, yTop), centerlineEnd, endMN, eDir, true);

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

    // §WALL-NAN-GUARD (2026-06-25) — final backstop. If any cap vertex is still
    // non-finite (an unforeseen degeneracy upstream), rebuild the prism as a plain
    // butt-capped box (no miter projection) so the geometry committed to the
    // renderer is always finite. A square-capped wall beats a NaN flood + a wall
    // that vanishes from the scene. Logged once per process to avoid per-frame spam.
    let _finite = true;
    for (let i = 0; i < pos.length; i++) {
        if (!Number.isFinite(pos[i])) { _finite = false; break; }
    }
    if (!_finite) {
        if (!_miterPrismNanWarned) {
            _miterPrismNanWarned = true;
            console.warn(
                '[MiterPrismBuilder] §WALL-NAN-GUARD non-finite miter-prism vertex ' +
                '— falling back to a square-capped box (this log is one-shot).',
            );
        }
        const bSOB = startBase(+1, yBot), bSOT = startBase(+1, yTop);
        const bSIB = startBase(-1, yBot), bSIT = startBase(-1, yTop);
        const bEOB = endBase(+1, yBot),   bEOT = endBase(+1, yTop);
        const bEIB = endBase(-1, yBot),   bEIT = endBase(-1, yTop);
        const pos2: number[] = [];
        const nrm2: number[] = [];
        const tri2 = (a: P3, b: P3, c: P3, nx: number, ny: number, nz: number) => {
            pos2.push(...a, ...b, ...c);
            nrm2.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
        };
        const quad2 = (a: P3, b: P3, c: P3, d: P3, nx: number, ny: number, nz: number) => {
            tri2(a, b, c, nx, ny, nz); tri2(a, c, d, nx, ny, nz);
        };
        quad2(bSOB, bEOB, bEOT, bSOT,  outward.x, 0, outward.z);
        quad2(bSIB, bSIT, bEIT, bEIB, -outward.x, 0, -outward.z);
        quad2(bSOT, bEOT, bEIT, bSIT,  0, 1, 0);
        quad2(bSIB, bEIB, bEOB, bSOB,  0, -1, 0);
        quad2(bSOB, bSOT, bSIT, bSIB, -wallDir.x, 0, -wallDir.z);
        quad2(bEOB, bEIB, bEIT, bEOT,  wallDir.x, 0,  wallDir.z);
        const fb = new THREE.BufferGeometry();
        fb.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3));
        fb.setAttribute('normal',   new THREE.Float32BufferAttribute(nrm2, 3));
        return fb;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('normal',   new THREE.Float32BufferAttribute(nrm, 3));
    return geom;
}
