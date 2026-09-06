// SpaceEnvelopeProfileFrame — the ONE map between a space envelope's world FOOTPRINT
// (metres, world X/Z) and the `u`/`v` authoring frame the shared outline surface draws in.
// §RESI-STAGE-G (2026-09-06) · C114 §10b / §11 item 7 · C86 §10.6.1 · C84 EI-9 · P5-adjacent
// purity (this file is L2 and has no DOM, no THREE, no store, no bus).
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ WHY A FRAME EXISTS AT ALL, AND WHY IT IS *HERE* RATHER THAN IN THE TOOL
// ═══════════════════════════════════════════════════════════════════════════════
//
// C114 §10b: *"THE PROFILE EDITOR IS JOINED, NOT REBUILT … ⛔ A new outline surface is
// forbidden."* The surface PRYZM already has (`ElevationOutlineSurface`, reached through
// `WallProfileEditorPort`) authors a ring in a 2-D frame whose axes it calls `u` and `v`,
// both in metres, both non-negative, and CLAMPED to a declared extent box
// (`ElevationOutlineSurface._onPointerMove`: `clamp(snap(m.u), 0, s.length)`).
//
// A space envelope's footprint is not in that frame: it is a ring in WORLD X/Z, it can sit
// anywhere on the site, and its coordinates are routinely negative. So exactly one thing
// has to exist for the reuse to be honest — an affine map between the two frames, and its
// inverse. That map is arithmetic over four numbers, it is the thing a test can pin, and
// it is the thing that is wrong when a committed footprint lands somewhere the author did
// not draw. It therefore lives in the pure package with the rest of the prism arithmetic,
// NOT inside the L7 tool that opens the dialog (C84 EI-9: one answer, one place).
//
// ─── THE DIMENSIONAL CONTRACT, STATED ONCE ──────────────────────────────────────
//
//     u = worldX - originX                      worldX = originX + u
//     v = height - (worldZ - originZ)           worldZ = originZ + (height - v)
//
// ⭐ `v` IS FLIPPED AGAINST WORLD Z, DELIBERATELY. The surface draws `v` UPWARD
// (`y = pad + (height - v) * scale`). A plan drawing reads with world +Z going DOWN the
// page — that is the convention `spaceEnvelopePlanGeometry` already draws the same rings
// in. Without the flip the author would edit a footprint that is MIRRORED relative to the
// plan and the 3-D view, and every vertex would still be inside the box, so nothing would
// look broken: a well-formed wrong answer with no symptom. The flip is applied in BOTH
// directions by the same constant, so `footprintFromProfileRing(frame, frame.ring)`
// reproduces the input ring exactly — which is the property the test pins.
//
// ⛔ `height` HERE IS THE PLAN DEPTH ALONG WORLD Z. IT IS NOT THE PRISM'S HEIGHT.
// The name is not a choice: `OutlineSurfaceOptions.extents` is `{ length, height }` and
// C86 PR-8 (quoted in `ElevationOutlineSurface`'s header) forbids minting a second size
// vocabulary — *"the extents stay `{ length, height }` for every subject … Admitting a
// second spelling would … make every consumer learn two ways to ask one question."* So the
// FIELD keeps the shared spelling and the MEANING is declared here and carried by
// `vLabel`, which the surface stamps into the DOM. A reader who assumes `frame.height` is
// `record.height` gets a footprint editor scaled to the storey's vertical extent; that is
// what this paragraph exists to prevent.
//
// ─── HEADROOM: WHY THE BOX IS BIGGER THAN THE RING ──────────────────────────────
// The surface CLAMPS every dragged vertex into `[0, length] × [0, height]`. A box fitted
// exactly to the footprint's bounding box would therefore make the outline editor a
// SHRINK-ONLY tool: no vertex could ever be dragged outward, and the author would get no
// message saying why — the affordance would simply refuse to follow the pointer. So the
// box is the bounding box GROWN by `headroomFor()` on all four sides, and the ring is
// placed inside it at that offset.
//
// ⛔ HEADROOM IS NOT PERMISSION. Growing the drawing box does not grow what the model
// accepts: `spaceEnvelope.setFootprint` re-asks `containmentRefusalFor`, so a room ring
// dragged into the headroom but out of its level is REFUSED with both numbers (C114 §12a,
// §14c). This constant decides how far the pointer may travel, never what is legal.

import { trace, type Tracer } from '@opentelemetry/api';
import { footprintAreaM2, type EnvelopePoint } from './SpaceEnvelopeGeometry.js';
import { MIN_FOOTPRINT_AREA_M2 } from './SpaceEnvelopeTypes.js';

let tracer: Tracer | undefined;
function getTracer(): Tracer {
    if (!tracer) tracer = trace.getTracer('@pryzm/geometry-space-envelope', '0.1.0');
    return tracer;
}

/** One vertex of the authoring ring, in the surface's own `u`/`v` metres. */
export interface ProfileFrameVertex {
    readonly u: number;
    readonly v: number;
}

/**
 * The affine frame a footprint is authored in, plus the ring expressed in it.
 *
 * Everything needed to open the shared surface AND to read its result back is here, so a
 * caller never re-derives an origin from a footprint it no longer holds.
 */
export interface SpaceEnvelopeProfileFrame {
    /** World X of `u = 0`. */
    readonly originX: number;
    /** World Z of `v = height` — the TOP of the drawing (see the flip, above). */
    readonly originZ: number;
    /** `u` extent, metres. The surface's `extents.length`. */
    readonly length: number;
    /** `v` extent, metres — THE PLAN DEPTH ALONG WORLD Z, not the prism height. */
    readonly height: number;
    /** The footprint, in frame coordinates, vertex-for-vertex and in input order. */
    readonly ring: readonly ProfileFrameVertex[];
    /** The headroom applied on each of the four sides, metres. Reported, never inferred. */
    readonly headroomM: number;
}

/** Why a footprint could not be given a frame. A closed union — the caller must handle each. */
export type ProfileFrameRefusalCode =
    | 'TOO_FEW_VERTICES'
    | 'NON_FINITE_VERTEX'
    | 'DEGENERATE_EXTENT'
    | 'DEGENERATE_AREA';

export interface ProfileFrameRefusal {
    readonly code: ProfileFrameRefusalCode;
    /** ⭐ Carries BOTH numbers wherever two exist (C114 §12a) — measured, never re-typed. */
    readonly message: string;
}

/**
 * ⛔ The smallest headroom, metres. A tiny room (say 1.2 × 1.0 m) still needs enough slack
 * that a vertex can be pulled outward far enough to see it move; 25 % of 1.2 m is 30 cm,
 * which at typical zoom is a few pixels.
 */
export const MIN_PROFILE_HEADROOM_M = 1;
/**
 * ⛔ The largest headroom, metres. Without a ceiling, a 200 m storey outline would be drawn
 * inside a 300 m box and the ring would occupy the middle third of the dialog — the author
 * would be editing a stamp. This bounds the wasted drawing area rather than the model.
 */
export const MAX_PROFILE_HEADROOM_M = 10;
/** Below this an axis has no extent to draw. A drawing floor, not a modelling tolerance. */
export const MIN_HORIZONTAL_EXTENT_M = 1e-4;

/** The fraction of the larger bounding-box side offered as slack on each side. */
export const PROFILE_HEADROOM_FRACTION = 0.25;

/**
 * The slack offered around a bounding box of `w × d` metres.
 *
 * Exported so a test pins the RULE rather than a magic number observed in an output, and so
 * the tool can state the number in its own status line without re-deriving it.
 */
export function headroomFor(w: number, d: number): number {
    const raw = PROFILE_HEADROOM_FRACTION * Math.max(w, d);
    return Math.min(MAX_PROFILE_HEADROOM_M, Math.max(MIN_PROFILE_HEADROOM_M, raw));
}

/**
 * Build the authoring frame for a footprint, or refuse by name.
 *
 * ⛔ IT NEVER REPAIRS THE RING. A footprint with two vertices, a NaN, or no area is
 * REFUSED — not padded, deduplicated or convex-hulled — because the caller's next act is to
 * hand the result to an editor the author will commit, and a silently-repaired ring commits
 * a shape nobody drew.
 */
export function spaceEnvelopeProfileFrame(
    footprint: readonly { readonly x: number; readonly z: number }[],
    opts: { readonly headroomM?: number } = {},
): SpaceEnvelopeProfileFrame | ProfileFrameRefusal {
    return getTracer().startActiveSpan('spaceEnvelope.profileFrame', (span) => {
        try {
            if (!Array.isArray(footprint) || footprint.length < 3) {
                return {
                    code: 'TOO_FEW_VERTICES' as const,
                    message:
                        `a footprint needs at least 3 vertices to be edited as an outline `
                        + `(this one has ${Array.isArray(footprint) ? footprint.length : 0})`,
                };
            }
            for (let i = 0; i < footprint.length; i += 1) {
                const p = footprint[i]!;
                if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) {
                    return {
                        code: 'NON_FINITE_VERTEX' as const,
                        message: `vertex ${i} is not a finite point (x=${p.x}, z=${p.z}) — refusing to draw it`,
                    };
                }
            }

            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            for (const p of footprint) {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.z < minZ) minZ = p.z;
                if (p.z > maxZ) maxZ = p.z;
            }
            const w = maxX - minX;
            const d = maxZ - minZ;
            // ⛔ BOTH NUMBERS. A zero-extent ring is a line: the surface would divide by a
            // zero scale, and every vertex would land on one pixel. The refusal names the
            // extent measured and the floor it failed, so the author is told which axis.
            if (!(w > MIN_HORIZONTAL_EXTENT_M) || !(d > MIN_HORIZONTAL_EXTENT_M)) {
                return {
                    code: 'DEGENERATE_EXTENT' as const,
                    message:
                        `this footprint has no area to draw — it measures ${w.toFixed(3)} m across X `
                        + `and ${d.toFixed(3)} m across Z, and an outline editor needs more than `
                        + `${MIN_HORIZONTAL_EXTENT_M} m on both`,
                };
            }
            const area = footprintAreaM2(footprint.map((p) => ({ x: p.x, y: 0, z: p.z })));
            if (!(area > MIN_FOOTPRINT_AREA_M2)) {
                return {
                    code: 'DEGENERATE_AREA' as const,
                    message:
                        `this footprint encloses ${area.toFixed(6)} m², below the ${MIN_FOOTPRINT_AREA_M2} m² `
                        + 'floor — its vertices do not bound an area',
                };
            }

            const headroomM = opts.headroomM !== undefined && Number.isFinite(opts.headroomM) && opts.headroomM >= 0
                ? opts.headroomM
                : headroomFor(w, d);
            const originX = minX - headroomM;
            const originZ = minZ - headroomM;
            const length = w + 2 * headroomM;
            const height = d + 2 * headroomM;

            const frame: SpaceEnvelopeProfileFrame = {
                originX,
                originZ,
                length,
                height,
                headroomM,
                // The flip is applied HERE and inverted by `footprintFromProfileRing` with
                // the same `height`, which is why the round trip is exact rather than close.
                ring: footprint.map((p) => ({ u: p.x - originX, v: height - (p.z - originZ) })),
            };
            span.setAttribute('pryzm.spaceEnvelope.profileFrame.vertices', frame.ring.length);
            span.setAttribute('pryzm.spaceEnvelope.profileFrame.headroomM', headroomM);
            return frame;
        } finally {
            span.end();
        }
    });
}

/**
 * The inverse map: a ring the author edited in the frame, back to world footprint vertices.
 *
 * `y` is 0 for every vertex — a footprint is a ring on the level plane, and `baseOffset`
 * lifts the prism (C114 §0). ⛔ This function does NOT judge the result: containment,
 * self-intersection and area are the command's business (`SetSpaceEnvelopeFootprintHandler`
 * re-asks the containment gate), and asking here would be the second copy C84 EI-9.2 forbids.
 */
export function footprintFromProfileRing(
    frame: Pick<SpaceEnvelopeProfileFrame, 'originX' | 'originZ' | 'height'>,
    ring: readonly ProfileFrameVertex[],
): readonly EnvelopePoint[] {
    return ring.map((p) => ({
        x: frame.originX + p.u,
        y: 0,
        z: frame.originZ + (frame.height - p.v),
    }));
}

/** Narrowing helper — a refusal carries a `code`, a frame carries a `ring`. */
export function isProfileFrameRefusal(
    r: SpaceEnvelopeProfileFrame | ProfileFrameRefusal,
): r is ProfileFrameRefusal {
    return (r as ProfileFrameRefusal).code !== undefined;
}
