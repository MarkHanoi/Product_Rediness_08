// §DIAG-MERGE-DIVIDER (tracker §57.3) — the room-MERGE defect regression suite.
//
// THE DEFECT: on a multi-storey HOUSE GROUND floor with "Open-plan kitchen + dining"
// ON, room detection shipped a compound room "Living Room / Dining" (and on deeper
// plates "… / Corridor" or "… / Bathroom") — a single detected face enclosing 2–3
// engine rooms. ROOT CAUSE: the ground enrich forced `openPlanKitchenDining: true`,
// which under the legacy "lounge-diner" bubble-graph edge opened LIVING ↔ DINING
// (`via:'open'`) and SUPPRESSED the divider between them; room detection then flooded
// across the missing wall. The fix moves the intentional open-plan merge to the
// LITERAL kitchen ↔ dining pair and keeps LIVING a SEPARATE, fully WALLED room.
//
// These tests pin BOTH levels:
//   1. bubble graph: `openPlanLivingDining:false` → living↔dining is a `door` edge and
//      kitchen↔dining is the `open` edge (and the apartment default stays byte-identical).
//   2. end-to-end `generateHouseLayout`: on the GROUND storey every non-open-plan room
//      (living, bathroom, corridor) is bounded by a real partition wall against the
//      open kitchen/dining cluster — engineRooms == detectedRooms (no compound merge).
//
// NO Math.random — fixtures are static.

import { describe, expect, it } from 'vitest';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { generateHouseLayout } from '../src/workflows/houseLayout/index.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type {
    ApartmentConstraints, ApartmentProgram, RoomType, ScoringWeights,
} from '../src/workflows/apartmentLayout/types.js';

const PROGRAM: ApartmentProgram = {
    bedrooms: 3, bathrooms: 2, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const CONSTRAINTS: ApartmentConstraints = {
    minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '',
};
const WEIGHTS: ScoringWeights = {
    naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1,
};

/** A ~200 m² (16 × 12.5 m) detached ground plate — the founder's reproduction size. */
const SHELL: ShellAnalysis = {
    netAreaM2: 200, widthM: 16, depthM: 12.5,
    perimeter: [{ x: 0, z: 0 }, { x: 16, z: 0 }, { x: 16, z: 12.5 }, { x: 0, z: 12.5 }],
    faces: [],
};

const mm = (v: number) => v / 1000;

/** Axis-aligned bbox (m) of a room's footprint polygon (mm). */
function bboxOf(poly: ReadonlyArray<{ x: number; y: number }> | undefined): { x0: number; z0: number; x1: number; z1: number } | null {
    if (!poly || poly.length === 0) return null;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.y); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.y); }
    return { x0: mm(x0), z0: mm(z0), x1: mm(x1), z1: mm(z1) };
}

/** The shared (touching) edge between two axis-aligned room bboxes, or null. */
function sharedEdge(
    a: { x0: number; z0: number; x1: number; z1: number },
    b: { x0: number; z0: number; x1: number; z1: number },
): { axis: 'x' | 'z'; at: number; lo: number; hi: number; len: number } | null {
    const EPS = 0.15;
    for (const [ax, bx] of [[a.x1, b.x0], [b.x1, a.x0]] as const) {
        if (Math.abs(ax - bx) < EPS) {
            const lo = Math.max(a.z0, b.z0), hi = Math.min(a.z1, b.z1);
            if (hi - lo > 0.3) return { axis: 'x', at: (ax + bx) / 2, lo, hi, len: hi - lo };
        }
    }
    for (const [az, bz] of [[a.z1, b.z0], [b.z1, a.z0]] as const) {
        if (Math.abs(az - bz) < EPS) {
            const lo = Math.max(a.x0, b.x0), hi = Math.min(a.x1, b.x1);
            if (hi - lo > 0.3) return { axis: 'z', at: (az + bz) / 2, lo, hi, len: hi - lo };
        }
    }
    return null;
}

/** Does a partition wall cover ≥60% of the shared edge? */
function dividerCovers(
    walls: ReadonlyArray<{ start: { x: number; y: number }; end: { x: number; y: number }; isExternal?: boolean }>,
    edge: { axis: 'x' | 'z'; at: number; lo: number; hi: number; len: number },
): boolean {
    const EPS = 0.3;
    for (const w of walls) {
        if (w.isExternal) continue;
        const sx = mm(w.start.x), sz = mm(w.start.y), ex = mm(w.end.x), ez = mm(w.end.y);
        if (edge.axis === 'x') {
            if (Math.abs(sx - ex) < 0.2 && Math.abs((sx + ex) / 2 - edge.at) < EPS) {
                const lo = Math.min(sz, ez), hi = Math.max(sz, ez);
                if ((Math.min(hi, edge.hi) - Math.max(lo, edge.lo)) / edge.len > 0.6) return true;
            }
        } else {
            if (Math.abs(sz - ez) < 0.2 && Math.abs((sz + ez) / 2 - edge.at) < EPS) {
                const lo = Math.min(sx, ex), hi = Math.max(sx, ex);
                if ((Math.min(hi, edge.hi) - Math.max(lo, edge.lo)) / edge.len > 0.6) return true;
            }
        }
    }
    return false;
}

describe('§DIAG-MERGE-DIVIDER — bubble-graph open-plan edge resolution', () => {
    it('apartment default (openPlanLivingDining absent) keeps the legacy lounge-diner: living↔dining OPEN', () => {
        const g = buildBubbleGraph(PROGRAM, 120);
        const living = g.rooms.find(r => r.type === 'living')!;
        const dining = g.rooms.find(r => r.type === 'dining')!;
        const kitchen = g.rooms.find(r => r.type === 'kitchen')!;
        const ld = g.edges.find(e => (e.a === living.id && e.b === dining.id) || (e.a === dining.id && e.b === living.id))!;
        const kd = g.edges.find(e => (e.a === kitchen.id && e.b === dining.id) || (e.a === dining.id && e.b === kitchen.id))!;
        // Byte-identical to the pre-fix behaviour: living↔dining open, kitchen↔dining door.
        expect(ld.via).toBe('open');
        expect(kd.via).toBe('door');
    });

    it('openPlanLivingDining:false moves the open merge to KITCHEN↔DINING and WALLS living↔dining', () => {
        const g = buildBubbleGraph({ ...PROGRAM, openPlanLivingDining: false }, 120);
        const living = g.rooms.find(r => r.type === 'living')!;
        const dining = g.rooms.find(r => r.type === 'dining')!;
        const kitchen = g.rooms.find(r => r.type === 'kitchen')!;
        const ld = g.edges.find(e => (e.a === living.id && e.b === dining.id) || (e.a === dining.id && e.b === living.id))!;
        const kd = g.edges.find(e => (e.a === kitchen.id && e.b === dining.id) || (e.a === dining.id && e.b === kitchen.id))!;
        // Living is a separate walled room; kitchen + dining are the open kitchen-diner.
        expect(ld.via).toBe('door');
        expect(kd.via).toBe('open');
    });
});

describe('§DIAG-MERGE-DIVIDER — house GROUND floor: no compound Living/Dining merge', () => {
    const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
    const ground = res.perStoreyLayout[0]!;

    // The open-plan cluster the program intentionally merges (kitchen-diner).
    const OPEN_PLAN: ReadonlySet<RoomType> = new Set<RoomType>(['kitchen', 'dining']);

    it('emits a real divider between every NON-open-plan adjacent room pair (Living/Bathroom/Corridor stay distinct)', () => {
        const rooms = ground.rooms
            .map(r => ({ name: r.name, type: r.type, bb: bboxOf(r.polygon) }))
            .filter((r): r is { name: string; type: RoomType; bb: NonNullable<ReturnType<typeof bboxOf>> } => r.bb !== null);

        const merges: string[] = [];
        for (let i = 0; i < rooms.length; i++) {
            for (let j = i + 1; j < rooms.length; j++) {
                const a = rooms[i]!, b = rooms[j]!;
                const edge = sharedEdge(a.bb, b.bb);
                if (!edge) continue;
                // The ONLY legitimately wall-less pair is the intentional kitchen+dining merge.
                const intentionalOpenPlan = OPEN_PLAN.has(a.type) && OPEN_PLAN.has(b.type);
                if (intentionalOpenPlan) continue;
                if (!dividerCovers(ground.walls, edge)) {
                    merges.push(`${a.name}[${a.type}]↔${b.name}[${b.type}] (edge ${edge.axis}@${edge.at.toFixed(2)} len ${edge.len.toFixed(2)}m)`);
                }
            }
        }
        // No should-separate pair may share an open (wall-less) boundary → no compound
        // "A / B" detected room. In particular Living must never merge with Dining.
        expect(merges).toEqual([]);
    });

    it('the Living room is NOT in an open zone with the kitchen/dining cluster', () => {
        // Living must have a real divider on every face it shares with dining or kitchen.
        const byType = (t: RoomType) => ground.rooms.find(r => r.type === t);
        const living = byType('living'); const dining = byType('dining'); const kitchen = byType('kitchen');
        expect(living).toBeDefined();
        const lbb = bboxOf(living!.polygon)!;
        for (const other of [dining, kitchen]) {
            if (!other) continue;
            const obb = bboxOf(other.polygon);
            if (!obb) continue;
            const edge = sharedEdge(lbb, obb);
            if (!edge) continue;                       // not adjacent on this plate — fine
            expect(dividerCovers(ground.walls, edge)).toBe(true);
        }
    });
});
