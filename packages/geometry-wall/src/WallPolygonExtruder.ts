// WallPolygonExtruder — vertical prism extrusion of a 2-D wall footprint polygon
// (ADR-0055 P3a). PURE geometry builder; one call → one closed BufferGeometry.
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
    for (let i = 1; i < n - 1; i++) {
        pushV(polygon[0]!.x,     yTop, polygon[0]!.z,     0, 1, 0);
        pushV(polygon[i + 1]!.x, yTop, polygon[i + 1]!.z, 0, 1, 0);
        pushV(polygon[i]!.x,     yTop, polygon[i]!.z,     0, 1, 0);
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
    for (let i = 0; i < n; i++) {
        const a = polygon[i]!;
        const b = polygon[(i + 1) % n]!;
        const ex = b.x - a.x;
        const ez = b.z - a.z;
        const L = Math.hypot(ex, ez) || 1;
        const nx =  ez / L;
        const nz = -ex / L;

        // Triangle 1: a-bottom → b-top → b-bottom  (CCW from outward)
        pushV(a.x, yBot, a.z, nx, 0, nz);
        pushV(b.x, yTop, b.z, nx, 0, nz);
        pushV(b.x, yBot, b.z, nx, 0, nz);
        // Triangle 2: a-bottom → a-top → b-top    (CCW from outward)
        pushV(a.x, yBot, a.z, nx, 0, nz);
        pushV(a.x, yTop, a.z, nx, 0, nz);
        pushV(b.x, yTop, b.z, nx, 0, nz);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3));
    geom.computeBoundingBox();
    geom.computeBoundingSphere();
    return geom;
}
