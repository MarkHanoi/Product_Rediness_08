// SpaceEnvelopeSolar — per-face solar exposure, joining the room-heat-gain engine.
// §FEAT-SPACE-ENVELOPE (L-12900) · C114 §11 item 9 · directive §3.
//
// ═══════════════════════════════════════════════════════════════════════════════
// THE JOIN — and a CORRECTION to the brief that sent me here
// ═══════════════════════════════════════════════════════════════════════════════
//
// The founder's definition of an envelope (directive §3) leads with *"the surrounding
// buildings' solar impact on each of its faces"*. RESI-ORCHESTRATOR-PLAN and this
// lane's brief both named four `@pryzm/solar-analysis` symbols as
// **EXISTS-BUT-UNWIRED, zero consumers repo-wide**, and called the envelope their
// natural caller.
//
// ⚠ MEASURED 2026-09-04, AND THE CLAIM WAS HALF WRONG:
//   · `accumulateRoomHeatGain` — 0 consumers.   ✅ genuinely unwired
//   · `RoomGlazing` / `RoomHeatGain` / `DEFAULT_SHGC` — 0 consumers. ✅ genuinely unwired
//   · `accumulateSunHours` — **1 consumer**: `packages/renderer-three/src/solar/computeSunHoursOnModel.ts`
//   · `buildOccluderIndex` — **1 consumer**: `apps/editor/src/workers/solarCodec.ts`
//
// So the room-heat-gain quartet IS the unwired asset and this module is its FIRST
// consumer; the other two were already wired and the brief's citation had rotted.
// Recorded here rather than silently corrected, because a lane that quietly fixes a
// premise leaves the next reader believing the original.
//
// ─── LAYER / PURITY ─────────────────────────────────────────────────────────────
// L2 importing `@pryzm/solar-analysis` (L1, zero runtime dependencies) — a DOWNWARD
// edge, legal under the layer gate. No THREE (P2), no DOM.

import { trace, type Tracer } from '@opentelemetry/api';
import {
    accumulateRoomHeatGain,
    DEFAULT_SHGC,
    type RoomGlazing,
    type RoomHeatGainResult,
    type SolarSurface,
    type SunHoursResult,
    type Vec3 as SolarVec3,
} from '@pryzm/solar-analysis';
import { outwardNormal, prismVerticalExtent } from './SpaceEnvelopeGeometry.js';
import type { SpaceEnvelopePrism } from './SpaceEnvelopeTypes.js';

let tracer: Tracer | undefined;
function getTracer(): Tracer {
    if (!tracer) tracer = trace.getTracer('@pryzm/geometry-space-envelope', '0.1.0');
    return tracer;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ⚠ THE FRAME CAVEAT — declared, not assumed
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ⛔ READ THIS BEFORE USING THE RESULT.
 *
 * `@pryzm/solar-analysis` works in **ENU** — its own `types.ts` says
 * *"x = East, y = Up, z = South"*. A space envelope's footprint is in **PRYZM scene
 * XZ**. Those two frames are related by a site-specific rotation (true north), and
 * **this module does not know it**.
 *
 * So the surfaces built here are expressed in the SCENE frame, and the caller MUST
 * rotate them into ENU before handing them to `accumulateSunHours`. A helper that
 * silently assumed `scene ≡ ENU` would produce per-face sun-hours that are confidently
 * wrong by exactly the site's north offset — the class of defect
 * [[terrain-rasant-is-a-legal-defect]] and L-584 record, where a plausible number is
 * computed against the wrong reference and nothing in the output says so.
 *
 * This constant exists so the caveat travels with the data rather than living in a
 * comment nobody reads (C75's thesis: provenance that stops at a boundary protects
 * nothing past it).
 */
export const SPACE_ENVELOPE_SOLAR_FRAME_CAVEAT =
    'Face surfaces are expressed in PRYZM scene XZ, NOT in the ENU frame '
    + '@pryzm/solar-analysis expects. Rotate by the site north offset before calling '
    + 'accumulateSunHours, or the per-face result is wrong by exactly that angle.';

/** A face of an envelope, addressed the way the solar engine addresses a surface. */
export interface SpaceEnvelopeFaceSurface {
    /** `<envelopeId>:side:<i>` / `:top` / `:bottom` — stable, greppable, joinable. */
    readonly surfaceId: string;
    readonly envelopeId: string;
    readonly faceIndex: number | null;
    readonly kind: 'side' | 'top' | 'bottom';
    /** Face area in m² — the glazed-area basis. */
    readonly areaM2: number;
    readonly surface: SolarSurface;
}

/** The one place a face id is spelled, so a join can never drift (C84 EI-8a). */
export function spaceEnvelopeFaceSurfaceId(
    envelopeId: string,
    kind: 'side' | 'top' | 'bottom',
    faceIndex?: number,
): string {
    return kind === 'side' ? `${envelopeId}:side:${faceIndex}` : `${envelopeId}:${kind}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACE → SOLAR SURFACE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build one `SolarSurface` per face of the prism, ready for `accumulateSunHours`
 * once the caller has rotated them into ENU (see the caveat above).
 *
 * Sample points are placed at the face centre plus four offsets toward its corners,
 * so a tall façade is not represented by a single mid-height probe. `accumulateSunHours`
 * reports `minPointSunHours` / `maxPointSunHours` per surface, which is only
 * meaningful if the points actually spread across the face.
 */
export function buildSpaceEnvelopeFaceSurfaces(
    prism: SpaceEnvelopePrism,
): readonly SpaceEnvelopeFaceSurface[] {
    return getTracer().startActiveSpan('spaceEnvelope.buildFaceSurfaces', (span) => {
        try {
            const out: SpaceEnvelopeFaceSurface[] = [];
            const { baseY, topY } = prismVerticalExtent(prism);
            const midY = (baseY + topY) / 2;
            const n = prism.footprint.length;

            for (let i = 0; i < n; i += 1) {
                const a = prism.footprint[i]!;
                const b = prism.footprint[(i + 1) % n]!;
                const normal = outwardNormal(prism.footprint, i);
                if (!normal) continue;
                const edgeLen = Math.hypot(b.x - a.x, b.z - a.z);
                const areaM2 = edgeLen * prism.height;
                const cx = (a.x + b.x) / 2;
                const cz = (a.z + b.z) / 2;
                // Centre + four spread points, pulled 25% in from the extremes.
                const qLow = baseY + prism.height * 0.25;
                const qHigh = baseY + prism.height * 0.75;
                const samplePoints: SolarVec3[] = [
                    { x: cx, y: midY, z: cz },
                    { x: a.x * 0.75 + b.x * 0.25, y: qLow, z: a.z * 0.75 + b.z * 0.25 },
                    { x: a.x * 0.25 + b.x * 0.75, y: qLow, z: a.z * 0.25 + b.z * 0.75 },
                    { x: a.x * 0.75 + b.x * 0.25, y: qHigh, z: a.z * 0.75 + b.z * 0.25 },
                    { x: a.x * 0.25 + b.x * 0.75, y: qHigh, z: a.z * 0.25 + b.z * 0.75 },
                ];
                out.push({
                    surfaceId: spaceEnvelopeFaceSurfaceId(prism.id, 'side', i),
                    envelopeId: prism.id,
                    faceIndex: i,
                    kind: 'side',
                    areaM2,
                    surface: {
                        id: spaceEnvelopeFaceSurfaceId(prism.id, 'side', i),
                        normal: { x: normal.x, y: 0, z: normal.z },
                        samplePoints,
                    },
                });
            }

            // Roof and soffit. A roof face matters for a massing study; a soffit is
            // included for completeness and will simply read ~0 sun hours.
            const centroidX = prism.footprint.reduce((s, p) => s + p.x, 0) / n;
            const centroidZ = prism.footprint.reduce((s, p) => s + p.z, 0) / n;
            const capArea = capAreaM2(prism);
            for (const [kind, y, ny] of [
                ['top', topY, 1],
                ['bottom', baseY, -1],
            ] as const) {
                out.push({
                    surfaceId: spaceEnvelopeFaceSurfaceId(prism.id, kind),
                    envelopeId: prism.id,
                    faceIndex: null,
                    kind,
                    areaM2: capArea,
                    surface: {
                        id: spaceEnvelopeFaceSurfaceId(prism.id, kind),
                        normal: { x: 0, y: ny, z: 0 },
                        samplePoints: [{ x: centroidX, y, z: centroidZ }],
                    },
                });
            }

            span.setAttribute('spaceEnvelope.faceSurfaces', out.length);
            return out;
        } finally {
            span.end();
        }
    });
}

function capAreaM2(prism: SpaceEnvelopePrism): number {
    const n = prism.footprint.length;
    let acc = 0;
    for (let i = 0; i < n; i += 1) {
        const a = prism.footprint[i]!;
        const b = prism.footprint[(i + 1) % n]!;
        acc += a.x * b.z - b.x * a.z;
    }
    return Math.abs(acc / 2);
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE HEAT-GAIN JOIN — this module is `accumulateRoomHeatGain`'s FIRST consumer
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * How much of a face is glazed, at the design stage where nothing is glazed yet.
 *
 * ⭐ THE DEFAULT IS DECLARED, NOT GUESSED, AND IT IS THE HONEST PART OF THIS MODULE.
 * At envelope stage there are no windows — so a "solar impact per face" number is
 * necessarily a study of the face's EXPOSURE, not of a building's real heat gain.
 * Expressing that as `glazedFraction` with an explicit default makes the assumption
 * a value a caller can see, change and cite, rather than a constant buried in a
 * formula. `standing: 'design-intent'` on the record says the same thing about the
 * geometry; this says it about the analysis.
 */
export interface SpaceEnvelopeGlazingAssumption {
    /** Fraction of each side face treated as glazed. Default 0.4 — a study figure. */
    readonly glazedFraction?: number;
    /** Solar-heat-gain coefficient. Defaults to the engine's own `DEFAULT_SHGC`. */
    readonly shgc?: number;
    /** Treat the roof as glazed too? Default false. */
    readonly includeRoof?: boolean;
}

/** The default glazed fraction, named so no caller re-types a magic number. */
export const SPACE_ENVELOPE_DEFAULT_GLAZED_FRACTION = 0.4;

/**
 * Project an envelope's faces into the `RoomGlazing` shape the heat-gain engine
 * consumes. One "room" per ENVELOPE, one glazing element per FACE — which is exactly
 * the founder's *"solar impact on each of its faces"*.
 */
export function spaceEnvelopeGlazing(
    faces: readonly SpaceEnvelopeFaceSurface[],
    envelopeId: string,
    assumption: SpaceEnvelopeGlazingAssumption = {},
): RoomGlazing {
    const fraction = assumption.glazedFraction ?? SPACE_ENVELOPE_DEFAULT_GLAZED_FRACTION;
    const shgc = assumption.shgc ?? DEFAULT_SHGC;
    const includeRoof = assumption.includeRoof ?? false;
    return {
        roomId: envelopeId,
        glazing: faces
            .filter((f) => f.kind === 'side' || (includeRoof && f.kind === 'top'))
            .map((f) => ({
                surfaceId: f.surfaceId,
                glazedAreaM2: f.areaM2 * fraction,
                shgc,
            })),
    };
}

/**
 * The whole join in one call: given sun-hours already computed for this envelope's
 * face surfaces, report its heat gain.
 *
 * ⚠ `sunHours` MUST have been produced from surfaces built by
 * {@link buildSpaceEnvelopeFaceSurfaces} for THIS envelope, rotated into ENU. The
 * engine matches by `surfaceId` and contributes **0** for a surface it cannot find —
 * so a frame or id mismatch reads as *"this face gets no sun"* rather than as an
 * error. That is [[context-data-honesty-family]]'s *"failure and empty are the SAME
 * VALUE"*, and it is why {@link assertFaceSurfaceCoverage} exists.
 */
export function spaceEnvelopeHeatGain(
    sunHours: SunHoursResult,
    faces: readonly SpaceEnvelopeFaceSurface[],
    envelopeId: string,
    assumption: SpaceEnvelopeGlazingAssumption = {},
): RoomHeatGainResult {
    return getTracer().startActiveSpan('spaceEnvelope.heatGain', (span) => {
        try {
            const glazing = spaceEnvelopeGlazing(faces, envelopeId, assumption);
            span.setAttribute('spaceEnvelope.glazedFaces', glazing.glazing.length);
            return accumulateRoomHeatGain(sunHours, [glazing]);
        } finally {
            span.end();
        }
    });
}

/**
 * ⭐ THE GUARD AGAINST THE SILENT-ZERO. Returns the face surface ids that the
 * sun-hours result does NOT cover.
 *
 * A non-empty result means the heat-gain number is an UNDERSTATEMENT and the caller
 * must say so rather than print it — the same discipline
 * `envelope-solid-overstates-partial-data` (L-616) records in the other direction:
 * an UNKNOWN input rendered as a definite number is an overstatement on real land.
 */
export function assertFaceSurfaceCoverage(
    sunHours: SunHoursResult,
    faces: readonly SpaceEnvelopeFaceSurface[],
): readonly string[] {
    const covered = new Set(sunHours.surfaces.map((s) => s.surfaceId));
    return faces.filter((f) => !covered.has(f.surfaceId)).map((f) => f.surfaceId);
}
