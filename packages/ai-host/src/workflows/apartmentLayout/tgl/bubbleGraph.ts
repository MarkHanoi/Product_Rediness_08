// TGL P2 — bubble diagram (adjacency graph) + area targets.
//
// Turns the program brief into: (a) the rooms to place, each with a target area
// scaled to fill the shell (clamped to §8 minima), and (b) the REQUIRED
// adjacencies — the "bubble diagram" architects draw: entrance→hall→living↔
// kitchen/dining; a corridor linking the private zone (bedrooms+bath); master↔
// ensuite. P3 lays rooms out to honour these; P4 places doors on them; P5 scores
// connectivity (space syntax) against them. Pure: ZERO imports except types.

import type { ApartmentProgram, RoomType } from '../types.js';

export interface ProgramRoom {
    readonly id: string;            // unique in this layout, e.g. 'r0'
    readonly type: RoomType;
    readonly name: string;
    readonly targetAreaM2: number;
    readonly isPrivate: boolean;    // off the corridor (bedrooms, baths, ensuite)
    readonly needsWindow: boolean;  // §8 V2 habitable rooms
}

export interface AdjacencyEdge {
    readonly a: string;             // room id
    readonly b: string;             // room id
    readonly via: 'open' | 'door';  // open-plan threshold vs a doorway
}

export interface BubbleGraph {
    readonly rooms: readonly ProgramRoom[];
    readonly edges: readonly AdjacencyEdge[];
    /** Corridor room id (the circulation spine), or null when no private rooms. */
    readonly corridorId: string | null;
    /** Hall/entrance room id (where the front door is), or null. */
    readonly entryId: string | null;
}

/** Relative area weights — bigger rooms get more of the shell. */
const AREA_WEIGHT: Readonly<Record<RoomType, number>> = {
    living: 1.7, master: 1.3, bedroom: 1.0, kitchen: 0.95, dining: 0.9, study: 0.85,
    hall: 0.5, corridor: 0.45, bathroom: 0.45, ensuite: 0.4, utility: 0.4,
};

/** Hard minimum areas (m²) — mirrors validate.ts §8 V1. */
const MIN_AREA: Partial<Record<RoomType, number>> = {
    master: 12, bedroom: 9, living: 18, kitchen: 8, bathroom: 4, ensuite: 4,
};

const NEEDS_WINDOW: ReadonlySet<RoomType> = new Set<RoomType>(['master', 'bedroom', 'living', 'kitchen', 'study']);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Build the bubble graph for a program, with target areas scaled to fill
 * `availableAreaM2` (then clamped up to §8 minima). Room order is public-first
 * (hall, living, kitchen, dining) → corridor → private (bedrooms, ensuite, baths),
 * which P3 uses to keep public space near the entrance.
 */
export function buildBubbleGraph(program: ApartmentProgram, availableAreaM2: number): BubbleGraph {
    const rooms: ProgramRoom[] = [];
    const push = (type: RoomType, name: string, isPrivate: boolean): string => {
        const id = `r${rooms.length}`;
        rooms.push({ id, type, name, targetAreaM2: 0, isPrivate, needsWindow: NEEDS_WINDOW.has(type) });
        return id;
    };

    const entryId = program.entranceHall ? push('hall', 'Entrance Hall', false) : null;
    const livingId = program.livingRoom ? push('living', 'Living Room', false) : null;
    const kitchenId = push('kitchen', 'Kitchen', false);
    const diningId = program.openPlanKitchenDining ? push('dining', 'Dining', false) : null;

    const beds = Math.max(0, Math.floor(program.bedrooms));
    const baths = Math.max(0, Math.floor(program.bathrooms));
    const corridorId = beds + baths > 0 ? push('corridor', 'Corridor', false) : null;

    const bedIds: string[] = [];
    for (let i = 0; i < beds; i++) {
        const isMaster = i === 0 && program.masterEnSuite;
        bedIds.push(push(isMaster ? 'master' : 'bedroom', isMaster ? 'Master Bedroom' : `Bedroom ${i + (program.masterEnSuite ? 0 : 1)}`, true));
    }
    const ensuiteId = program.masterEnSuite && beds > 0 ? push('ensuite', 'En-suite', true) : null;
    for (let i = 0; i < baths; i++) push('bathroom', baths > 1 ? `Bathroom ${i + 1}` : 'Bathroom', true);

    // ── Area targets: weight-scaled to fill the shell, then clamped up to minima.
    const totalWeight = rooms.reduce((s, r) => s + (AREA_WEIGHT[r.type] ?? 0.5), 0) || 1;
    const withAreas: ProgramRoom[] = rooms.map(r => {
        const raw = availableAreaM2 * ((AREA_WEIGHT[r.type] ?? 0.5) / totalWeight);
        const targetAreaM2 = Math.max(raw, MIN_AREA[r.type] ?? 3);
        return { ...r, targetAreaM2 };
    });

    // ── Edges (the bubble diagram).
    const edges: AdjacencyEdge[] = [];
    const link = (a: string | null, b: string | null, via: AdjacencyEdge['via']): void => {
        if (a && b && a !== b) edges.push({ a, b, via });
    };
    link(entryId, livingId, 'open');
    link(entryId, corridorId, 'open');
    link(livingId ?? entryId, kitchenId, program.openPlanKitchenDining ? 'open' : 'door');
    link(kitchenId, diningId, 'open');
    link(livingId, diningId, 'open');
    // Private zone hangs off the corridor (or the hall when there's no corridor).
    const spine = corridorId ?? entryId ?? livingId;
    for (const bid of bedIds) link(spine, bid, 'door');
    link(bedIds[0] ?? null, ensuiteId, 'door');     // master ↔ ensuite
    for (const r of withAreas) if (r.type === 'bathroom') link(spine, r.id, 'door');

    return { rooms: withAreas, edges, corridorId, entryId };
}

export { cap as capitalize };
