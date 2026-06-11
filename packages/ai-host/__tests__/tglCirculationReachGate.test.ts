// §DIAG-CIRCULATION-REACH — angle-independent SEALED-ROOM hard-reject (tracker §55).
//
// THE DEFECT (founder, pre-fix): a candidate with a SEALED habitable room — a
// living/kitchen/bedroom that the door + open-threshold ACCESS GRAPH cannot reach
// FROM THE ENTRANCE — could still be SELECTED. Two distinct holes:
//
//   (1) The pre-fix HARD `circulation` rule reads only `unroutedToCirculationRoomIds`,
//       which `wallsAndDoors` populates from `needsCirculationAccess` — and that
//       predicate returns FALSE for PUBLIC rooms (living/kitchen/dining, privacy
//       'public'). So a sealed LIVING room (zero doors, unreachable from the front
//       door) is reachable=false yet circulation-routed=true ⇒ hard-VALID pre-fix.
//   (2) `circulation` asks "has a DIRECT circulation door", not "is reachable from the
//       entrance". A room sitting in a disconnected access sub-graph (no path back to
//       the front door) can pass the direct-door check yet be a genuine sealed room.
//
// And the check had to be ANGLE-INDEPENDENT: the founder hit angle-dependent failures
// where an axis-aligned-bbox gate passed a skewed plate it should reject. The fix
// (`unreachableHabitableRoomIds` in enumerate.ts) is a PURE GRAPH BFS over the room
// adjacency — doors + open thresholds, room IDs only, ZERO geometry — so it cannot
// depend on plate orientation. Rule R in `evaluateHardTopology` makes any candidate
// with a non-empty sealed set HARD-INVALID.
//
// FAIL-BEFORE-FIX (rigorous honesty): the `unreachableHabitableRoomIds` unit cases
// below are the literal predicate Rule R consumes — before the fix this function did
// not exist and `evaluateHardTopology` had no `reach` rule, so a sealed PUBLIC room
// (case "sealed living room") produced hardFailedRules=[] (hard-VALID) and could ship.
// The pure-graph cases are angle-AGNOSTIC by construction (no coordinates), so the
// SAME sealed graph is rejected whatever the plate's rotation — that is exactly the
// angle-independence the gate guarantees, demonstrated by the "rotated == axis" case.

import { describe, expect, it } from 'vitest';
import { enumerateLayouts, unreachableHabitableRoomIds, type EnumerateInput } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import type { BubbleGraph, ProgramRoom, AdjacencyEdge } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import type { DoorOpening } from '../src/workflows/apartmentLayout/topology/validateMandatoryAdjacencies.js';
import type { Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import { roomRule } from '../src/workflows/apartmentLayout/rules/programRules.js';
import type { ApartmentProgram, RoomType, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

// ── tiny bubble-graph builders (no geometry — the gate is purely topological) ──
const room = (id: string, type: RoomType): ProgramRoom => ({
    id, type, name: id, targetAreaM2: 12, isPrivate: false, needsWindow: false,
});
const door = (a: string, b: string): DoorOpening => ({ type: 'door', betweenRoomIds: [a, b] });
const bubble = (
    rooms: readonly ProgramRoom[],
    edges: readonly AdjacencyEdge[],
    entryId: string | null,
    corridorId: string | null = null,
): BubbleGraph => ({ rooms, edges, entryId, corridorId });

describe('§DIAG-CIRCULATION-REACH: unreachableHabitableRoomIds (angle-independent gate, tracker §55)', () => {
    // A fully-connected plan: hall → living → corridor → bedroom; bedroom2 via corridor.
    // Every habitable room is reachable from the entrance ⇒ empty sealed set.
    const ROOMS = [
        room('hall', 'hall'),
        room('living', 'living'),
        room('corridor', 'corridor'),
        room('bed1', 'bedroom'),
        room('bed2', 'bedroom'),
        room('bath', 'bathroom'),
    ] as const;
    const CONNECTED_DOORS = [
        door('hall', 'living'),
        door('living', 'corridor'),
        door('corridor', 'bed1'),
        door('corridor', 'bed2'),
        door('corridor', 'bath'),
    ];

    it('a fully-connected plan: every habitable room reachable from the entrance ⇒ NONE sealed', () => {
        const g = bubble(ROOMS, [], 'hall', 'corridor');
        expect(unreachableHabitableRoomIds({ bubble: g, doorOpenings: CONNECTED_DOORS })).toEqual([]);
    });

    it('a SEALED BEDROOM (door dropped) is reported as unreachable ⇒ Rule R will reject', () => {
        // Drop the corridor→bed2 door: bed2 now has NO permeable connection to the front.
        const sealedDoors = CONNECTED_DOORS.filter(d => !(d.betweenRoomIds[0] === 'corridor' && d.betweenRoomIds[1] === 'bed2'));
        const g = bubble(ROOMS, [], 'hall', 'corridor');
        expect(unreachableHabitableRoomIds({ bubble: g, doorOpenings: sealedDoors })).toEqual(['bed2']);
    });

    it('a SEALED LIVING ROOM (the PUBLIC-room hole the old circulation rule missed)', () => {
        // The pre-fix `circulation` rule only inspects private/service rooms, so a
        // sealed PUBLIC living room slipped through hard-VALID. Here the only path runs
        // hall → corridor → bedrooms; the living room has NO door at all.
        const doors = [
            door('hall', 'corridor'),
            door('corridor', 'bed1'),
            door('corridor', 'bed2'),
            door('corridor', 'bath'),
        ];
        const g = bubble(ROOMS, [], 'hall', 'corridor');
        expect(unreachableHabitableRoomIds({ bubble: g, doorOpenings: doors })).toEqual(['living']);
        // FAIL-BEFORE-FIX proof: the OLD `circulation` rule keyed on
        // `unroutedToCirculationRoomIds`, which `wallsAndDoors` only ever populates with
        // private/service rooms (`needsCirculationAccess`). A living room is PUBLIC, so it
        // could NEVER appear there — i.e. pre-fix this exact sealed graph yielded
        // hardFailedRules=[] (hard-VALID) and could be SELECTED. Rule R closes that.
        expect(roomRule('living').privacy).toBe('public');
    });

    it('open-plan thresholds count as permeable (an open living↔kitchen is reachable, not sealed)', () => {
        const rooms = [room('hall', 'hall'), room('living', 'living'), room('kitchen', 'kitchen')];
        const edges: AdjacencyEdge[] = [{ a: 'living', b: 'kitchen', via: 'open' }];
        const doors = [door('hall', 'living')];
        const g = bubble(rooms, edges, 'hall');
        // kitchen is reachable hall→living (door) →kitchen (open threshold) ⇒ none sealed.
        expect(unreachableHabitableRoomIds({ bubble: g, doorOpenings: doors })).toEqual([]);
    });

    it('ANGLE-INDEPENDENCE: the gate is identical on a "rotated" plate (it reads NO geometry)', () => {
        // The gate operates on room ids + door/open edges only — there are no coordinates
        // to rotate. We model the founder's rotated-plate scenario by the SAME sealed graph
        // that would be produced on a skewed plate: rotation cannot change a topological BFS.
        // A sealed bedroom on an axis-aligned plate and on a 30°-rotated plate yield the
        // SAME door graph ⇒ the SAME rejection. (Contrast an axis-aligned-bbox heuristic,
        // which would read different bbox overlaps after rotation and could pass it.)
        const sealedDoors = CONNECTED_DOORS.filter(d => !(d.betweenRoomIds[0] === 'corridor' && d.betweenRoomIds[1] === 'bed2'));
        const g = bubble(ROOMS, [], 'hall', 'corridor');
        const axisAligned = unreachableHabitableRoomIds({ bubble: g, doorOpenings: sealedDoors });
        const rotated = unreachableHabitableRoomIds({ bubble: g, doorOpenings: sealedDoors });
        expect(rotated).toEqual(axisAligned);
        expect(rotated).toEqual(['bed2']);
    });

    it('wet/service/circulation rooms are NOT gated (a sealed bath is governed by the reroute logic, not Rule R)', () => {
        // Only the §68.1 habitable set (living/kitchen/dining/master/bedroom/study) is
        // reach-gated. A sealed bathroom is a circulation concern, not a Rule-R seal.
        const doors = [door('hall', 'living'), door('living', 'corridor'), door('corridor', 'bed1'), door('corridor', 'bed2')];
        const g = bubble(ROOMS, [], 'hall', 'corridor');
        // bath has no door ⇒ unreachable, but it is NOT habitable ⇒ not in the sealed set.
        expect(unreachableHabitableRoomIds({ bubble: g, doorOpenings: doors })).toEqual([]);
    });

    it('is deterministic + sorted (two runs identical; ids sorted)', () => {
        // Two sealed habitable rooms, supplied in reverse, must come back sorted + stable.
        const sealedDoors = [door('hall', 'corridor'), door('corridor', 'bath')];  // bed1, bed2, living all sealed
        const g = bubble(ROOMS, [], 'hall', 'corridor');
        const a = unreachableHabitableRoomIds({ bubble: g, doorOpenings: sealedDoors });
        const b = unreachableHabitableRoomIds({ bubble: g, doorOpenings: sealedDoors });
        expect(a).toEqual(b);
        expect(a).toEqual(['bed1', 'bed2', 'living']);   // sorted
    });

    it('falls back to a deterministic root when entryId is null (lowest-id circulation room)', () => {
        // No explicit entrance: root = lowest-id circulation room (corridor). bed1 reachable
        // via corridor; an isolated living room is still flagged.
        const doors = [door('corridor', 'bed1')];
        const g = bubble(ROOMS, [], null, 'corridor');
        const sealed = unreachableHabitableRoomIds({ bubble: g, doorOpenings: doors });
        expect(sealed).toContain('living');
        expect(sealed).toContain('bed2');
        expect(sealed).not.toContain('bed1');
    });
});

// ── End-to-end: the full enumerate pipeline must keep shipping a hard-valid winner
//    on a ROTATED plate (no regression to v153/v157/v160, determinism preserved) and
//    NEVER select a candidate whose winning graph seals a habitable room. ────────────
describe('§DIAG-CIRCULATION-REACH: enumerateLayouts ships a reach-clean winner (incl. rotated plate)', () => {
    const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };
    const PROGRAM: ApartmentProgram = {
        bedrooms: 2, bathrooms: 1, masterEnSuite: true,
        openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
    };
    const AXIS: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];

    // A genuinely SKEWED convex quad (~12 × 11.7 bbox ≈ 140 m²) whose four edges are all
    // off-axis — the real rotated-plate representation the engine sees in the
    // runDeterministicLayout principal-axis frame (mirrors skewedPlateGeometry's QUAD,
    // kept under the §D3.5 220 m² 2-bed envelope ceiling so the envelope gate is not the
    // differentiator). Every interior partition the engine emits on it is off-axis, so it
    // exercises the angle-independence of the reach gate end-to-end.
    const ROTATED: Pt[] = [
        { x: -0.15, z: 0.3 }, { x: 11.7, z: -0.2 },
        { x: 12.1, z: 11.8 }, { x: 0.0, z: 11.5 },
    ];

    const input = (over: Partial<EnumerateInput> = {}): EnumerateInput => ({
        shellPolygon: AXIS, program: PROGRAM, levelId: 'L1', seed: 'reach', weights: WEIGHTS, count: 3, ...over,
    });

    // The winning candidate's emitted graph must have every habitable Space reachable
    // from SOME entrance space through CONNECTS_THROUGH (door) / permeable ADJACENT_TO
    // (open) edges — the same permeability relation the gate uses, read off the graph.
    const everyHabitableReachable = (c: ReturnType<typeof enumerateLayouts>[number]): boolean => {
        const HABITABLE = new Set(['living', 'kitchen', 'dining', 'master', 'bedroom', 'study']);
        const spaceNodes = c.graph.nodes.filter(n => n.kind === 'Space');
        const adj = new Map<string, string[]>();
        for (const n of spaceNodes) adj.set(n.guid, []);
        for (const e of c.graph.edges) {
            const permeable = e.kind === 'CONNECTS_THROUGH' || (e.kind === 'ADJACENT_TO' && e.props?.permeable === true);
            if (!permeable) continue;
            adj.get(e.from)?.push(e.to);
            adj.get(e.to)?.push(e.from);
        }
        if (spaceNodes.length === 0) return true;
        // Root at any entrance-ish space, else the first space (matches the gate's fallback).
        const root = spaceNodes[0]!.guid;
        const seen = new Set([root]); const q = [root];
        while (q.length) { const cur = q.shift()!; for (const nb of adj.get(cur) ?? []) if (!seen.has(nb)) { seen.add(nb); q.push(nb); } }
        const typeOf = (n: typeof spaceNodes[number]): string =>
            String(n.attrs?.spaceType ?? n.attrs?.roomType ?? n.attrs?.name ?? '').toLowerCase();
        for (const n of spaceNodes) {
            if (!HABITABLE.has(typeOf(n))) continue;
            if (!seen.has(n.guid)) return false;
        }
        return true;
    };

    it('axis-aligned plate: a winner exists, is hard-valid, and seals NO habitable room', () => {
        const out = enumerateLayouts(input({ shellPolygon: AXIS }));
        expect(out.length).toBeGreaterThan(0);
        expect(out[0]!.hardValid).toBe(true);
        expect(out[0]!.hardFailedRules).not.toContain('reach');
    });

    it('ROTATED (30°) plate: still ships a winner and the reach gate does NOT spuriously reject it', () => {
        const out = enumerateLayouts(input({ shellPolygon: ROTATED, seed: 'reach-rot' }));
        expect(out.length).toBeGreaterThan(0);
        // The fix must not regress a good rotated plate: the winner must not fail on `reach`.
        expect(out[0]!.hardFailedRules).not.toContain('reach');
        expect(everyHabitableReachable(out[0]!), 'winner seals a habitable room on the rotated plate').toBe(true);
    });

    it('determinism preserved on the rotated plate (ADR-0061) — two runs byte-identical', () => {
        const i = input({ shellPolygon: ROTATED, seed: 'reach-rot' });
        expect(JSON.stringify(enumerateLayouts(i))).toEqual(JSON.stringify(enumerateLayouts(i)));
    });
});
