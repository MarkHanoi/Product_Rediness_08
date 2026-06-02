// L1-α-2 — aggregate dimensional validator.
//
// Orchestrates the per-room G1-G6 validator (validateRoomShape) +
// the apartment-level G8 daylight (validateRoomDaylight) +
// G9 hierarchy (validateRoomHierarchy) +
// L5 perceptual corridor-width (validateCorridorWidth) +
// L5 perceptual entry-sightline (validateEntrySightline)
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
import {
    validateEntrySightline,
    type SightlineDoorInput,
} from './validateEntrySightline.js';
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
    /** Adjacency edges for the sightline graph — one per interior door
     *  + one to `__exterior__` for the front door. Optional: omitted
     *  means the sightline gate is skipped (no graph to walk).
     *  Together with `entryRoomId` enables A.39.b. */
    readonly doors?: readonly SightlineDoorInput[];
    /** Id of the room the front door opens onto (BFS root for the
     *  sightline gate). Omitted ⇒ sightline gate skipped. */
    readonly entryRoomId?: string;
    /** When true, the daylight gate is skipped (use pre-window). When
     *  false (default), runs normally — set to true for the early-
     *  pipeline phases where windows haven't been emitted yet. */
    readonly skipDaylight?: boolean;
    /** When true, the sightline gate is explicitly skipped even if
     *  doors + entryRoomId are present. Use for diagnostic runs. */
    readonly skipSightline?: boolean;
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
        entrySightline: DimensionalValidation;
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
    const { rooms, windows, doors, entryRoomId, skipDaylight, skipSightline } = input;

    // G1-G6: per-room shape envelope.
    const shapeResults = rooms.map(validateRoomShape);
    const roomShape: DimensionalValidation = {
        admissible: shapeResults.every((r) => r.admissible),
        hardFindings: shapeResults.flatMap((r) => r.hardFindings),
        softFindings: shapeResults.flatMap((r) => r.softFindings),
    };

    // G9: hierarchy.
    const roomHierarchy = validateRoomHierarchy(rooms);

    // G8: daylight (skipped pre-window). RoomShape uses `id`, the
    // daylight validator expects `roomId`; map across.
    const daylightRooms = rooms.map((r) => {
        const out: { roomId: string; type: typeof r.type; rect: typeof r.rect; name?: string } = {
            roomId: r.id,
            type: r.type,
            rect: r.rect,
        };
        if (r.name !== undefined) out.name = r.name;
        return out;
    });
    const roomDaylight: DimensionalValidation = skipDaylight
        ? { admissible: true, hardFindings: [], softFindings: [] }
        : validateRoomDaylight(daylightRooms, windows ?? []);

    // L5 perceptual: corridor width.
    const corridorWidth = validateCorridorWidth(rooms);

    // L5 perceptual: entry sightline (A.39.b). Skipped when doors +
    // entry id aren't supplied — the validator can't BFS without a graph.
    // RoomShape uses `id`; SightlineRoomInput uses `roomId` — map across.
    const canRunSightline =
        !skipSightline && doors !== undefined && entryRoomId !== undefined;
    const entrySightline: DimensionalValidation = canRunSightline
        ? validateEntrySightline({
              rooms: rooms.map((r) => {
                  const out: { roomId: string; type: typeof r.type; name?: string } = {
                      roomId: r.id,
                      type: r.type,
                  };
                  if (r.name !== undefined) out.name = r.name;
                  return out;
              }),
              doors: doors!,
              entryRoomId: entryRoomId!,
          })
        : { admissible: true, hardFindings: [], softFindings: [] };

    const all = [
        roomShape,
        roomHierarchy,
        roomDaylight,
        corridorWidth,
        entrySightline,
    ];
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
            entrySightline,
        },
    };
}
