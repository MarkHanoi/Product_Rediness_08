// DOC-AUTO DS6 — documentation-set ORCHESTRATION plan (2026-06-09).
//
// The deterministic keystone: given a building (levels + detected rooms + footprint), produce
// the ORDERED, NUMBERED set of documentation sheets + the views to place on each — consuming
// the DS3 (building elevations) + DS4 (per-room crop + interior elevations) primitives. This is
// the PURE "what documents to make" plan; the editor executor then turns each DocViewSpec into a
// real ViewDefinition + places it on a Sheet (via DS1 buildSheetFromViews) + exports PDF (DS2).
//
// Numbering scheme (single 'A' architectural discipline for now):
//   A-1xx  level PLANS          (one sheet per level)
//   A-2xx  building ELEVATIONS  (one sheet, the 4 N/S/E/W exterior elevations)
//   A-3xx  SET-OUT plans        (one sheet per level — DS5 set-out dimensions)
//   A-4xx  ROOM documentation   (one sheet per room: cropped plan + interior elevations)
//
// PURE + DETERMINISTIC L2 — no stores, no DOM, no THREE, no RNG. Ordered by level then room id.
// See docs/03-execution/plans/AUTO-DOCUMENTATION-SHEETS-PLAN.md §5 DS6.

import { computeBuildingElevationMarks, type BuildingElevationMark } from './buildingElevations.js';
import { roomCropRegion, computeRoomInteriorElevationMarks, type RoomCropRegion, type RoomElevationMark } from './roomDocumentation.js';

export interface DocLevelInput { readonly levelId: string; readonly name: string }
export interface DocRoomInput {
    readonly id: string;
    readonly name: string;
    readonly levelId: string;
    readonly polygon: ReadonlyArray<{ x: number; z: number }>;
}
export interface DocSetInput {
    readonly levels: ReadonlyArray<DocLevelInput>;
    readonly rooms: ReadonlyArray<DocRoomInput>;
    readonly footprint: ReadonlyArray<{ x: number; z: number }>;
}

export type DocViewKind = 'plan' | 'set-out' | 'building-elevation' | 'room-plan' | 'room-elevation';

/** One view to place on a sheet — the editor turns this into a ViewDefinition. */
export interface DocViewSpec {
    readonly kind: DocViewKind;
    readonly label: string;
    readonly levelId?: string;
    /** Plan crop (room plans). */
    readonly cropRegion?: RoomCropRegion;
    /** Elevation mark (building or room interior elevations). */
    readonly elevationMark?: BuildingElevationMark | RoomElevationMark;
}

export interface DocSheetPlan {
    readonly sheetNumber: string;        // 'A-101', 'A-201', …
    readonly name: string;
    readonly discipline: 'A';
    readonly views: ReadonlyArray<DocViewSpec>;
}

const num = (prefix: string, n: number): string => `A-${prefix}${n.toString().padStart(2, '0')}`;

/**
 * §DS6 — the full documentation-set plan for a building. Deterministic: levels in input order,
 * rooms grouped by level (input order). Empty input → []. Pure.
 */
export function planDocumentationSet(input: DocSetInput): DocSheetPlan[] {
    const sheets: DocSheetPlan[] = [];
    const levels = input.levels ?? [];
    const rooms = input.rooms ?? [];

    // A-1xx — one PLAN sheet per level.
    levels.forEach((lvl, i) => {
        sheets.push({
            sheetNumber: num('1', i + 1), name: `${lvl.name} — Plan`, discipline: 'A',
            views: [{ kind: 'plan', label: `${lvl.name} Plan`, levelId: lvl.levelId }],
        });
    });

    // A-2xx — ONE building-elevations sheet (the 4 exterior N/S/E/W).
    const elevs = computeBuildingElevationMarks(input.footprint);
    if (elevs.length > 0) {
        sheets.push({
            sheetNumber: num('2', 1), name: 'Building Elevations', discipline: 'A',
            views: elevs.map(m => ({ kind: 'building-elevation' as const, label: m.label, elevationMark: m })),
        });
    }

    // A-3xx — one SET-OUT plan sheet per level (DS5 dimensions live on these).
    levels.forEach((lvl, i) => {
        sheets.push({
            sheetNumber: num('3', i + 1), name: `${lvl.name} — Set-Out Plan`, discipline: 'A',
            views: [{ kind: 'set-out', label: `${lvl.name} Set-Out`, levelId: lvl.levelId }],
        });
    });

    // A-4xx — one ROOM sheet per room (cropped plan + interior elevations), level-ordered.
    let roomSeq = 0;
    for (const lvl of levels) {
        for (const room of rooms.filter(r => r.levelId === lvl.levelId)) {
            const crop = roomCropRegion(room.polygon);
            if (!crop) continue;                              // degenerate room — skip
            roomSeq += 1;
            const views: DocViewSpec[] = [
                { kind: 'room-plan', label: `${room.name} — Plan`, levelId: room.levelId, cropRegion: crop },
                ...computeRoomInteriorElevationMarks(room.polygon).map(m => ({
                    kind: 'room-elevation' as const, label: `${room.name} — ${m.label}`, levelId: room.levelId, elevationMark: m,
                })),
            ];
            sheets.push({ sheetNumber: num('4', roomSeq), name: `${room.name} — Room`, discipline: 'A', views });
        }
    }

    return sheets;
}
