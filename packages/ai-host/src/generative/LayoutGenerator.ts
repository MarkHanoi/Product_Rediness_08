// @migration S90-WIRE — moved from src/generative/LayoutGenerator.ts
// @migration S91-WIRE — updated dynamic import path after src/constraints/ moved to src/engine/subsystems/constraints/
// Stays in src/ai/generative/ (L7.5) because it has a dynamic import to
// src/engine/subsystems/constraints/ConstraintEngine (L7.5). Will migrate to
// packages/ai-host/src/generative/ in Wave 11 when src/constraints/ moves to
// packages/constraint-solver/ and LayoutGenerator's dep is factored.
// Path corrections: dynamic import '../../constraints/' → '../../constraints/'
/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Generative (World Model Layer 4)
 * Phase:             Phase I-2
 * Files Modified:    src/generative/LayoutGenerator.ts
 * Classification:    A
 *
 * Deterministic constraint-satisfaction layout generator.
 * Seeds 0–9 produce up to 10 distinct variants.
 * The AI is NOT used here — geometry generation is purely algorithmic.
 *
 * Algorithm:
 *   1. Grid the bounding box into 1m cells.
 *   2. Place the anchor room (most adjacency requirements) at centre.
 *   3. Iteratively place remaining rooms by adjacency cost minimisation.
 *   4. Validate with ConstraintEngine.validateLayout() (pure, no store side-effects).
 *   5. Score: compliance 40% + circulation efficiency 30% + adjacency 30%.
 */

import type {
    GenerativeDesignBrief,
    GenerativeBriefRoom,
    GeneratedLayout,
    GeneratedRoom,
    AdjacencyResult,
} from './GenerativeTypes.js';
import { constraintEngine } from '@pryzm/constraint-solver/compliance';

// ── Seeded PRNG (mulberry32) — deterministic, no Math.random() ────────────────
function mulberry32(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Compute rectangle dimensions (in cells) from min area, keeping near-square. */
function roomDims(minArea_m2: number, gridSize: number): { w: number; d: number } {
    const cells = Math.ceil(minArea_m2 / (gridSize * gridSize));
    const w = Math.ceil(Math.sqrt(cells));
    const d = Math.ceil(cells / w);
    return { w, d };
}

/** Manhattan distance between closest points of two placed rectangles. */
function rectDistance(
    c1: number, r1: number, w1: number, d1: number,
    c2: number, r2: number, w2: number, d2: number,
): number {
    const xOverlap = Math.max(0, Math.min(c1 + w1, c2 + w2) - Math.max(c1, c2));
    const yOverlap = Math.max(0, Math.min(r1 + d1, r2 + d2) - Math.max(r1, r2));
    if (xOverlap > 0 && yOverlap > 0) return 0; // overlapping → adjacent
    const xDist = xOverlap > 0 ? 0 : Math.max(c1, c2) - Math.min(c1 + w1, c2 + w2);
    const yDist = yOverlap > 0 ? 0 : Math.max(r1, r2) - Math.min(r1 + d1, r2 + d2);
    return xDist + yDist;
}

/** Check if rooms are directly adjacent (share at least one cell border). */
function areAdjacent(
    c1: number, r1: number, w1: number, d1: number,
    c2: number, r2: number, w2: number, d2: number,
): boolean {
    return rectDistance(c1, r1, w1, d1, c2, r2, w2, d2) <= 1;
}

// ── Occupancy colour palette (for UI thumbnails) ─────────────────────────────
const ROOM_COLOURS: Record<string, string> = {
    'bed':        '#AED9E0',
    'bedroom':    '#AED9E0',
    'patient':    '#AED9E0',
    'hdu':        '#AED9E0',
    'staff':      '#FAD7A0',
    'office':     '#FAD7A0',
    'utility':    '#D5DBDB',
    'clean':      '#D5DBDB',
    'dirty':      '#BFC9CA',
    'wc':         '#A9CCE3',
    'toilet':     '#A9CCE3',
    'bathroom':   '#A9CCE3',
    'treatment':  '#A8D8A8',
    'clinic':     '#A8D8A8',
    'corridor':   '#F9E79F',
    'circulation':'#F9E79F',
    'meeting':    '#E8DAEF',
    'reception':  '#FDEBD0',
    'storage':    '#E5E8E8',
    'plant':      '#D5D8DC',
};

function roomColour(roomType: string): string {
    const key = roomType.toLowerCase();
    for (const [k, v] of Object.entries(ROOM_COLOURS)) {
        if (key.includes(k)) return v;
    }
    return '#D6EAF8';
}

// ── Grid Cell occupancy ───────────────────────────────────────────────────────

interface PlacedRect {
    id: string;
    col: number;
    row: number;
    w: number;
    d: number;
}

function overlaps(a: PlacedRect, col: number, row: number, w: number, d: number): boolean {
    return !(col + w <= a.col || col >= a.col + a.w || row + d <= a.row || row >= a.row + a.d);
}

function isValidPlacement(
    placed: PlacedRect[],
    col: number, row: number, w: number, d: number,
    gridW: number, gridH: number,
): boolean {
    if (col < 0 || row < 0 || col + w > gridW || row + d > gridH) return false;
    return !placed.some(p => overlaps(p, col, row, w, d));
}

// ── Core placement loop ───────────────────────────────────────────────────────

interface RoomSpec {
    id: string;
    briefRoom: GenerativeBriefRoom;
    instanceIndex: number;  // which copy of multi-count room this is
    w: number;
    d: number;
}

function scorePosition(
    placed: PlacedRect[],
    idToSpec: Map<string, RoomSpec>,
    spec: RoomSpec,
    col: number, row: number,
): number {
    let cost = 0;
    const adjReqs = spec.briefRoom.adjacencyRequirements;
    if (adjReqs.length === 0) return 0;

    for (const p of placed) {
        const pSpec = idToSpec.get(p.id);
        if (!pSpec) continue;
        const pType = pSpec.briefRoom.roomType.toLowerCase();
        const isRequired = adjReqs.some(req => pType.includes(req.toLowerCase()) || req.toLowerCase().includes(pType));
        if (isRequired) {
            cost -= 1000; // reward for each satisfied adjacency
        }
        const dist = rectDistance(col, row, spec.w, spec.d, p.col, p.row, p.w, p.d);
        cost += dist; // minimise total distance to placed rooms
    }
    return cost;
}

function tryPlaceAll(
    specs: RoomSpec[],
    gridW: number,
    gridH: number,
    anchorIndex: number,
    rng: () => number,
): PlacedRect[] | null {
    const placed: PlacedRect[] = [];
    const idToSpec = new Map<string, RoomSpec>(specs.map(s => [s.id, s]));

    // Place anchor first at centre
    const anchor = specs[anchorIndex]!;
    const anchorCol = Math.floor((gridW - anchor.w) / 2);
    const anchorRow = Math.floor((gridH - anchor.d) / 2);

    if (!isValidPlacement(placed, anchorCol, anchorRow, anchor.w, anchor.d, gridW, gridH)) {
        return null;
    }
    placed.push({ id: anchor.id, col: anchorCol, row: anchorRow, w: anchor.w, d: anchor.d });

    // Place remaining in order
    const remaining = specs.filter((_, i) => i !== anchorIndex);

    for (const spec of remaining) {
        // Generate candidate positions — prioritise cells adjacent to placed rooms
        const candidates: Array<{ col: number; row: number; score: number }> = [];

        for (let c = 0; c <= gridW - spec.w; c++) {
            for (let r = 0; r <= gridH - spec.d; r++) {
                if (!isValidPlacement(placed, c, r, spec.w, spec.d, gridW, gridH)) continue;
                // Skip if not adjacent to any placed room (prefer connected layouts)
                const isAdj = placed.some(p => areAdjacent(c, r, spec.w, spec.d, p.col, p.row, p.w, p.d));
                if (!isAdj && placed.length > 0) continue;
                const score = scorePosition(placed, idToSpec, spec, c, r);
                candidates.push({ col: c, row: r, score });
            }
        }

        if (candidates.length === 0) {
            // Relax adjacency requirement — try anywhere
            for (let c = 0; c <= gridW - spec.w; c++) {
                for (let r = 0; r <= gridH - spec.d; r++) {
                    if (!isValidPlacement(placed, c, r, spec.w, spec.d, gridW, gridH)) continue;
                    const score = scorePosition(placed, idToSpec, spec, c, r);
                    candidates.push({ col: c, row: r, score });
                }
            }
        }

        if (candidates.length === 0) return null; // no space

        // Sort by score (ascending — lower is better), break ties randomly
        candidates.sort((a, b) => a.score - b.score || rng() - 0.5);
        const best = candidates[0]!;
        placed.push({ id: spec.id, col: best.col, row: best.row, w: spec.w, d: spec.d });
    }

    return placed;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreAdjacency(rooms: GeneratedRoom[], brief: GenerativeDesignBrief): {
    results: AdjacencyResult[];
    score: number;
} {
    const results: AdjacencyResult[] = [];
    let satisfied = 0;
    let total = 0;

    for (const room of rooms) {
        const briefRoom = brief.rooms.find(br => br.roomType === room.briefRoomType);
        if (!briefRoom || briefRoom.adjacencyRequirements.length === 0) continue;

        for (const req of briefRoom.adjacencyRequirements) {
            total++;
            const neighbour = rooms.find(r =>
                r.id !== room.id &&
                r.briefRoomType.toLowerCase().includes(req.toLowerCase()) &&
                areAdjacent(room.gridCol, room.gridRow, room.widthCells, room.depthCells,
                    r.gridCol, r.gridRow, r.widthCells, r.depthCells),
            );
            const ok = !!neighbour;
            if (ok) satisfied++;
            results.push({
                roomId: room.id,
                requiredType: req,
                satisfied: ok,
                ...(neighbour ? { neighbourId: neighbour.id } : {}),
            });
        }
    }

    return { results, score: total === 0 ? 100 : Math.round((satisfied / total) * 100) };
}

function scoreCirculation(rooms: GeneratedRoom[], boundingBox: { width_m: number; depth_m: number }): number {
    const totalArea = rooms.reduce((s, r) => s + r.area_m2, 0);
    const bboxArea = boundingBox.width_m * boundingBox.depth_m;
    if (bboxArea === 0) return 0;
    // Ideal efficiency: 65-75% room to bbox ratio (leaving room for corridors)
    const ratio = totalArea / bboxArea;
    const efficiency = 1 - Math.abs(ratio - 0.70) * 2;
    return Math.max(0, Math.min(100, Math.round(efficiency * 100)));
}

// ── Public LayoutGenerator ────────────────────────────────────────────────────

export class LayoutGenerator {
    /**
     * Generate up to 10 layout variants for the given brief.
     * Each variant is deterministic for its seed (0–9).
     * Never reads from the global store — pure function.
     */
    async generate(brief: GenerativeDesignBrief): Promise<GeneratedLayout[]> {
        const { boundingBox, gridSize_m = 1.0, maxVariants = 10 } = brief;
        const gridW = Math.floor(boundingBox.width_m / gridSize_m);
        const gridH = Math.floor(boundingBox.depth_m / gridSize_m);

        // Expand brief rooms by count → one RoomSpec per room instance
        const allSpecs: RoomSpec[] = [];
        for (const br of brief.rooms) {
            const { w, d } = roomDims(br.minArea_m2, gridSize_m);
            for (let i = 0; i < br.count; i++) {
                allSpecs.push({
                    id: `gen-${br.roomType.replace(/\s+/g, '-').toLowerCase()}-${i}`,
                    briefRoom: br,
                    instanceIndex: i,
                    w,
                    d,
                });
            }
        }

        // Sort by adjacency connectivity (most connected = anchor candidate)
        const byConnectivity = [...allSpecs].sort(
            (a, b) => b.briefRoom.adjacencyRequirements.length - a.briefRoom.adjacencyRequirements.length,
        );

        const layouts: GeneratedLayout[] = [];
        const maxSeeds = Math.min(maxVariants, 10);

        for (let seed = 0; seed < maxSeeds; seed++) {
            const rng = mulberry32(seed * 7919 + 31337);

            // Vary anchor selection per seed
            const anchorCandidates = byConnectivity.slice(0, Math.min(3, byConnectivity.length));
            const anchorSpec = anchorCandidates[seed % anchorCandidates.length]!;

            // Shuffle remaining rooms slightly per seed
            const shuffled = [...allSpecs];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
            }
            const shuffledAnchorIdx = shuffled.findIndex(s => s.id === anchorSpec.id);

            const placed = tryPlaceAll(shuffled, gridW, gridH, shuffledAnchorIdx, rng);
            if (!placed) continue;

            // Convert PlacedRect → GeneratedRoom
            const generatedRooms: GeneratedRoom[] = placed.map(p => {
                const spec = shuffled.find(s => s.id === p.id)!;
                const name = spec.briefRoom.count > 1
                    ? `${spec.briefRoom.roomType} ${spec.instanceIndex + 1}`
                    : spec.briefRoom.roomType;
                return {
                    id: p.id,
                    name,
                    roomType: spec.briefRoom.roomType,
                    ...(spec.briefRoom.templateId !== undefined ? { templateId: spec.briefRoom.templateId } : {}),
                    briefRoomType: spec.briefRoom.roomType,
                    gridCol: p.col,
                    gridRow: p.row,
                    widthCells: p.w,
                    depthCells: p.d,
                    x_m: p.col * gridSize_m,
                    z_m: p.row * gridSize_m,
                    width_m: p.w * gridSize_m,
                    depth_m: p.d * gridSize_m,
                    area_m2: p.w * p.d * (gridSize_m * gridSize_m),
                };
            });

            const totalGIA = generatedRooms.reduce((s, r) => s + r.area_m2, 0);

            // Validate with ConstraintEngine (pure — no store side-effects)
            const violations = constraintEngine.validateLayout(generatedRooms);

            const complianceScore = violations.length === 0 ? 100
                : Math.max(0, 100 - violations.length * 15);

            const { results: adjResults, score: adjScore } = scoreAdjacency(generatedRooms, brief);
            const circScore = scoreCirculation(generatedRooms, boundingBox);

            const total = Math.round(complianceScore * 0.4 + circScore * 0.3 + adjScore * 0.3);

            layouts.push({
                variantIndex: seed,
                seed,
                rooms: generatedRooms,
                score: {
                    total,
                    compliance: complianceScore,
                    circulation: circScore,
                    adjacency: adjScore,
                },
                adjacencyResults: adjResults,
                totalGIA_m2: totalGIA,
                complianceViolations: violations,
                boundingBox,
                isCompliant: violations.length === 0,
            });
        }

        // Sort by score descending
        layouts.sort((a, b) => b.score.total - a.score.total);
        return layouts;
    }
}

export const layoutGenerator = new LayoutGenerator();

/** Room colour helper exported for use in plan thumbnails. */
export { roomColour };
