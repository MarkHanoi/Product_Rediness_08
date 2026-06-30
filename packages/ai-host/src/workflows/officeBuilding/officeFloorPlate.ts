// Office building — the CIRCULAR FLOOR-PLATE generator (the centrepiece).
//
// A PURE deterministic L2 function (zero THREE, zero DOM, zero I/O, zero RNG) that,
// given a circular footprint (approximated as a 64-gon), lays out ONE office floor
// as a set of CONCENTRIC ZONE RINGS around a CENTRED CORE:
//
//   ┌─────────────────────────────────────────────────────────────────────────┐
//   │  circulation ring  (perimeter-most band, ties the floor together)        │
//   │  ┌───────────────────────────────────────────────────────────────────┐  │
//   │  │ perimeter band: enclosed offices / meeting rooms + collab pods at  │  │
//   │  │ the glass (daylight-adjacent)                                       │  │
//   │  │  ┌─────────────────────────────────────────────────────────────┐   │  │
//   │  │  │ open-plan desk ring(s) (workstations)                        │   │  │
//   │  │  │  ┌───────────────────────────────────────────────────────┐  │   │  │
//   │  │  │  │ inner circulation ring (corridor around the core)     │  │   │  │
//   │  │  │  │   ┌───────────────────────────────────────────────┐   │  │   │  │
//   │  │  │  │   │  CENTRED CORE (lifts + stairs + MEP + WCs)     │   │  │   │  │
//   │  │  │  │   └───────────────────────────────────────────────┘   │  │   │  │
//   │  │  │  └───────────────────────────────────────────────────────┘  │   │  │
//   │  │  └─────────────────────────────────────────────────────────────┘   │  │
//   │  └───────────────────────────────────────────────────────────────────┘  │
//   └─────────────────────────────────────────────────────────────────────────┘
//
// CORE SIZING scales UP with storey count (taller → more lift shafts) via a
// rise-zone parameter — a 40-storey tower carries more lift cores than a 4-storey
// one, so the core is a larger fraction of GFA. We do NOT stamp an identical core.
//
// Emits ZONE polygons + a desk COUNT + analytics (per the same-day demo scope: room
// ZONES + desk count, not full per-desk BIM). The editor executor turns the zones
// into room-bounding lines + rooms. All geometry is metres, plan {x,z}, in the
// footprint-centroid LOCAL frame (executor rotates/translates to world if needed).
//
// Contracts: C50 §1.7 (soft-fail not throw); C53 (generative engine); P8 (≥1 span
// per exported function). Self-contained — does NOT touch the residential workflow.

import { trace } from '@opentelemetry/api';
import type { Pt } from '../apartmentLayout/tgl/rectDecomposition.js';

const _tracer = trace.getTracer('@pryzm/ai-host', '0.1.0');

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const SQM_PER_SQFT = 0.092903;

/** The office floor-plate zone kinds (concentric rings). */
export type OfficeZoneKind =
    | 'core'
    | 'inner-circulation'
    | 'open-plan'
    | 'perimeter-office'
    | 'collab-pod'
    | 'circulation';

/** How the perimeter band is used (culture toggle). */
export type WorkplaceCulture = 'open-plan-first' | 'perimeter-offices-first';

/** Desk arrangement within open-plan rings. */
export type DeskMode = 'bench' | 'individual';

/** One annular (or full-disc, for the core) zone of the floor plate. */
export interface OfficeZone {
    readonly kind: OfficeZoneKind;
    /** Human label for the modal / room name. */
    readonly label: string;
    /** Inner radius (m) of this annulus (0 for the core disc). */
    readonly innerRadiusM: number;
    /** Outer radius (m) of this annulus. */
    readonly outerRadiusM: number;
    /** Net usable area of the zone (m²). */
    readonly areaM2: number;
    /** Closed ring polygon (CCW outer + CW inner hole flattened to an outline the
     *  executor draws as room-bounding lines). For the solid core it is just the
     *  outer disc polygon. Metres, plan {x,z}, LOCAL (centroid) frame. */
    readonly outerPolygon: readonly Pt[];
    /** The inner hole polygon (absent for the solid core disc). */
    readonly innerPolygon?: readonly Pt[];
    /** Desks assigned to this zone (0 for non-desk zones). */
    readonly desks: number;
    /** Brand fill colour for the preview (white + #6600FF palette, no black). */
    readonly color: string;
}

/** Analytics surfaced next to the floor plate (the demo's analytics panel). */
export interface OfficeFloorAnalytics {
    readonly grossFloorAreaM2: number;
    readonly usableAreaM2: number;
    /** usable / gross — the core-efficiency ratio. */
    readonly coreEfficiencyRatio: number;
    readonly deskCount: number;
    /** Usable m² per desk (a density / generosity metric). */
    readonly areaPerDeskM2: number;
    /** % of usable area that is open-plan (vs enclosed offices/pods). */
    readonly openPlanPct: number;
    readonly enclosedPct: number;
    /** % of desks within the daylight-adjacent (outer) rings. */
    readonly daylightAdjacentDeskPct: number;
}

/**
 * §OFFICE-PLATE-AUTOFIT — what the feasibility auto-fit had to adjust to keep the
 * floor buildable on a small plate (mirrors resi's "N units didn't fit" notice). All
 * fields are the AS-BUILT values; `notes` is a human summary for the modal. Empty
 * `notes` ⇒ nothing was adjusted (the requested config fit as-is).
 */
export interface OfficePlateAutoFit {
    /** Radius actually used after the min-radius clamp (m). */
    readonly radiusM: number;
    /** True when the radius was clamped UP to the minimum sensible plate. */
    readonly radiusClamped: boolean;
    /** Core area fraction actually used (may be < the rise target on a small plate). */
    readonly coreFraction: number;
    /** True when the core fraction was shrunk so the inner ring stays a corridor wide. */
    readonly coreShrunk: boolean;
    /** Human-readable adjustment notes (one line each). Empty ⇒ no adjustment. */
    readonly notes: readonly string[];
}

export interface OfficeFloorPlateInput {
    /** Floor-plate radius (m). */
    readonly radiusM: number;
    /** Total storeys in the tower — drives the rise-zone core scaling. */
    readonly stories: number;
    /** This floor's index (0 = ground). Reserved for future per-floor variety. */
    readonly floorIndex?: number;
    /** Desks per 1000 sqft (4–8). Higher = denser open plan. */
    readonly deskDensityPer1000Sqft?: number;
    /** Bench vs individual workstations. */
    readonly deskMode?: DeskMode;
    /** Open-plan-first vs perimeter-offices-first culture. */
    readonly culture?: WorkplaceCulture;
    /** Polygon vertex count approximating the circle. Default 64. */
    readonly segments?: number;
    /** Minimum corridor / circulation ring width (m). Default 1.5. */
    readonly minCorridorWidthM?: number;
}

export interface OfficeFloorPlateOk {
    readonly status: 'ok';
    readonly radiusM: number;
    /** Concentric zones, core → perimeter. */
    readonly zones: readonly OfficeZone[];
    /** The centred-core disc radius (m). */
    readonly coreRadiusM: number;
    readonly analytics: OfficeFloorAnalytics;
    /** §OFFICE-PLATE-AUTOFIT — what (if anything) was adjusted to fit a small plate. */
    readonly autoFit: OfficePlateAutoFit;
    readonly diagnostic: string;
}

export interface OfficeFloorPlateRejected {
    readonly status: 'rejected';
    readonly reason: string;
    readonly diagnostic: string;
}

export type OfficeFloorPlateResult = OfficeFloorPlateOk | OfficeFloorPlateRejected;

const DEFAULT_SEGMENTS = 64;
const DEFAULT_DESK_DENSITY = 6;
const DEFAULT_MIN_CORRIDOR_M = 1.5;
/**
 * §OFFICE-PLATE-AUTOFIT — minimum SENSIBLE plate radius (m). A circular office floor
 * smaller than this can't host a centred core + concentric rings, so instead of
 * REJECTING the whole generation we CLAMP UP to this radius and build the smallest
 * sensible plate (the resi generator degrades, never hard-rejects — the office must
 * match that). 10 m ⇒ ~314 m² plate, enough for a core + a thin ring program.
 */
export const MIN_BUILD_RADIUS_M = 10;
/** Floor of the core area fraction the auto-fit may shrink to (keeps a real core). */
const MIN_CORE_FRACTION = 0.10;

/**
 * §OFFICE-CORE-RISE-ZONE — the core area FRACTION of GFA, scaling UP with storeys.
 * Low-rise (≤ ~8 floors) needs few lift shafts → ~18% core; a high-rise tower
 * (≥ ~30 floors) needs banked low/mid/high-rise lift groups + more risers/MEP →
 * ~25% core. Linear between, clamped to [0.18, 0.25]. Pure + deterministic.
 */
export function coreFractionForRise(stories: number): number {
    const lo = 8, hi = 32;
    const t = Math.max(0, Math.min(1, (stories - lo) / (hi - lo)));
    return round4(0.18 + t * (0.25 - 0.18));
}

/** The rise-zone label for a given storey count (drives lift-bank zoning copy). */
export function riseZoneLabel(stories: number): string {
    if (stories >= 30) return 'high-rise (banked low/mid/high lift groups)';
    if (stories >= 12) return 'mid-rise (split lift bank)';
    return 'low-rise (single lift bank)';
}

/** A regular n-gon ring polygon at radius `r`, CCW, centred at origin. */
function circlePolygon(r: number, segments: number): Pt[] {
    const pts: Pt[] = [];
    for (let i = 0; i < segments; i++) {
        const a = (2 * Math.PI * i) / segments;
        pts.push({ x: round4(r * Math.cos(a)), z: round4(r * Math.sin(a)) });
    }
    return pts;
}

/** Area of an annulus between two radii (m²). */
const annulusArea = (rIn: number, rOut: number): number =>
    Math.PI * (rOut * rOut - rIn * rIn);

/**
 * Generate a CIRCULAR office floor plate as concentric zone rings around a centred
 * core. PURE + DETERMINISTIC. Infeasible inputs → soft-fail (C50 §1.7), never throws.
 *
 * Radial budget (fractions of the plate RADIUS, core-out):
 *   core (rise-scaled by AREA) · inner circulation · open-plan desk ring(s) ·
 *   perimeter offices/collab-pods at the glass · outer circulation ring.
 */
export function generateOfficeFloorPlate(
    input: OfficeFloorPlateInput,
): OfficeFloorPlateResult {
    return _tracer.startActiveSpan(
        'pryzm.ai.workflow.officeBuilding.floorPlate',
        (span) => {
            try {
                const out = _generate(input);
                span.setAttribute('pryzm.office.plate.status', out.status);
                if (out.status === 'ok') {
                    span.setAttribute('pryzm.office.plate.desks', out.analytics.deskCount);
                    span.setAttribute('pryzm.office.plate.coreEfficiency', out.analytics.coreEfficiencyRatio);
                }
                span.end();
                return out;
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        },
    ) as OfficeFloorPlateResult;
}

function reject(reason: string): OfficeFloorPlateRejected {
    return { status: 'rejected', reason, diagnostic: `§DIAG-OFFICE-PLATE status=rejected reason="${reason}"` };
}

function _generate(input: OfficeFloorPlateInput): OfficeFloorPlateResult {
    // §OFFICE-PLATE-AUTOFIT — NEVER hard-reject for a too-small plate. A radius below
    // the minimum sensible plate is CLAMPED UP (the smallest buildable tower), exactly
    // as the resi generator degrades rather than refusing. A non-finite / non-positive
    // radius is the only genuinely unusable input → caller falls back to the default.
    const autoFitNotes: string[] = [];
    const requestedRadiusM = input.radiusM;
    if (!(requestedRadiusM > 0) || !Number.isFinite(requestedRadiusM)) {
        return reject(`plate radius must be a positive number (got ${round4(requestedRadiusM)})`);
    }
    let radiusM = requestedRadiusM;
    let radiusClamped = false;
    if (radiusM < MIN_BUILD_RADIUS_M) {
        radiusClamped = true;
        autoFitNotes.push(
            `Plate radius raised from ${round4(requestedRadiusM)} m to the ${MIN_BUILD_RADIUS_M} m minimum (a smaller circular floor can't host a core + ring program).`,
        );
        radiusM = MIN_BUILD_RADIUS_M;
    }
    const stories = Math.max(1, Math.floor(input.stories || 1));
    const segments = Math.max(12, Math.floor(input.segments ?? DEFAULT_SEGMENTS));
    const deskDensity = Math.max(4, Math.min(8, input.deskDensityPer1000Sqft ?? DEFAULT_DESK_DENSITY));
    const deskMode: DeskMode = input.deskMode ?? 'bench';
    const culture: WorkplaceCulture = input.culture ?? 'open-plan-first';
    const minCorridorM = Math.max(1.2, input.minCorridorWidthM ?? DEFAULT_MIN_CORRIDOR_M);

    const grossFloorAreaM2 = round4(Math.PI * radiusM * radiusM);

    // ── Radial band allocation (core-out). The CORE is sized by AREA fraction
    // (rise-scaled); its radius follows from the area. The rest of the radial budget
    // is split into rings whose AREA fractions hit the demo targets:
    //   open-plan 45–55% · enclosed offices 15–20% · collab pods 10–15% ·
    //   circulation 12–15%. Because area grows with r², equal-area rings get THINNER
    //   outward — we solve each ring's outer radius from a cumulative area target.
    // §OFFICE-PLATE-AUTOFIT — the core fraction is rise-scaled, but on a SMALL plate a
    // big rise-core would swallow the inner circulation ring. Rather than reject, we
    // SHRINK the core fraction (down to MIN_CORE_FRACTION) until the inner ring is at
    // least a half-corridor wide. We solve the largest core radius that leaves a
    // half-corridor inner ring, then derive the core fraction from it (clamped to the
    // rise target as a CEILING and MIN_CORE_FRACTION as a FLOOR). Pure + deterministic.
    const riseCoreFrac = coreFractionForRise(stories);
    // Largest core radius that still leaves a half-corridor inner ring inside the plate.
    const maxCoreRadiusForRing = Math.max(0, radiusM - minCorridorM * 0.5);
    const riseCoreRadius = Math.sqrt((grossFloorAreaM2 * riseCoreFrac) / Math.PI);
    let coreRadiusUsed = Math.min(riseCoreRadius, maxCoreRadiusForRing);
    let coreFrac = round4((Math.PI * coreRadiusUsed * coreRadiusUsed) / grossFloorAreaM2);
    let coreShrunk = false;
    if (coreFrac < riseCoreFrac - 1e-4) {
        coreShrunk = true;
        // Don't let the core vanish — floor it (a real tower always needs lift/MEP risers).
        coreFrac = Math.max(MIN_CORE_FRACTION, coreFrac);
        coreRadiusUsed = Math.sqrt((grossFloorAreaM2 * coreFrac) / Math.PI);
        autoFitNotes.push(
            `Core shrunk to ${Math.round(coreFrac * 100)}% of the floor (target ${Math.round(riseCoreFrac * 100)}%) so the ${stories}-storey core fits this plate with a circulation ring.`,
        );
    }
    const coreAreaM2 = round4(Math.PI * coreRadiusUsed * coreRadiusUsed);
    const coreRadiusM = round4(coreRadiusUsed);

    // Remaining (usable) area fractions OF GROSS, summing to (1 − coreFrac):
    const usableFrac = 1 - coreFrac;
    // Targets within the usable budget (normalised so they sum to usableFrac).
    const innerCircFrac = 0.06;   // thin corridor ring around the core
    const openPlanFrac = 0.50;    // open-plan desks (45–55% target)
    const perimFrac = culture === 'perimeter-offices-first' ? 0.20 : 0.17;  // enclosed offices
    const collabFrac = 0.13;      // collaboration pods at the glass
    const outerCircFrac = 0.14;   // outer circulation ring (12–15%)
    const rawSum = innerCircFrac + openPlanFrac + perimFrac + collabFrac + outerCircFrac;
    const scale = usableFrac / rawSum;

    // Cumulative-area → outer radius solver. Each ring's area = frac*scale*GFA.
    let cumArea = coreAreaM2;
    const radiusAt = (addAreaM2: number): number => {
        cumArea += addAreaM2;
        return round4(Math.sqrt(cumArea / Math.PI));
    };
    const rCore = coreRadiusM;
    // §OFFICE-PLATE-AUTOFIT — the inner circulation ring must be at least a half-corridor
    // wide. The core-shrink above already guarantees room for it; here we additionally
    // CLAMP its outer radius UP to (core + half-corridor) so the corridor is real even
    // when the area-fraction solver would make it razor-thin — then push the remaining
    // ring radii out so they stay strictly ordered and inside the plate. No reject path.
    const innerFloor = Math.min(round4(rCore + minCorridorM * 0.5), round4(radiusM));
    const rInnerCirc = Math.max(radiusAt(innerCircFrac * scale * grossFloorAreaM2), innerFloor);
    const order = (r: number): number => Math.min(round4(radiusM), Math.max(r, rInnerCirc));
    const rOpenPlan = order(Math.max(radiusAt(openPlanFrac * scale * grossFloorAreaM2), rInnerCirc));
    const rPerim = order(Math.max(radiusAt(perimFrac * scale * grossFloorAreaM2), rOpenPlan));
    const rCollab = order(Math.max(radiusAt(collabFrac * scale * grossFloorAreaM2), rPerim));
    const rOuter = radiusM; // outer circulation ring closes on the glass line

    const fullDisc = circlePolygon(radiusM, segments);

    // §OFFICE-DESK-COUNT — desks come from the OPEN-PLAN ring area at the chosen
    // density (desks per 1000 sqft). Bench mode packs ~15% denser than individual.
    const openPlanAreaM2 = round4(annulusArea(rInnerCirc, rOpenPlan));
    const openPlanSqft = openPlanAreaM2 / SQM_PER_SQFT;
    const benchFactor = deskMode === 'bench' ? 1.15 : 1.0;
    let openPlanDesks = Math.round((openPlanSqft / 1000) * deskDensity * benchFactor);

    // §OFFICE-PERIMETER-CULTURE — in 'open-plan-first' culture the perimeter band gets
    // desks-AT-THE-WINDOW (daylight desks); in 'perimeter-offices-first' it is enclosed
    // offices (no open desks, fewer occupants). Collab pods never carry desks.
    const perimAreaM2 = round4(annulusArea(rOpenPlan, rPerim));
    let perimeterDesks = 0;
    let perimeterLabel: string;
    let perimeterKind: OfficeZoneKind;
    if (culture === 'open-plan-first') {
        const perimSqft = perimAreaM2 / SQM_PER_SQFT;
        perimeterDesks = Math.round((perimSqft / 1000) * deskDensity * 0.8 * benchFactor); // window desks, lower density
        perimeterLabel = 'Perimeter desks (at the glass)';
        perimeterKind = 'open-plan';
    } else {
        perimeterDesks = 0;
        perimeterLabel = 'Enclosed offices & meeting rooms';
        perimeterKind = 'perimeter-office';
    }

    const collabAreaM2 = round4(annulusArea(rPerim, rCollab));
    const outerCircAreaM2 = round4(annulusArea(rCollab, rOuter));
    const innerCircAreaM2 = round4(annulusArea(rCore, rInnerCirc));

    const zones: OfficeZone[] = [
        {
            kind: 'core',
            label: `Core — lifts, stairs, MEP, WCs (${riseZoneLabel(stories)})`,
            innerRadiusM: 0,
            outerRadiusM: rCore,
            areaM2: coreAreaM2,
            outerPolygon: circlePolygon(rCore, segments),
            desks: 0,
            color: '#6600FF',
        },
        {
            kind: 'inner-circulation',
            label: 'Inner circulation ring',
            innerRadiusM: rCore,
            outerRadiusM: rInnerCirc,
            areaM2: innerCircAreaM2,
            outerPolygon: circlePolygon(rInnerCirc, segments),
            innerPolygon: circlePolygon(rCore, segments),
            desks: 0,
            color: '#F2ECFF',
        },
        {
            kind: 'open-plan',
            label: `Open-plan workstations (${deskMode}, ${deskDensity}/1000sqft)`,
            innerRadiusM: rInnerCirc,
            outerRadiusM: rOpenPlan,
            areaM2: openPlanAreaM2,
            outerPolygon: circlePolygon(rOpenPlan, segments),
            innerPolygon: circlePolygon(rInnerCirc, segments),
            desks: openPlanDesks,
            color: '#FFFFFF',
        },
        {
            kind: perimeterKind,
            label: perimeterLabel,
            innerRadiusM: rOpenPlan,
            outerRadiusM: rPerim,
            areaM2: perimAreaM2,
            outerPolygon: circlePolygon(rPerim, segments),
            innerPolygon: circlePolygon(rOpenPlan, segments),
            desks: perimeterDesks,
            color: culture === 'open-plan-first' ? '#FFFFFF' : '#EDE4FF',
        },
        {
            kind: 'collab-pod',
            label: 'Collaboration pods (at the glass)',
            innerRadiusM: rPerim,
            outerRadiusM: rCollab,
            areaM2: collabAreaM2,
            outerPolygon: circlePolygon(rCollab, segments),
            innerPolygon: circlePolygon(rPerim, segments),
            desks: 0,
            color: '#E0D2FF',
        },
        {
            kind: 'circulation',
            label: 'Perimeter circulation ring',
            innerRadiusM: rCollab,
            outerRadiusM: rOuter,
            areaM2: outerCircAreaM2,
            outerPolygon: fullDisc,
            innerPolygon: circlePolygon(rCollab, segments),
            desks: 0,
            color: '#F7F4FF',
        },
    ];

    // ── Analytics ────────────────────────────────────────────────────────────────
    const usableAreaM2 = round4(grossFloorAreaM2 - coreAreaM2);
    const deskCount = openPlanDesks + perimeterDesks;
    const openPlanUsable = round4(
        openPlanAreaM2 + (culture === 'open-plan-first' ? perimAreaM2 : 0),
    );
    const enclosedUsable = round4(
        collabAreaM2 + (culture === 'perimeter-offices-first' ? perimAreaM2 : 0),
    );
    const openPlanPct = usableAreaM2 > 0 ? round4((openPlanUsable / usableAreaM2) * 100) : 0;
    const enclosedPct = usableAreaM2 > 0 ? round4((enclosedUsable / usableAreaM2) * 100) : 0;
    // Daylight-adjacent desks = the perimeter band desks (at-the-glass). When the
    // perimeter is enclosed offices, the OUTERMOST open-plan ring (nearest glass) is
    // the daylight band — approximate as the perimeter-window desk share.
    const daylightDesks = culture === 'open-plan-first' ? perimeterDesks : Math.round(openPlanDesks * 0.4);
    const daylightAdjacentDeskPct = deskCount > 0 ? round4((daylightDesks / deskCount) * 100) : 0;
    const coreEfficiencyRatio = grossFloorAreaM2 > 0 ? round4(usableAreaM2 / grossFloorAreaM2) : 0;
    const areaPerDeskM2 = deskCount > 0 ? round4(usableAreaM2 / deskCount) : 0;

    const analytics: OfficeFloorAnalytics = {
        grossFloorAreaM2,
        usableAreaM2,
        coreEfficiencyRatio,
        deskCount,
        areaPerDeskM2,
        openPlanPct,
        enclosedPct,
        daylightAdjacentDeskPct,
    };

    const autoFit: OfficePlateAutoFit = {
        radiusM: round4(radiusM),
        radiusClamped,
        coreFraction: round4(coreFrac),
        coreShrunk,
        notes: autoFitNotes,
    };

    const diagnostic =
        `§DIAG-OFFICE-PLATE r=${round4(radiusM)} stories=${stories} ` +
        `coreFrac=${coreFrac} coreR=${rCore} desks=${deskCount} ` +
        `coreEff=${coreEfficiencyRatio} openPlan%=${openPlanPct} ` +
        `autoFit=${radiusClamped || coreShrunk ? `clamped(${autoFitNotes.length})` : 'none'}`;

    return { status: 'ok', radiusM, zones, coreRadiusM: rCore, analytics, autoFit, diagnostic };
}
