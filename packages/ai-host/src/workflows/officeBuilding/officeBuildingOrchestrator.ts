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
    type OfficeFloorPlateOk,
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
    const stories = Math.floor(input.stories || 0);
    if (!Number.isInteger(stories) || stories < 1 || stories > 60) {
        return reject('stories must be an integer in 1..60');
    }
    if (!(input.radiusM > 0)) {
        return reject('radius must be positive');
    }
    const floorToFloorM = input.floorToFloorM && input.floorToFloorM > 0 ? input.floorToFloorM : DEFAULT_FLOOR_TO_FLOOR_M;
    const baseElevationM = input.baseElevationM ?? 0;
    const mechanicalEveryN = input.mechanicalEveryN && input.mechanicalEveryN > 0 ? Math.floor(input.mechanicalEveryN) : DEFAULT_MECHANICAL_EVERY_N;

    // Representative open-plan plate (the archetype shown + built).
    const plate = generateOfficeFloorPlate({
        radiusM: input.radiusM,
        stories,
        floorIndex: 1,
        ...(typeof input.deskDensityPer1000Sqft === 'number' ? { deskDensityPer1000Sqft: input.deskDensityPer1000Sqft } : {}),
        ...(input.deskMode ? { deskMode: input.deskMode } : {}),
        ...(input.culture ? { culture: input.culture } : {}),
    });
    if (plate.status === 'rejected') {
        return reject(`floor plate infeasible: ${plate.reason}`);
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
        radiusM: input.radiusM,
        floorToFloorM,
        buildingHeightM,
        riseZone: riseZoneLabel(stories),
        coreFraction: coreFractionForRise(stories),
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
    const diagnostic =
        `§DIAG-OFFICE-ORCHESTRATE stories=${stories} r=${round4(input.radiusM)} ` +
        `riseZone="${analytics.riseZone}" officeFloors=${officeFloors} ` +
        `desks/floor=${desksPerOfficeFloor} totalDesks=${totalDesks} ` +
        `types=${JSON.stringify(typeCounts)}`;

    return {
        status: 'ok',
        radiusM: input.radiusM,
        stories,
        floorToFloorM,
        floors,
        representativePlate: plate,
        analytics,
        diagnostic,
    };
}
