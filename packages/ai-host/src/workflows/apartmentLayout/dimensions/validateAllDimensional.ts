// L1-α-2 — aggregate dimensional validator.
//
// Orchestrates the per-room G1-G6 validator (validateRoomShape) +
// the apartment-level G8 daylight (validateRoomDaylight) +
// G9 hierarchy (validateRoomHierarchy) +
// L5 perceptual corridor-width (validateCorridorWidth)
// into ONE DimensionalValidation report the modal + Pareto rank
// consume.
//
// The combined report's `admissible` is the AND of every sub-
// validator's admissibility; hard + soft findings concatenate. This
// lets D3.1 enumerate.ts gate dropouts with one call + lets the L5
// modal render every per-room badge with one render pass.
//
// L2-pure: no THREE / DOM / RNG.

import {
    validateRoomShape,
    type RoomShape,
} from './validateRoomShape.js';
import {
    validateRoomHierarchy,
} from './validateRoomHierarchy.js';
import {
    validateRoomDaylight,
    type DaylightWindowInput,
} from './validateRoomDaylight.js';
import {
    validateCorridorWidth,
} from './validateCorridorWidth.js';
import type {
    DimensionalValidation,
    ValidationFinding,
} from './types.js';

export interface DimensionalReportInput {
    /** Every placed room (post-subdivide, pre-doors). */
    readonly rooms: readonly RoomShape[];
    /** Every window in the apartment (used by daylight gate). Optional —
     *  when omitted, daylight gate runs as if no windows exist, which is
     *  the correct behaviour for the pre-window phase of the pipeline
     *  (D-TGL produces walls + rooms; windows arrive later in D-FLE). */
    readonly windows?: readonly DaylightWindowInput[];
    /** When true, the daylight gate is skipped (use pre-window). When
     *  false (default), runs normally — set to true for the early-
     *  pipeline phases where windows haven't been emitted yet. */
    readonly skipDaylight?: boolean;
}

/**
 * Result of `validateAllDimensional` — same shape as
 * `DimensionalValidation` but also carries a per-validator breakdown
 * so the L5 modal can render "G1 area · G3 length · G8 daylight · G9
 * hierarchy" sections separately.
 */
export interface DimensionalReport extends DimensionalValidation {
    readonly perValidator: Readonly<{
        roomShape: DimensionalValidation;
        roomHierarchy: DimensionalValidation;
        roomDaylight: DimensionalValidation;
        corridorWidth: DimensionalValidation;
    }>;
}

function concatFindings(
    parts: readonly DimensionalValidation[],
): { hard: ValidationFinding[]; soft: ValidationFinding[] } {
    const hard: ValidationFinding[] = [];
    const soft: ValidationFinding[] = [];
    for (const p of parts) {
        for (const f of p.hardFindings) hard.push(f);
        for (const f of p.softFindings) soft.push(f);
    }
    return { hard, soft };
}

/**
 * Run every dimensional + perceptual validator on the apartment and
 * return one combined report.
 *
 *   - admissible = AND of every sub-validator
 *   - hardFindings + softFindings = concat of every sub-validator
 *   - perValidator = the raw per-sub-validator results (so the L5
 *     modal can render per-section badges)
 */
export function validateAllDimensional(
    input: DimensionalReportInput,
): DimensionalReport {
    const { rooms, windows, skipDaylight } = input;

    // G1-G6: per-room shape envelope.
    const shapeResults = rooms.map(validateRoomShape);
    const roomShape: DimensionalValidation = {
        admissible: shapeResults.every((r) => r.admissible),
        hardFindings: shapeResults.flatMap((r) => r.hardFindings),
        softFindings: shapeResults.flatMap((r) => r.softFindings),
    };

    // G9: hierarchy.
    const roomHierarchy = validateRoomHierarchy(rooms);

    // G8: daylight (skipped pre-window).
    const roomDaylight: DimensionalValidation = skipDaylight
        ? { admissible: true, hardFindings: [], softFindings: [] }
        : validateRoomDaylight(rooms, windows ?? []);

    // L5 perceptual: corridor width.
    const corridorWidth = validateCorridorWidth(rooms);

    const all = [roomShape, roomHierarchy, roomDaylight, corridorWidth];
    const { hard, soft } = concatFindings(all);

    return {
        admissible: all.every((r) => r.admissible),
        hardFindings: hard,
        softFindings: soft,
        perValidator: {
            roomShape,
            roomHierarchy,
            roomDaylight,
            corridorWidth,
        },
    };
}
