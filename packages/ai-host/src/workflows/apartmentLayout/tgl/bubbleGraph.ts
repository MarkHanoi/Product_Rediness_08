// TGL P2 — bubble diagram (adjacency graph) + area targets.
//
// Turns the program brief into: (a) the rooms to place, each with a target area
// scaled to fill the shell (clamped to §8 minima), and (b) the REQUIRED
// adjacencies — the "bubble diagram" architects draw: entrance→hall→living↔
// kitchen/dining; a corridor linking the private zone (bedrooms+bath); master↔
// ensuite. P3 lays rooms out to honour these; P4 places doors on them; P5 scores
// connectivity (space syntax) against them. Pure: ZERO imports except types.

import type { ApartmentProgram, RoomType } from '../types.js';
import { roomRule } from '../rules/programRules.js';

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

// Area weights, minima + habitability are read from the single-source-of-truth
// rules database (rules/programRules.ts) — never duplicated here.
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Scale the program up to match the shell area. The user explicitly required this:
 * "the number of bedrooms and bathrooms should depend on the net area within the
 * perimeter external walls." We never DOWNSCALE (the user's stated bedroom/bath
 * counts are a floor); we only ADD rooms when the shell is large enough that the
 * default program would produce ridiculous room sizes (e.g. an 800 m² shell with
 * 2 bedrooms gives a 200 m² Living Room — the user's screenshot).
 *
 * Heuristic: target ~80 m² of total area per bedroom (residential rule of thumb
 * for a generous unit incl. its share of common/circulation), capped at 8 bedrooms
 * so a very-large shell becomes a luxury unit with big rooms rather than a bedsit
 * tower. Bathrooms = ⌈bedrooms / 2⌉, capped at 4. Auto-enable masterEnSuite once
 * we have ≥3 bedrooms (the shell can carry it without crowding).
 */
export function scaleProgramToShell(program: ApartmentProgram, shellAreaM2: number): ApartmentProgram {
    // An EXPLICIT studio request (bedrooms === 0 AND bathrooms === 0) stays a
    // studio — auto-scale never invents rooms the caller deliberately omitted.
    if (program.bedrooms === 0 && program.bathrooms === 0) return program;
    const targetBedrooms = Math.min(8, Math.max(program.bedrooms, Math.round(shellAreaM2 / 80)));
    const targetBathrooms = Math.min(4, Math.max(program.bathrooms, Math.ceil(targetBedrooms / 2)));
    return {
        ...program,
        bedrooms: targetBedrooms,
        bathrooms: targetBathrooms,
        masterEnSuite: program.masterEnSuite || targetBedrooms >= 3,
    };
}

/**
 * Build the bubble graph for a program, with target areas scaled to fill
 * `availableAreaM2` (then clamped up to §8 minima). The program is auto-scaled
 * to the shell area (see `scaleProgramToShell`) so large shells produce
 * appropriately many rooms instead of huge single-bedroom suites. Room order is
 * public-first (hall, living, kitchen, dining) → corridor → private (bedrooms,
 * ensuite, baths), which P3 uses to keep public space near the entrance.
 */
export function buildBubbleGraph(rawProgram: ApartmentProgram, availableAreaM2: number): BubbleGraph {
    const program = scaleProgramToShell(rawProgram, availableAreaM2);
    const rooms: ProgramRoom[] = [];
    const push = (type: RoomType, name: string, isPrivate: boolean): string => {
        const id = `r${rooms.length}`;
        rooms.push({ id, type, name, targetAreaM2: 0, isPrivate, needsWindow: roomRule(type).needsWindow });
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
    const totalWeight = rooms.reduce((s, r) => s + roomRule(r.type).areaWeight, 0) || 1;
    const withAreas: ProgramRoom[] = rooms.map(r => {
        const raw = availableAreaM2 * (roomRule(r.type).areaWeight / totalWeight);
        const targetAreaM2 = Math.max(raw, roomRule(r.type).minAreaM2 || 3);
        return { ...r, targetAreaM2 };
    });

    // ── Edges (the bubble diagram).
    const edges: AdjacencyEdge[] = [];
    const link = (a: string | null, b: string | null, via: AdjacencyEdge['via']): void => {
        if (a && b && a !== b) edges.push({ a, b, via });
    };
    // Hall ↔ living is OPEN (no door, no full wall) — but P4 emits a RoomBoundingLine
    // along the shared boundary so the room-detection engine still separates the two
    // spaces (the user's explicit clarification: open is fine, just use a room
    // boundary like between kitchen and living). Without the boundary line they'd
    // collapse into one merged room (the 421 m² "Living Room" defect).
    link(entryId, livingId, 'open');
    // Corridor is a DISTINCT circulation room (door from the hall), not merged into
    // the open public zone — so the layout reads as rooms-off-a-corridor.
    link(entryId, corridorId, 'door');
    // Kitchen reaches via the living (or corridor as a fallback) — never directly
    // off the entrance hall (rules: kitchen.accessFrom excludes hall).
    link(livingId ?? corridorId, kitchenId, program.openPlanKitchenDining ? 'open' : 'door');
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
