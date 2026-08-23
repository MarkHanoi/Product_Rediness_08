// ─────────────────────────────────────────────────────────────────────────────
// §ROOF-SLOPE-METRE-UVS — the THREE adapter for `pure/slopeUvs.ts`.
// C100 §10.16 (slice S34, minted in §10.15.f as "S33"). L-10020 … L-10025.
//
// One call, at the single public entry point every roof generator returns
// through. It writes `uv`, rewrites `index` to point at the split slots, and
// STAMPS the geometry as metres so `uvSpaceOfGeometry()` stops refusing the
// material's maps (C100 §10.9.e — the stamp is a DECLARATION by the only party
// that knows, never a heuristic read off the numbers).
//
// ⛔ WHAT IT DELIBERATELY DOES NOT DO — `computeVertexNormals()`. The normals on
// the geometry when this runs are the ones every existing roof has today; the
// split copies them verbatim. Recomputing after a split would weld nothing and
// flat-shade the eave, which is a shading change on every roof in every project
// in exchange for a texture most of them do not carry. C100 §10.15.f's rule —
// deliver the cost and none of the benefit and you have shipped a regression —
// applies to shading exactly as it applied to the default colour.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from '@pryzm/renderer-three/three';
import { stampMetreUvs } from '@pryzm/core-app-model/material-resolver';
import { computeSlopeMetreUvs } from './pure/slopeUvs.js';

/** Named outcome — C100 §5: a refusal and a success may not be the same value. */
export type RoofSlopeUvOutcome =
    | {
          readonly applied: true;
          /** Vertices the per-frame split added (0 for a single-plane roof). */
          readonly splitVertices: number;
          /** Distinct face planes: 1 flat, 3 gable-ish, 4+ hip. */
          readonly frames: number;
          /** Zero-area triangles that had no plane to follow. */
          readonly degenerateFaces: number;
      }
    | { readonly applied: false; readonly reason: string };

/**
 * Give `geo` real-world-metre UVs measured ALONG THE SLOPE, and declare them.
 *
 * Idempotent by refusal: a geometry that already carries `uv` is left alone and
 * says so, so a builder that parameterises itself exactly (a barrel vault would
 * need arc length, not a per-face frame) can opt out simply by getting there
 * first.
 */
export function applySlopeMetreUvs(geo: THREE.BufferGeometry): RoofSlopeUvOutcome {
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
    const idxAttr = geo.getIndex();
    if (!posAttr) return { applied: false, reason: 'geometry carries no position attribute' };
    if (!idxAttr) return { applied: false, reason: 'geometry is not indexed' };
    if (geo.getAttribute('uv')) return { applied: false, reason: 'geometry already declares uv' };
    // ⚠ The pure core reads a FLAT xyz triple array. An interleaved attribute has
    // the same `.array` type and a different layout, so it would be read as
    // garbage rather than rejected — refuse by name instead. No roof builder
    // produces one today; this exists so that one day it cannot arrive silently.
    if ((posAttr as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute) {
        return { applied: false, reason: 'position is interleaved; the slope-uv pass reads a flat xyz array' };
    }

    const plan = computeSlopeMetreUvs(
        posAttr.array as ArrayLike<number>,
        idxAttr.array as ArrayLike<number>,
        posAttr.count,
    );
    if (!plan) return { applied: false, reason: 'index buffer is not a usable triangle list' };

    const nrmAttr = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
    const srcPos  = posAttr.array as ArrayLike<number>;
    const srcNrm  = nrmAttr ? (nrmAttr.array as ArrayLike<number>) : null;

    const n   = plan.vertexCount;
    const pos = new Float32Array(n * 3);
    const nrm = srcNrm ? new Float32Array(n * 3) : null;

    for (let i = 0; i < n; i++) {
        const s = plan.sourceOf[i]!;
        pos[i * 3]     = srcPos[s * 3]!;
        pos[i * 3 + 1] = srcPos[s * 3 + 1]!;
        pos[i * 3 + 2] = srcPos[s * 3 + 2]!;
        if (nrm && srcNrm) {
            nrm[i * 3]     = srcNrm[s * 3]!;
            nrm[i * 3 + 1] = srcNrm[s * 3 + 1]!;
            nrm[i * 3 + 2] = srcNrm[s * 3 + 2]!;
        }
    }

    // ⚠ `groups` are index-space ranges and the index array keeps its length AND
    // its order — only the VALUES inside it move — so every material group still
    // covers exactly the triangles it covered before. Nothing re-adds them.
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (nrm) geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(plan.uv, 2));
    // ⚠ Keep the 16-bit index THREE's own `setIndex(number[])` would have chosen.
    // Every roof here is far under 65 536 vertices, and silently promoting the
    // whole family to 32-bit indices would be a GPU-memory change nobody asked
    // for on the 99 % of roofs that carry no texture at all.
    geo.setIndex(new THREE.BufferAttribute(
        n > 65535 ? plan.index : Uint16Array.from(plan.index),
        1,
    ));

    stampMetreUvs(geo as unknown as { userData?: Record<string, unknown> });

    return {
        applied:         true,
        splitVertices:   plan.splitVertices,
        frames:          plan.frames,
        degenerateFaces: plan.degenerateFaces,
    };
}
