// A.21.h — `validateHouseStorey` pure envelope validator (SPEC-CASA §13.3).
//
// The HOUSE-AWARE sibling of the apartment §D3.5 envelope
// (`apartmentLayout/dimensions/validateApartmentEnvelope.ts`). It exists because
// the apartment envelope keys its gross-area band on BEDROOM COUNT ALONE — a sound
// assumption for an apartment (one plate ≈ bedrooms × ~30 m²), but WRONG for a
// house storey. A house GROUND floor is large yet carries FEW bedrooms: its area
// is consumed by living + kitchen + dining + entrance hall + WC, not bedrooms. The
// apartment band then HARD-rejects it (e.g. "3-bed 211 m² > hard max 160" or a
// "120 m² with 1 guest bedroom" reject), forcing `houseOrchestrator` to FAKE the
// area it hands the engine (Deviation B — the clamp this validator retires).
//
// THE RULE (judge the storey by its FULL PROGRAMME, not bedroom count):
//   programAreaM2 = Σ comfortable-target area of every room the storey programmes
//                   (living, kitchen, dining, hall, bedrooms, master, bathrooms,
//                   ensuite — honouring any per-type / per-name area override),
//   grossTargetM2 = programAreaM2 × CIRCULATION_FACTOR (walls + circulation gross-up),
//   grossMinM2    = grossTargetM2 × MIN_BAND   (generous floor — a tight house),
//   grossMaxM2    = grossTargetM2 × MAX_BAND   (generous ceiling — a spacious house).
// HARD-REJECT below grossMin or above grossMax. The band is deliberately WIDE
// (CONSERVATIVE / additive): every house that generates today must still generate.
//
// PURE + DETERMINISTIC L2. No I/O, no THREE, no DOM, no Math.random. Mirrors the
// apartment envelope's `DimensionalValidation` return shape so it is a clean,
// drop-in sibling. No OTel span: pure helper, like the apartment validators —
// spans live at the AiPlane boundary (P8 §C09 §2.4).

import type { ApartmentProgram, RoomType } from '../apartmentLayout/types.js';
import { dimensionsFor } from '../apartmentLayout/dimensions/roomDimensions.js';
import type { DimensionalValidation, ValidationFinding } from '../apartmentLayout/dimensions/types.js';

/** Gross-up factor: programme (net room) area → gross plate area (walls +
 *  circulation overhead). 1.15 ≈ a 15 % gross-up, the conventional residential
 *  net-to-gross efficiency margin. */
export const HOUSE_CIRCULATION_FACTOR = 1.15;

/** Lower band: the smallest gross plate that can still host this programme. 0.55×
 *  the target — a deliberately generous floor so a tight house is NOT rejected. */
export const HOUSE_GROSS_MIN_BAND = 0.55;

/** Upper band: the largest gross plate that still makes sense for this programme.
 *  2.4× the target — wide enough that a generously-proportioned house ground floor
 *  (big living / dining) is accepted at its TRUE size, yet still rejects the
 *  architecturally-absurd (a 600 m² 1-bedroom plate). */
export const HOUSE_GROSS_MAX_BAND = 2.4;

export interface HouseStoreyEnvelopeInput {
    /** The storey's single-plate programme (the same shape the D-TGL engine consumes). */
    readonly program: ApartmentProgram;
    /** Gross internal area of THIS storey's plate in m² (the TRUE area, un-clamped). */
    readonly grossAreaM2: number;
}

/** The derived area band for a storey programme — exported so the orchestrator
 *  (and tests) can introspect it without re-running the validator. */
export interface HouseStoreyBand {
    readonly programAreaM2: number;
    readonly grossTargetM2: number;
    readonly grossMinM2: number;
    readonly grossMaxM2: number;
}

/** The room types a storey programmes — MIRRORS `tgl/bubbleGraph.buildBubbleGraph`
 *  exactly (hall? · living? · kitchen always · dining? · corridor when beds+baths>0
 *  · beds with master/ensuite split · baths) so the summed area reflects what the
 *  engine actually builds. Deterministic. */
function storeyRoomTypes(p: ApartmentProgram): RoomType[] {
    const types: RoomType[] = [];
    if (p.entranceHall) types.push('hall');
    if (p.livingRoom) types.push('living');
    types.push('kitchen');
    if (p.openPlanKitchenDining) types.push('dining');
    // §HOUSE-GROUND-PUBLIC-SET (A.21.D28 #4, 2026-06-11) — mirror buildBubbleGraph's
    // optional study/utility mint (after public, before corridor) so the summed
    // programme area — and hence grossTarget / grossMax / §HOUSE-MAX-CAP — grows when
    // the ground floor adds these rooms. Absent ⇒ unchanged (apartment byte-identical).
    if (p.includeStudy === true) types.push('study');
    if (p.includeUtility === true) types.push('utility');

    const beds = Math.max(0, Math.floor(p.bedrooms));
    const baths = Math.max(0, Math.floor(p.bathrooms));
    if (beds + baths > 0) types.push('corridor');

    for (let i = 0; i < beds; i++) {
        types.push(i === 0 && p.masterEnSuite ? 'master' : 'bedroom');
    }
    if (p.masterEnSuite && beds > 0) types.push('ensuite');

    for (let i = 0; i < baths; i++) types.push('bathroom');

    return types;
}

/** The comfortable-target area (m²) for one room of `type`, honouring an absolute
 *  per-type area override when supplied. The midpoint of the comfortable band is
 *  the architectural "should be about this big" anchor. */
function targetAreaForType(type: RoomType, program: ApartmentProgram): number {
    const override = program.roomAreas?.[type];
    if (typeof override === 'number' && override > 0) return override;
    const d = dimensionsFor(type);
    return (d.areaComfortableMin + d.areaComfortableMax) / 2;
}

/** Derive the storey's area band from its full programme (the rule, exported for
 *  introspection / the orchestrator's feasibility gate). */
export function houseStoreyBand(input: HouseStoreyEnvelopeInput): HouseStoreyBand {
    const types = storeyRoomTypes(input.program);
    const programAreaM2 = types.reduce((s, t) => s + targetAreaForType(t, input.program), 0);
    const grossTargetM2 = programAreaM2 * HOUSE_CIRCULATION_FACTOR;
    return {
        programAreaM2,
        grossTargetM2,
        grossMinM2: grossTargetM2 * HOUSE_GROSS_MIN_BAND,
        grossMaxM2: grossTargetM2 * HOUSE_GROSS_MAX_BAND,
    };
}

/**
 * Validate a house STOREY plate against its FULL-PROGRAMME area band.
 *
 * HARD-REJECT below `grossMin` or above `grossMax` (derived from the summed room
 * programme, NOT bedroom count). SOFT penalties outside the target ± 25 % band.
 * Returns the apartment validators' `DimensionalValidation` shape so callers treat
 * it identically to `validateApartmentEnvelope`.
 */
export function validateHouseStorey(input: HouseStoreyEnvelopeInput): DimensionalValidation {
    const beds = Math.max(0, Math.floor(input.program.bedrooms));
    const storeyId = `house-storey-${beds}bed`;

    if (!(input.grossAreaM2 > 0)) {
        return {
            admissible: false,
            hardFindings: [{
                roomId: storeyId, severity: 'hard', metric: 'grossDegenerate',
                reason: `house storey has non-positive gross area`,
                delta: 1.0,
            }],
            softFindings: [],
        };
    }

    const band = houseStoreyBand(input);
    const hard: ValidationFinding[] = [];
    const soft: ValidationFinding[] = [];

    if (input.grossAreaM2 < band.grossMinM2 - 1e-6) {
        hard.push({
            roomId: storeyId, severity: 'hard', metric: 'grossMin', delta: 1.0,
            reason: `house storey gross ${input.grossAreaM2.toFixed(1)} m² < hard min ${band.grossMinM2.toFixed(1)} m² for its programme (~${band.programAreaM2.toFixed(0)} m² of rooms — too small to host them)`,
        });
    }
    if (input.grossAreaM2 > band.grossMaxM2 + 1e-6) {
        hard.push({
            roomId: storeyId, severity: 'hard', metric: 'grossMax', delta: 1.0,
            reason: `house storey gross ${input.grossAreaM2.toFixed(1)} m² > hard max ${band.grossMaxM2.toFixed(1)} m² for its programme (~${band.programAreaM2.toFixed(0)} m² of rooms — add more rooms or reduce the plate)`,
        });
    }

    if (hard.length === 0) {
        const targetLow = band.grossTargetM2 * 0.75;
        const targetHigh = band.grossTargetM2 * 1.25;
        if (input.grossAreaM2 < targetLow) {
            const range = Math.max(1e-6, targetLow - band.grossMinM2);
            const delta = Math.min(1, (targetLow - input.grossAreaM2) / range);
            soft.push({
                roomId: storeyId, severity: 'soft', metric: 'grossTarget', delta,
                reason: `house storey gross ${input.grossAreaM2.toFixed(1)} m² is tight (target ~${band.grossTargetM2.toFixed(0)} m²)`,
            });
        } else if (input.grossAreaM2 > targetHigh) {
            const range = Math.max(1e-6, band.grossMaxM2 - targetHigh);
            const delta = Math.min(1, (input.grossAreaM2 - targetHigh) / range);
            soft.push({
                roomId: storeyId, severity: 'soft', metric: 'grossTarget', delta,
                reason: `house storey gross ${input.grossAreaM2.toFixed(1)} m² is generous (target ~${band.grossTargetM2.toFixed(0)} m²)`,
            });
        }
    }

    return {
        admissible: hard.length === 0,
        hardFindings: hard,
        softFindings: soft,
    };
}

export { storeyRoomTypes as __storeyRoomTypesForTest };
