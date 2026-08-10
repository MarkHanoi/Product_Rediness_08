// WallPolygonExtruder — prism extrusion of a 2-D wall footprint polygon
// (ADR-0055 P3a). PURE geometry builder; one call → one closed BufferGeometry.
//
// §WALL-RAKE (2026-08-09): the prism is VERTICAL by default and SHEARED when
// `opts.topOffset` is supplied — the base polygon is untouched and the top polygon
// is that same polygon translated horizontally. That single choice is what keeps a
// raked wall cheap: the plan footprint, the junction corners and every opening
// offset are unchanged, because they are all properties of the BASE polygon.
//
// Input  : a CCW polygon in plan-XZ produced by `WallFootprint2D.buildWallFootprint`
//          (4 / 5 / 6 vertices — see ADR-0055 §4 for the layout).
// Output : a non-indexed BufferGeometry with per-face normals (hard edges) — top
//          face (n-2 fan), bottom face (n-2 reversed fan), side faces (one quad
//          per polygon edge with the outward normal).
//
// The Pascal property carries through: because the footprint polygon already has
// the junction pivot + inside/outside corner vertices baked in, the extruded
// 3-D side faces are EDGE-COINCIDENT with the neighbouring wall's side faces.
// No void → no T/L/X wedge → no junction infill prism needed (P3b retires the
// `WallJunctionInfillManager` once this is wired).
//
// Replaces `MiterPrismBuilder` per ADR-0055 §5 — the old miter-plane projection
// is no longer needed because the polygon vertices are already the final corner
// positions in plan; vertical extrusion is now mechanical.

import * as THREE from '@pryzm/renderer-three/three';
import type { WallFootprint } from './WallFootprint2D';

export interface ExtrudeOpts {
    /** Wall height in metres (top face Y = elevation + baseOffset + height). */
    readonly height: number;
    /** Y-offset from level elevation (e.g. plinth walls start above the slab). Default 0. */
    readonly baseOffset?: number;
    /** Level elevation (Y of the level's floor in world coords). Default 0. */
    readonly elevation?: number;
    /**
     * §WALL-RAKE — horizontal displacement of the TOP polygon relative to the BASE
     * polygon, in world-XZ metres. Absent / null / (0,0) ⇒ a VERTICAL wall and the
     * pre-existing code path runs unchanged, vertex-for-vertex and normal-for-normal.
     *
     * Produced by `WallRake.rakeTopOffset(rakeAngleDeg, height, direction)`; never
     * computed here, because the sign convention lives in exactly one module.
     *
     * The extrusion becomes a SHEARED prism: the base polygon is untouched (so the
     * wall's plan footprint, its junction corners and every opening offset are
     * identical to the vertical case), and the top polygon is that same polygon
     * translated by this vector. Top and bottom faces therefore stay HORIZONTAL —
     * only the side faces tilt, and their normals are recomputed accordingly.
     */
    readonly topOffset?: { readonly x: number; readonly z: number } | null;
    /**
     * §WALL-RAKE-JOINT (ADR-0312) — PER-VERTEX horizontal displacements of the top
     * polygon, index-aligned with `footprint.polygon`. Supersedes `topOffset` when
     * present and valid. Produced by `WallPipelineV2Cache.rakedTopOffsets()` (the
     * twin-solve loft): each base vertex travels along the true 3-D mitre line it
     * shares with its neighbour walls, so a joint between walls of DIFFERENT rake
     * angles (including raked-meets-vertical) closes at every elevation, not just
     * the floor.
     *
     * Honest degradation: a length mismatch or a non-finite entry means the caller
     * and this builder disagree about the polygon — the array is IGNORED and the
     * uniform `topOffset` (floor-exact ADR-0310 behaviour) is used instead. Never
     * a throw (§FIX-RAKE-REFUSAL-IS-NOT-A-CRASH).
     */
    readonly topOffsets?: ReadonlyArray<{ readonly x: number; readonly z: number }> | null;
}

/** Vertex-count contract — useful for tests, kept here for `expect(...)` parity. */
export function expectedVertexCount(polygonLength: number): number {
    const n = polygonLength;
    // top fan: 3 * (n − 2); bottom fan: 3 * (n − 2); sides: 6 * n (2 triangles per quad).
    return 6 * (n - 2) + 6 * n;
}

/**
 * Build a closed prism for one wall footprint. Coordinates are world-frame
 * (plan-XZ + vertical Y); the caller is responsible for any THREE.Group or
 * material assignment.
 *
 * Face order in the buffer:
 *   1. Top face triangles (normal +Y).
 *   2. Bottom face triangles (normal −Y, winding reversed so they face down).
 *   3. Side face quads (normal = outward perpendicular of the edge in XZ).
 *
 * The polygon is treated as CCW from above — the WallFootprint2D builder
 * guarantees this for every junction case (the tests in `wallFootprint2D.test.ts`
 * pin it via `signedArea > 0`).
 */
export function buildWallExtrusion(
    footprint: WallFootprint,
    opts: ExtrudeOpts,
): THREE.BufferGeometry {
    const polygon = footprint.polygon;
    const n = polygon.length;
    if (n < 3) {
        // Degenerate; return an empty geometry rather than throw — wall builders
        // can swallow these via mesh.visible=false. Keeps the pipeline best-effort.
        const empty = new THREE.BufferGeometry();
        empty.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
        empty.setAttribute('normal',   new THREE.Float32BufferAttribute([], 3));
        return empty;
    }

    const elevation = opts.elevation ?? 0;
    const baseOffset = opts.baseOffset ?? 0;
    const yBot = elevation + baseOffset;
    const yTop = yBot + opts.height;

    // §WALL-RAKE — the top polygon's horizontal displacement. Zero (or absent) means
    // VERTICAL, and every branch below then takes the exact original arithmetic, so a
    // vertical wall's buffer is bit-identical to the pre-rake build.
    const _off = opts.topOffset;
    const dTopX = _off && Number.isFinite(_off.x) ? _off.x : 0;
    const dTopZ = _off && Number.isFinite(_off.z) ? _off.z : 0;

    // §WALL-RAKE-JOINT (ADR-0312) — per-vertex top offsets, when supplied AND valid
    // (index-aligned with the polygon, every entry finite). Invalid input degrades to
    // the uniform `topOffset` path — never a throw.
    const _pv = opts.topOffsets;
    const perVertex =
        !!_pv && _pv.length === n && _pv.every(o => o && Number.isFinite(o.x) && Number.isFinite(o.z));
    /** Top-polygon X displacement of vertex i. */
    const offX = (i: number): number => (perVertex ? _pv![i]!.x : dTopX);
    /** Top-polygon Z displacement of vertex i. */
    const offZ = (i: number): number => (perVertex ? _pv![i]!.z : dTopZ);
    const raked = perVertex
        ? _pv!.some(o => o.x !== 0 || o.z !== 0)
        : (dTopX !== 0 || dTopZ !== 0);

    const positions: number[] = [];
    const normals:   number[] = [];

    const pushV = (x: number, y: number, z: number, nx: number, ny: number, nz: number): void => {
        positions.push(x, y, z);
        normals.push(nx, ny, nz);
    };

    // ── Top face (+Y) — REVERSED winding ─────────────────────────────────────
    // ADR-0055 §P3a-FAN-WIND-FIX (2026-05-27, live-fix after architect screenshot
    // showing wall bodies rendering as planar slabs in 3D, plan view correct):
    //
    // `WallFootprint2D` emits the polygon as `[sR, eR, (endPivot?), eL, sL,
    // (startPivot?)]`. With `leftPerp = (-d.z, d.x)`, sL sits on the +Z side of
    // the start and sR on the −Z side; the polygon CW when viewed from +Y
    // (the polygon's geometric normal — computed via `(v1−v0) × (v2−v0)` — points
    // -Y, NOT +Y). This matches Pascal's footprint order (`wall-footprint.ts`:
    // `[pStartRight, pEndRight, …, pStartLeft]` is also CW in world XZ; Pascal
    // compensates with the `y = -z` flip when feeding `THREE.Shape` to
    // `ExtrudeGeometry`).
    //
    // Our hand-built extruder previously used the forward fan order (P0, Pi,
    // Pi+1) for the top face and the reversed order for the bottom — the SAME
    // assumption Pascal makes about the polygon being CCW from +Y. That
    // produced geometric face normals OPPOSITE to the declared (0, ±1, 0):
    // top fan computed normal -Y but declared +Y → top BACK-FACE-CULLED from
    // above. Bottom fan computed +Y but declared -Y → bottom culled from below.
    // The side faces stay correct (their `(b−a) × (top−bot)` = +h·n matches
    // the declared outward normal). Result: only the SIDE faces render → wall
    // looks like a thin paper-thin slab from any angle but has the correct
    // outline in plan (the polygon is what the plan view exports).
    //
    // Fix: SWAP the fan orders. Top now reverses (P0, Pi+1, Pi); bottom now
    // forwards (P0, Pi, Pi+1). Geometric normals match declared ones again.
    //
    // §WALL-RAKE: the top polygon is the base polygon TRANSLATED horizontally by
    // (dTopX, dTopZ). A translation preserves both the shape and the winding, so the
    // fan order — and the +Y normal, since the top face is still a horizontal plane —
    // are correct unchanged. dTop* are 0 for a vertical wall.
    // §WALL-RAKE-JOINT: with per-vertex offsets the top face is still HORIZONTAL
    // (all vertices at yTop) — only the in-plane shape differs vertex-by-vertex —
    // so the +Y normal and the reversed fan order remain correct.
    for (let i = 1; i < n - 1; i++) {
        pushV(polygon[0]!.x     + offX(0),     yTop, polygon[0]!.z     + offZ(0),     0, 1, 0);
        pushV(polygon[i + 1]!.x + offX(i + 1), yTop, polygon[i + 1]!.z + offZ(i + 1), 0, 1, 0);
        pushV(polygon[i]!.x     + offX(i),     yTop, polygon[i]!.z     + offZ(i),     0, 1, 0);
    }

    // ── Bottom face (−Y) — FORWARD winding (matches CW-from-+Y polygon) ───────
    for (let i = 1; i < n - 1; i++) {
        pushV(polygon[0]!.x,     yBot, polygon[0]!.z,     0, -1, 0);
        pushV(polygon[i]!.x,     yBot, polygon[i]!.z,     0, -1, 0);
        pushV(polygon[i + 1]!.x, yBot, polygon[i + 1]!.z, 0, -1, 0);
    }

    // ── Side faces: one outward-facing quad per polygon edge ─────────────────
    // For a CCW polygon (viewed from +Y), the OUTWARD normal of an edge a→b is
    // the perpendicular obtained by rotating (b − a) by −90° in XZ:
    //   n = ( (b.z − a.z),  0,  −(b.x − a.x) )  normalised.
    //
    // FRONT-FACE WINDING (three.js: CCW from the camera → front-facing). Stand
    // OUTSIDE the prism looking inward along −n: a is on your LEFT, b on your
    // RIGHT, top is UP, bottom is DOWN. The CCW vertex order is
    //   a-bot → b-top → b-bot   (T1)
    //   a-bot → a-top → b-top   (T2)
    // Cross-checked: (b−a) × (top−bot) = h·(ez, 0, −ex) = h·n ✓ — the winding's
    // computed face normal aligns with the declared `n`, so three.js's default
    // back-face culling renders the face from the outward side (the previous
    // [a-bot, b-bot, a-top] winding had a flipped sign and the wall rendered
    // back-side-out, giving the near-black, metallic-looking surface the user
    // reported in the 2026-05-27 manual-wall test).
    //
    // §WALL-RAKE — under a shear each side quad is still PLANAR (a parallelogram
    // spanned by the base edge e = b − a and the rise v = (dTopX, height, dTopZ)),
    // but it is no longer vertical, so its normal picks up a Y component:
    //
    //     n ∝ v × e = ( h·ez ,  dTopZ·ex − dTopX·ez ,  −h·ex )
    //
    // With dTop = 0 this collapses to (h·ez, 0, −h·ex) ∝ (ez, 0, −ex) — exactly the
    // vertical-case normal above. The vertical branch is nevertheless kept SEPARATE
    // and untouched so a 90° wall's floats are bit-identical, not merely equal to
    // within rounding.
    // §WALL-RAKE-JOINT — with PER-VERTEX offsets a side quad's two top corners can
    // drift by different vectors, so the quad need not stay planar (a cap or pivot
    // edge between two differently-raked mitre lines). Its two triangles then get
    // their own GEOMETRIC normals (normalised cross products, same winding). A
    // wall's true SIDE faces remain planar — both their top corners lie on the
    // wall's own sheared face plane — so those two triangle normals coincide and
    // the render is indistinguishable from a single-quad normal there.
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const a = polygon[i]!;
        const b = polygon[j]!;
        const ex = b.x - a.x;
        const ez = b.z - a.z;

        const atx = a.x + offX(i), atz = a.z + offZ(i);
        const btx = b.x + offX(j), btz = b.z + offZ(j);

        if (perVertex) {
            const edgeL = Math.hypot(ex, ez) || 1;
            const fx = ez / edgeL, fz = -ex / edgeL;      // horizontal edge-perp fallback
            /** Outward geometric normal of triangle (v0, v1, v2) — (v1−v0)×(v2−v0). */
            const triN = (
                x0: number, y0: number, z0: number,
                x1: number, y1: number, z1: number,
                x2: number, y2: number, z2: number,
            ): readonly [number, number, number] => {
                const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0;
                const vx = x2 - x0, vy = y2 - y0, vz = z2 - z0;
                const cx = uy * vz - uz * vy;
                const cy = uz * vx - ux * vz;
                const cz = ux * vy - uy * vx;
                const cl = Math.hypot(cx, cy, cz);
                if (!(cl > 1e-12)) return [fx, 0, fz];    // degenerate sliver → horizontal perp
                return [cx / cl, cy / cl, cz / cl];
            };
            // Triangle 1: a-bottom → b-top → b-bottom  (CCW from outward)
            const n1 = triN(a.x, yBot, a.z, btx, yTop, btz, b.x, yBot, b.z);
            pushV(a.x, yBot, a.z, n1[0], n1[1], n1[2]);
            pushV(btx, yTop, btz, n1[0], n1[1], n1[2]);
            pushV(b.x, yBot, b.z, n1[0], n1[1], n1[2]);
            // Triangle 2: a-bottom → a-top → b-top    (CCW from outward)
            const n2 = triN(a.x, yBot, a.z, atx, yTop, atz, btx, yTop, btz);
            pushV(a.x, yBot, a.z, n2[0], n2[1], n2[2]);
            pushV(atx, yTop, atz, n2[0], n2[1], n2[2]);
            pushV(btx, yTop, btz, n2[0], n2[1], n2[2]);
            continue;
        }

        let nx: number, ny: number, nz: number;
        if (raked) {
            const h = yTop - yBot;
            const cx =  h * ez;
            const cy =  dTopZ * ex - dTopX * ez;
            const cz = -h * ex;
            const cl = Math.hypot(cx, cy, cz) || 1;
            nx = cx / cl; ny = cy / cl; nz = cz / cl;
        } else {
            const L = Math.hypot(ex, ez) || 1;
            nx =  ez / L; ny = 0; nz = -ex / L;
        }

        // Triangle 1: a-bottom → b-top → b-bottom  (CCW from outward)
        pushV(a.x, yBot, a.z, nx, ny, nz);
        pushV(btx, yTop, btz, nx, ny, nz);
        pushV(b.x, yBot, b.z, nx, ny, nz);
        // Triangle 2: a-bottom → a-top → b-top    (CCW from outward)
        pushV(a.x, yBot, a.z, nx, ny, nz);
        pushV(atx, yTop, atz, nx, ny, nz);
        pushV(btx, yTop, btz, nx, ny, nz);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3));
    geom.computeBoundingBox();
    geom.computeBoundingSphere();
    return geom;
}
