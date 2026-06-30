// Office building — the multi-STOREY orchestrator (the tower stack).
//
// A PURE deterministic L2 function (zero THREE, zero DOM, zero I/O, zero RNG)
// mirroring the residential-building orchestrator's storey loop, BUT for an office
// tower with a CIRCULAR floor plate. It:
//
//  • STAMPS DEPARTMENT / FLOOR-TYPE VARIETY across the stack (not 40 identical
//    floors): ground = café/amenity, ~mid-rise = sky-lobby/amenity hub, top =
//    exec/amenity, a mechanical/refuge floor every ~15–20 storeys, the rest =
//    open-plan office. The floor-selector reads these labels even when the per-floor
//    INTERIOR plate is only generated on demand.
//
//  • Generates ONE representative circular floor plate (the open-plan archetype) via
//    `generateOfficeFloorPlate` so the modal + executor have a concrete floor to show
//    /build, plus per-floor descriptors for the whole stack.
//
//  • Aggregates BUILDING analytics (total desks, average core efficiency, etc.) from
//    the per-floor types.
//
// Returns an `OfficeBuildingResult`; soft-fails (C50 §1.7) never throw. Self-contained
// — does NOT touch the residential workflow. P8: ≥1 span per exported function.

import { trace } from '@opentelemetry/api';
import {
    generateOfficeFloorPlate,
    coreFractionForRise,
    riseZoneLabel,
    MIN_BUILD_RADIUS_M,
    type OfficeFloorPlateOk,
    type OfficePlateAutoFit,
    type WorkplaceCulture,
    type DeskMode,
} from './officeFloorPlate.js';

const _tracer = trace.getTracer('@pryzm/ai-host', '0.1.0');
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Department / floor-type presets stamped across the tower. */
export type OfficeFloorType =
    | 'lobby-amenity'      // ground: café, reception, amenity
    | 'open-plan'          // the workhorse office floor
    | 'sky-lobby'          // mid-rise amenity hub / lift-transfer floor
    | 'mechanical'         // MEP / refuge floor (every ~15–20 storeys)
    | 'executive';         // top: exec suites + amenity

export interface OfficeFloorDescriptor {
    readonly floorIndex: number;
    readonly elevationM: number;
    readonly type: OfficeFloorType;
    /** Human label for the floor-selector ("Café & reception", "Sky lobby", …). */
    readonly label: string;
    /** True when this floor carries an office desk plate (open-plan/executive). */
    readonly hasOfficePlate: boolean;
}

export interface OfficeBuildingOrchestratorInput {
    /** Circular plate radius (m). */
    readonly radiusM: number;
    /** Number of storeys (1..60; demo uses 40). */
    readonly stories: number;
    /** Floor-to-floor height (m). Default 4.0 (commercial office). */
    readonly floorToFloorM?: number;
    /** Base elevation of the ground floor (m). Default 0. */
    readonly baseElevationM?: number;
    /** Desks per 1000 sqft (4–8). */
    readonly deskDensityPer1000Sqft?: number;
    readonly deskMode?: DeskMode;
    readonly culture?: WorkplaceCulture;
    /** Mechanical/refuge floor interval (storeys). Default 18. */
    readonly mechanicalEveryN?: number;
}

export interface OfficeBuildingAnalytics {
    readonly stories: number;
    readonly radiusM: number;
    readonly floorToFloorM: number;
    readonly buildingHeightM: number;
    readonly riseZone: string;
    /** Core area fraction of GFA (rise-scaled). */
    readonly coreFraction: number;
    readonly coreEfficiencyRatio: number;
    /** Per-OFFICE-floor desk count (the representative plate). */
    readonly desksPerOfficeFloor: number;
    /** Number of office (desk-bearing) floors in the stack. */
    readonly officeFloors: number;
    /** Total desks across all office floors. */
    readonly totalDesks: number;
    readonly grossFloorAreaM2: number;
    readonly totalGrossFloorAreaM2: number;
    readonly areaPerDeskM2: number;
    readonly openPlanPct: number;
    readonly enclosedPct: number;
    readonly daylightAdjacentDeskPct: number;
}

export interface OfficeBuildingOk {
    readonly status: 'ok';
    readonly radiusM: number;
    readonly stories: number;
    readonly floorToFloorM: number;
    /** Per-floor descriptors (the floor-type variety the selector reads). */
    readonly floors: readonly OfficeFloorDescriptor[];
    /** The representative open-plan circular plate (shown + built). */
    readonly representativePlate: OfficeFloorPlateOk;
    readonly analytics: OfficeBuildingAnalytics;
    /**
     * §OFFICE-PLATE-AUTOFIT — the requested storey count BEFORE auto-fit (so the modal
     * can say "requested 40, fits 8"). Equals `stories` when nothing was reduced.
     */
    readonly requestedStories: number;
    /** §OFFICE-PLATE-AUTOFIT — adjustments made to keep the tower buildable (notes for the modal). */
    readonly autoFit: OfficePlateAutoFit;
    readonly diagnostic: string;
}

export interface OfficeBuildingRejected {
    readonly status: 'rejected';
    readonly reason: string;
    readonly diagnostic: string;
}

export type OfficeBuildingResult = OfficeBuildingOk | OfficeBuildingRejected;

const DEFAULT_FLOOR_TO_FLOOR_M = 4.0;
const DEFAULT_MECHANICAL_EVERY_N = 18;

const FLOOR_LABEL: Record<OfficeFloorType, string> = {
    'lobby-amenity': 'Café, reception & amenity',
    'open-plan': 'Open-plan office',
    'sky-lobby': 'Sky lobby & amenity hub',
    'mechanical': 'Mechanical / refuge floor',
    'executive': 'Executive suites & amenity',
};

/**
 * §OFFICE-FLOOR-VARIETY — classify a storey into a department/floor-type preset so
 * the stack reads as a real tower, not 40 identical floors. PURE.
 *
 *  • floor 0          → lobby-amenity (café/reception)
 *  • top floor        → executive
 *  • mid-rise centre  → sky-lobby (one amenity hub near the middle)
 *  • every Nth floor  → mechanical/refuge
 *  • everything else  → open-plan office
 */
export function classifyOfficeFloor(
    floorIndex: number,
    stories: number,
    mechanicalEveryN: number,
): OfficeFloorType {
    if (floorIndex === 0) return 'lobby-amenity';
    if (floorIndex === stories - 1) return 'executive';
    // One sky lobby near the vertical middle (skip if it collides with ground/top).
    const skyLobby = Math.round(stories / 2);
    if (floorIndex === skyLobby) return 'sky-lobby';
    // Mechanical / refuge floors at the interval (but never floor 0/top/sky-lobby).
    if (mechanicalEveryN > 0 && floorIndex % mechanicalEveryN === 0) return 'mechanical';
    return 'open-plan';
}

/**
 * §OFFICE-PLATE-AUTOFIT — the MAX storey count whose rise-scaled core comfortably fits
 * a circular plate of `radiusM` WITHOUT shrinking the core below its rise target (i.e.
 * the floor a user could pick and still get the "designed" core, not a degraded one).
 *
 * Taller towers need a bigger core fraction (`coreFractionForRise`), so a small plate
 * tops out at fewer storeys. We scan 1..60 and return the tallest whose rise-core still
 * leaves at least a half-corridor inner ring. ALWAYS returns ≥1 (the plate generator can
 * build a 1-storey floor on any positive radius by shrinking the core if needed). The
 * onboarding setup step uses this to CAP the stories slider so the preview is never
 * infeasible. PURE + deterministic. P8: ≥1 span.
 */
export function maxFeasibleStoriesForRadius(radiusM: number, minCorridorM = 1.5): number {
    return _tracer.startActiveSpan(
        'pryzm.ai.workflow.officeBuilding.maxFeasibleStories',
        (span) => {
            try {
                let best = 1;
                if (radiusM > 0 && Number.isFinite(radiusM)) {
                    const gfa = Math.PI * radiusM * radiusM;
                    const corridor = Math.max(1.2, minCorridorM);
                    for (let s = 1; s <= 60; s++) {
                        const coreR = Math.sqrt((gfa * coreFractionForRise(s)) / Math.PI);
                        // Rise-core fits "as designed" iff it leaves a half-corridor inner ring.
                        if (radiusM - coreR >= corridor * 0.5) best = s; else break;
                    }
                }
                span.setAttribute('pryzm.office.maxFeasibleStories.radiusM', round4(radiusM));
                span.setAttribute('pryzm.office.maxFeasibleStories.value', best);
                span.end();
                return best;
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        },
    ) as number;
}

/** Orchestrate an office tower. PURE + DETERMINISTIC. Soft-fails (C50 §1.7), never throws. */
export function orchestrateOfficeBuilding(
    input: OfficeBuildingOrchestratorInput,
): OfficeBuildingResult {
    return _tracer.startActiveSpan(
        'pryzm.ai.workflow.officeBuilding.orchestrate',
        (span) => {
            try {
                const out = _orchestrate(input);
                span.setAttribute('pryzm.office.orchestrate.status', out.status);
                if (out.status === 'ok') {
                    span.setAttribute('pryzm.office.orchestrate.stories', out.stories);
                    span.setAttribute('pryzm.office.orchestrate.totalDesks', out.analytics.totalDesks);
                }
                span.end();
                return out;
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        },
    ) as OfficeBuildingResult;
}

function reject(reason: string): OfficeBuildingRejected {
    return { status: 'rejected', reason, diagnostic: `§DIAG-OFFICE-ORCHESTRATE status=rejected reason="${reason}"` };
}

function _orchestrate(input: OfficeBuildingOrchestratorInput): OfficeBuildingResult {
    // §OFFICE-PLATE-AUTOFIT — the office must ALWAYS build (degrade gracefully like the
    // resi generator), so we CLAMP rather than reject. The ONLY genuinely unusable input
    // is a non-positive / non-finite radius (no plate to put a tower on); everything else
    // is auto-fitted. The requested storey count is remembered so the modal can report
    // any reduction ("requested 40, fits ~8 at this radius").
    if (!(input.radiusM > 0) || !Number.isFinite(input.radiusM)) {
        return reject('radius must be a positive number');
    }
    const requestedStories = Math.max(1, Math.floor(input.stories || 1));
    const autoFitNotes: string[] = [];

    // §OFFICE-PLATE-AUTOFIT — clamp the radius UP to the minimum sensible plate HERE so
    // the WHOLE building (analytics radius, floor elevations, GFA) is consistent with the
    // plate the generator actually builds (the plate clamps internally too, but the
    // orchestrator must report the AS-BUILT radius, not the requested undersize one).
    const radiusM = Math.max(input.radiusM, MIN_BUILD_RADIUS_M);
    if (radiusM > input.radiusM) {
        autoFitNotes.push(
            `Plate radius raised from ${round4(input.radiusM)} m to the ${MIN_BUILD_RADIUS_M} m minimum so a circular floor with a core + ring program fits.`,
        );
    }

    // Cap the storey count to what the plate can host with an un-shrunk rise-core, then
    // hard-clamp to the engine ceiling (60). A small plate → a shorter tower (it STILL
    // builds at the requested count via core-shrink, but we prefer a clean tower; the
    // plate generator's own auto-fit covers any residual undersize).
    const maxFeasible = maxFeasibleStoriesForRadius(radiusM);
    let stories = Math.min(requestedStories, 60);
    if (requestedStories > 60) {
        autoFitNotes.push(`Capped to the 60-storey engine ceiling (requested ${requestedStories}).`);
    }
    if (stories > maxFeasible) {
        autoFitNotes.push(
            `Plate fits ~${maxFeasible} storeys at this radius (requested ${requestedStories}); built ${maxFeasible}.`,
        );
        stories = maxFeasible;
    }

    const floorToFloorM = input.floorToFloorM && input.floorToFloorM > 0 ? input.floorToFloorM : DEFAULT_FLOOR_TO_FLOOR_M;
    const baseElevationM = input.baseElevationM ?? 0;
    const mechanicalEveryN = input.mechanicalEveryN && input.mechanicalEveryN > 0 ? Math.floor(input.mechanicalEveryN) : DEFAULT_MECHANICAL_EVERY_N;

    // Representative open-plan plate (the archetype shown + built). Its own auto-fit
    // clamps a too-small radius / shrinks the core; it only rejects a non-finite radius
    // (already guarded above), so in practice this always returns 'ok'.
    const plate = generateOfficeFloorPlate({
        radiusM,
        stories,
        floorIndex: 1,
        ...(typeof input.deskDensityPer1000Sqft === 'number' ? { deskDensityPer1000Sqft: input.deskDensityPer1000Sqft } : {}),
        ...(input.deskMode ? { deskMode: input.deskMode } : {}),
        ...(input.culture ? { culture: input.culture } : {}),
    });
    if (plate.status === 'rejected') {
        // Defensive: should not happen given the radius guard, but never throw.
        return reject(`floor plate infeasible: ${plate.reason}`);
    }
    // Merge the plate's CORE-SHRINK note (the radius is already clamped here, so the
    // plate won't re-add a radius note — avoid double-reporting).
    if (plate.autoFit.coreShrunk) {
        for (const n of plate.autoFit.notes) {
            if (!autoFitNotes.includes(n)) autoFitNotes.push(n);
        }
    }

    // ── Storey loop: stamp the floor-type variety. ────────────────────────────────
    const floors: OfficeFloorDescriptor[] = [];
    for (let floorIndex = 0; floorIndex < stories; floorIndex++) {
        const type = classifyOfficeFloor(floorIndex, stories, mechanicalEveryN);
        const elevationM = round4(baseElevationM + floorIndex * floorToFloorM);
        const hasOfficePlate = type === 'open-plan' || type === 'executive';
        floors.push({
            floorIndex,
            elevationM,
            type,
            label: `${floorIndex + 1}/${stories} — ${FLOOR_LABEL[type]}`,
            hasOfficePlate,
        });
    }

    const officeFloors = floors.filter((f) => f.hasOfficePlate).length;
    const desksPerOfficeFloor = plate.analytics.deskCount;
    const totalDesks = officeFloors * desksPerOfficeFloor;
    const buildingHeightM = round4(stories * floorToFloorM);
    const totalGfaM2 = round4(stories * plate.analytics.grossFloorAreaM2);

    const analytics: OfficeBuildingAnalytics = {
        stories,
        radiusM,
        floorToFloorM,
        buildingHeightM,
        riseZone: riseZoneLabel(stories),
        // §OFFICE-PLATE-AUTOFIT — report the AS-BUILT core fraction (the plate may have
        // shrunk it to fit a small plate), not the un-fitted rise target.
        coreFraction: plate.autoFit.coreFraction,
        coreEfficiencyRatio: plate.analytics.coreEfficiencyRatio,
        desksPerOfficeFloor,
        officeFloors,
        totalDesks,
        grossFloorAreaM2: plate.analytics.grossFloorAreaM2,
        totalGrossFloorAreaM2: totalGfaM2,
        areaPerDeskM2: plate.analytics.areaPerDeskM2,
        openPlanPct: plate.analytics.openPlanPct,
        enclosedPct: plate.analytics.enclosedPct,
        daylightAdjacentDeskPct: plate.analytics.daylightAdjacentDeskPct,
    };

    const typeCounts = floors.reduce<Record<string, number>>((acc, f) => {
        acc[f.type] = (acc[f.type] ?? 0) + 1; return acc;
    }, {});
    const autoFit: OfficePlateAutoFit = {
        radiusM: round4(radiusM),
        radiusClamped: radiusM > input.radiusM,
        coreFraction: plate.autoFit.coreFraction,
        coreShrunk: plate.autoFit.coreShrunk,
        notes: autoFitNotes,
    };

    const diagnostic =
        `§DIAG-OFFICE-ORCHESTRATE stories=${stories} (req=${requestedStories}) r=${round4(radiusM)} (req=${round4(input.radiusM)}) ` +
        `riseZone="${analytics.riseZone}" officeFloors=${officeFloors} ` +
        `desks/floor=${desksPerOfficeFloor} totalDesks=${totalDesks} ` +
        `autoFit=${autoFitNotes.length} types=${JSON.stringify(typeCounts)}`;

    return {
        status: 'ok',
        radiusM,
        stories,
        floorToFloorM,
        floors,
        representativePlate: plate,
        analytics,
        requestedStories,
        autoFit,
        diagnostic,
    };
}
