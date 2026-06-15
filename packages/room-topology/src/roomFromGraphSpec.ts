// ADR-0069 (GR4) — build a RoomData DIRECTLY from a generative-engine room spec.
//
// This is the graph-authoritative counterpart to `RoomDetectionEngine` room
// construction: instead of TRACING a room from the built wall graph (which can
// merge/fragment when a generated partition is trimmed loose), the editor creates
// the Room element straight from the engine's `option.rooms` polygon — so the
// SHIPPED rooms are exactly the engine's designed rooms. The factory mirrors the
// detector's RoomData shape EXACTLY (so both flow through the same RoomStore.add
// Zod gate identically) and is the single, tested place where a graph room becomes
// a RoomData. Pure aside from the injected id/clock (defaulted for production).

import {
    computeRoomMetrics,
    ensureCCW,
    isSimple,
    repairToSimplePolygon,
    computeSignedArea,
} from './RoomPolygonUtils';
import { RoomOccupancyTypeSchema, RoomDataAddSchema } from './RoomDataSchema';
import type { RoomData, RoomBoundary, RoomVertex, RoomOccupancyType } from './RoomTypes';

/** The engine room spec the editor receives (from `buildLayoutCommands` roomCommands,
 *  ADR-0069 GR4). Polygon is in WORLD metres ({x,z}), already in the same frame as the
 *  dispatched walls. */
export interface GraphRoomSpec {
    readonly levelId: string;
    readonly polygon: ReadonlyArray<{ readonly x: number; readonly z: number }>;
    /** RoomType (engine vocabulary) — kept for reference / diagnostics. */
    readonly type?: string;
    readonly name: string;
    /** RoomOccupancyType string from the engine; validated + defaulted to 'unclassified'. */
    readonly occupancyType?: string;
    readonly areaM2?: number;
}

export interface RoomFromSpecOpts {
    /** Storey height (m) for the room volume. Falls back to 2.7 m when ≤ 0. */
    readonly levelHeightM: number;
    /** The room's display number (e.g. "01"). Caller assigns uniquely per level. */
    readonly roomNumber: string;
    /** Injectable UUID generator (default `crypto.randomUUID`) — RoomData.id MUST be a UUID. */
    readonly idGen?: () => string;
    /** Injectable clock (default `Date.now`) for the metadata timestamps. */
    readonly now?: number;
}

/** Min room area (m²) the RoomBoundary Zod gate accepts. */
const MIN_AREA_M2 = 0.01;

const OCCUPANCY_SET = new Set<string>(RoomOccupancyTypeSchema.options);

/**
 * Build a schema-valid `RoomData` from an engine room spec, or `null` when the
 * polygon cannot be made a simple ≥0.01 m² ring (the room then falls back to
 * detection). The returned RoomData passes `RoomDataAddSchema` by construction:
 * UUID id, simple CCW polygon, valid `occupancyType` + `detectionMethod:'ai-generated'`.
 */
export function roomDataFromGraphSpec(spec: GraphRoomSpec, opts: RoomFromSpecOpts): RoomData | null {
    const idGen = opts.idGen ?? (() => globalThis.crypto.randomUUID());
    const now = opts.now ?? Date.now();

    // Mutable polygon copy (the repair/winding passes mutate in place, like the detector).
    let polygon: RoomVertex[] = spec.polygon.map(p => ({ x: p.x, z: p.z }));
    if (polygon.length < 3) return null;

    // Mirror RoomDetectionEngine §A.21.D58: a self-intersecting ring fails the
    // RoomStore isSimple() gate, so repair to the largest simple ring (or drop).
    if (!isSimple(polygon)) {
        const repaired = repairToSimplePolygon(polygon);
        if (!repaired || repaired.length < 3) return null;
        polygon = repaired;
    }
    ensureCCW(polygon);

    if (Math.abs(computeSignedArea(polygon)) < MIN_AREA_M2) return null;

    const boundary: RoomBoundary = {
        polygon,
        height: opts.levelHeightM > 0 ? opts.levelHeightM : 2.7,
        baseOffset: 0,
        detectionMethod: 'ai-generated',
    };

    const occupancyType: RoomOccupancyType =
        spec.occupancyType && OCCUPANCY_SET.has(spec.occupancyType)
            ? (spec.occupancyType as RoomOccupancyType)
            : 'unclassified';

    const room: RoomData = {
        id: idGen(),
        type: 'room',
        levelId: spec.levelId,
        parentId: spec.levelId,
        name: spec.name,
        roomNumber: opts.roomNumber,
        boundary,
        boundingWallIds: [],
        boundingSlabIds: [],
        boundingColumnIds: [],
        occupancyType,
        finishes: {},
        computed: computeRoomMetrics(boundary),
        properties: {},
        metadata: {
            createdAt: now,
            modifiedAt: now,
            createdBy: 'system',
            version: 1,
            detectionVersion: 1,
        },
    };

    // Defensive: the constructed RoomData MUST pass the same Zod gate `RoomStore.add`
    // runs, so an invalid room can NEVER reach the store and throw at runtime in the
    // browser (it returns null → caller skips it → that room falls back to detection).
    // The tests assert this passes for well-formed specs; this guard covers any future
    // engine drift.
    const parsed = RoomDataAddSchema.safeParse(room);
    if (!parsed.success) {
        console.warn(
            `[roomDataFromGraphSpec] "${spec.name}" failed RoomDataAddSchema — skipped ` +
            `(falls back to detection): ${parsed.error.issues.map(i => i.message).join('; ')}`,
        );
        return null;
    }
    return room;
}
