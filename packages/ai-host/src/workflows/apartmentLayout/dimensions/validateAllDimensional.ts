// L1-α-2 — aggregate dimensional validator.
//
// Orchestrates the per-room G1-G4+G6 validator (validateRoomShape) +
// the apartment-level daylight (validateRoomDaylight) +
// G9 hierarchy (validateRoomHierarchy) +
// L5 perceptual corridor-width (validateCorridorWidth) +
// L5 perceptual entry-sightline (validateEntrySightline) +
// G5 furniture-fit (validateRoomFit, opt-in) +
// G8 frontage (validateFrontage, runs when shellPolygon supplied) +
// G10 kitchen work-triangle (validateKitchenTriangle, runs when supplied)
// into ONE DimensionalValidation report the modal + Pareto rank
// consume.
//
// A.37 (cognition hardening) — the last three (G5 / G8 / G10) were authored
// earlier but never wired into the COMBINED report; they are now, each as an
// ADDITIVE opt-in section (vacuous-pass when its flag/input is absent) so every
// existing caller is byte-identical while the report can now express the full
// G1-G10 dimensional verdict.
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
import {
    validateRoomFit,
} from './validateRoomFit.js';
import {
    validateFrontage,
} from './validateFrontage.js';
import {
    validateKitchenTriangle,
    type KitchenTriangleInput,
} from './validateKitchenTriangle.js';
import type { Pt } from '../tgl/rectDecomposition.js';
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
    // ── A.37 (cognition hardening) — the three previously-unwired G-classes ──
    /**
     * G5 — furniture-fit. When true, every room is checked against the
     * lower-bound area its REQUIRED furniture program needs (`validateRoomFit`).
     * Opt-in (default OFF) because the same per-room check already runs inside
     * the D-FLE furnish phase; turning it on here surfaces the G5 verdict in the
     * COMBINED report (the L5 modal / report panel) without changing any current
     * caller. Off ⇒ vacuous-pass (byte-identical to the pre-A.37 report). */
    readonly includeRoomFit?: boolean;
    /**
     * G8 — frontage. The apartment shell polygon (world XZ, metres). When
     * supplied, `validateFrontage` HARD-rejects a frontage-required room
     * (living / kitchen / master / bedroom) that is fully interior. Omitted ⇒
     * gate skipped (no perimeter to test against) ⇒ vacuous-pass. */
    readonly shellPolygon?: readonly Pt[];
    /**
     * G10 — kitchen work-triangle. The sink/stove/fridge positions for each
     * placed kitchen (post-furnish). When supplied + non-empty, each triangle is
     * NKBA-checked (`validateKitchenTriangle`). Omitted/empty ⇒ gate skipped
     * (the appliances haven't been placed yet) ⇒ vacuous-pass. */
    readonly kitchenTriangles?: readonly KitchenTriangleInput[];
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
        /** G5 furniture-fit — vacuous-pass unless `includeRoomFit`. */
        roomFit: DimensionalValidation;
        /** G8 frontage — vacuous-pass unless `shellPolygon` supplied. */
        frontage: DimensionalValidation;
        /** G10 kitchen work-triangle — vacuous-pass unless `kitchenTriangles` supplied. */
        kitchenTriangle: DimensionalValidation;
    }>;
}

/** A sub-validator result that contributes nothing (gate skipped / not opted-in). */
const VACUOUS_PASS: DimensionalValidation = {
    admissible: true,
    hardFindings: [],
    softFindings: [],
};

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
    const {
        rooms, windows, doors, entryRoomId, skipDaylight, skipSightline,
        includeRoomFit, shellPolygon, kitchenTriangles,
    } = input;

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

    // G5: furniture-fit (opt-in). RoomShape's id/type/name/rect are exactly the
    // RoomFitInput shape; the validator derives the required-furniture area from
    // the program rules per room (no external furniture data needed).
    const roomFit: DimensionalValidation = includeRoomFit
        ? (() => {
              const results = rooms.map((r) =>
                  validateRoomFit(
                      r.name !== undefined
                          ? { roomId: r.id, type: r.type, rect: r.rect, name: r.name }
                          : { roomId: r.id, type: r.type, rect: r.rect },
                  ),
              );
              return {
                  admissible: results.every((x) => x.admissible),
                  hardFindings: results.flatMap((x) => x.hardFindings),
                  softFindings: results.flatMap((x) => x.softFindings),
              };
          })()
        : VACUOUS_PASS;

    // G8: frontage (runs when the shell polygon is supplied). A frontage-required
    // room that is fully interior HARD-rejects. RoomShape → FrontageRoomInput maps
    // 1:1 (id/type/name/rect).
    const frontage: DimensionalValidation = shellPolygon
        ? validateFrontage({
              shellPolygon,
              rooms: rooms.map((r) =>
                  r.name !== undefined
                      ? { roomId: r.id, type: r.type, rect: r.rect, name: r.name }
                      : { roomId: r.id, type: r.type, rect: r.rect },
              ),
          })
        : VACUOUS_PASS;

    // G10: kitchen work-triangle (runs when appliance positions are supplied —
    // post-furnish). One verdict per placed kitchen, concatenated.
    const kitchenTriangle: DimensionalValidation =
        kitchenTriangles && kitchenTriangles.length > 0
            ? (() => {
                  const results = kitchenTriangles.map(validateKitchenTriangle);
                  return {
                      admissible: results.every((x) => x.admissible),
                      hardFindings: results.flatMap((x) => x.hardFindings),
                      softFindings: results.flatMap((x) => x.softFindings),
                  };
              })()
            : VACUOUS_PASS;

    const all = [
        roomShape,
        roomHierarchy,
        roomDaylight,
        corridorWidth,
        entrySightline,
        roomFit,
        frontage,
        kitchenTriangle,
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
            roomFit,
            frontage,
            kitchenTriangle,
        },
    };
}
