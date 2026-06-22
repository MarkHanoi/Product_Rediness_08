// §CIRCULATION-HARD-GATE Part A3 (founder spec, 2026-06-22) — "Every habitable room EXCEPT
// ensuite and closet/storage (when paired to a master) must have a DIRECT door onto corridor
// (or hall on the ground floor). No 'served-through' exceptions for anything else."
//
// This is the founder's §SUITE-WITHIN-PARENT rule (msg 1) expressed as a HARD gate: a bedroom
// served THROUGH another habitable room (the inspector's "Bedroom 1 — served through Dining /
// Bedroom 2") is a hard failure, but an EN-SUITE served through its master is CORRECT (it is
// connected WITHIN the parent — "fewer rooms needing corridor access, easier to manage").
//
// The gate predicate `servedThroughPrivateRoomIds` is EMITTED-DOOR based (it reads the realised
// `doorOpenings`, NOT shared-wall adjacency, per the founder's "checked on the actual emitted
// door set, not adjacency") and angle-independent (pure graph over room ids — no coordinates).
//
// TEST-FIRST (given the revert history): these unit cases pin the predicate the new Rule
// 'served-through' consumes; the end-to-end case asserts the SELECTED winner never strands a
// non-exempt private room when a direct-access sibling exists, and determinism is preserved.

import { describe, expect, it } from 'vitest';
import {
    servedThroughPrivateRoomIds,
    enumerateLayouts,
    type EnumerateInput,
} from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import type { BubbleGraph, ProgramRoom, AdjacencyEdge } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import type { DoorOpening } from '../src/workflows/apartmentLayout/topology/validateMandatoryAdjacencies.js';
import type { Pt, Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram, RoomType, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

// ── tiny bubble-graph builders (no geometry — the gate is purely topological) ──
const room = (id: string, type: RoomType, ensuiteHostId?: string): ProgramRoom => ({
    id, type, name: id, targetAreaM2: 12, isPrivate: false, needsWindow: false,
    ...(ensuiteHostId ? { ensuiteHostId } : {}),
});
const door = (a: string, b: string): DoorOpening => ({ type: 'door', betweenRoomIds: [a, b] });
const bubble = (
    rooms: readonly ProgramRoom[],
    entryId: string | null,
    corridorId: string | null = null,
): BubbleGraph => ({ rooms, edges: [] as readonly AdjacencyEdge[], entryId, corridorId });

describe('§CIRCULATION-HARD-GATE A3: servedThroughPrivateRoomIds (emitted-door, ensuite-exempt)', () => {
    // A suite-style plan: corridor + master(→corridor) + ensuite(→master only) + bed1(→corridor)
    // + bed2(→bed1 only, SERVED-THROUGH) + bath(→corridor).
    const ROOMS = [
        room('corridor', 'corridor'),
        room('master', 'master'),
        room('ensuite', 'ensuite', 'master'),
        room('bed1', 'bedroom'),
        room('bed2', 'bedroom'),
        room('bath', 'bathroom'),
    ] as const;

    it('a bedroom served THROUGH another bedroom is flagged; the ensuite (served within master) is EXEMPT', () => {
        const doors = [
            door('corridor', 'master'),
            door('master', 'ensuite'),   // ensuite is correctly served WITHIN the master
            door('corridor', 'bed1'),
            door('bed1', 'bed2'),        // bed2 has NO direct corridor door → served-through
            door('corridor', 'bath'),
        ];
        const g = bubble(ROOMS, null, 'corridor');
        expect(servedThroughPrivateRoomIds({ bubble: g, doorOpenings: doors })).toEqual(['bed2']);
    });

    it('every private room with a DIRECT corridor door ⇒ none served-through (ensuite still ignored)', () => {
        const doors = [
            door('corridor', 'master'),
            door('master', 'ensuite'),
            door('corridor', 'bed1'),
            door('corridor', 'bed2'),
            door('corridor', 'bath'),
        ];
        const g = bubble(ROOMS, null, 'corridor');
        expect(servedThroughPrivateRoomIds({ bubble: g, doorOpenings: doors })).toEqual([]);
    });

    it('the ensuite is NEVER flagged even with NO corridor door (it is served within its master)', () => {
        // Only the ensuite lacks a corridor door — and that is the INTENDED suite topology.
        const doors = [
            door('corridor', 'master'),
            door('master', 'ensuite'),
            door('corridor', 'bed1'),
            door('corridor', 'bed2'),
            door('corridor', 'bath'),
        ];
        const g = bubble(ROOMS, null, 'corridor');
        const flagged = servedThroughPrivateRoomIds({ bubble: g, doorOpenings: doors });
        expect(flagged).not.toContain('ensuite');
        expect(flagged).toEqual([]);
    });

    it('a door directly onto the STAIR counts as circulation (an upper-floor room on the landing is NOT served-through)', () => {
        const rooms = [
            room('stair', 'stair'),
            room('corridor', 'corridor'),
            room('bed1', 'bedroom'),
        ];
        const doors = [door('stair', 'bed1')];   // bed1 opens straight onto the stair landing
        const g = bubble(rooms, null, 'corridor');
        expect(servedThroughPrivateRoomIds({ bubble: g, doorOpenings: doors })).toEqual([]);
    });

    it('is deterministic + sorted (two private rooms stranded, supplied reversed ⇒ sorted ids)', () => {
        const doors = [door('corridor', 'master'), door('master', 'ensuite')];  // bed1, bed2, bath all stranded
        const g = bubble(ROOMS, null, 'corridor');
        const a = servedThroughPrivateRoomIds({ bubble: g, doorOpenings: doors });
        const b = servedThroughPrivateRoomIds({ bubble: g, doorOpenings: doors });
        expect(a).toEqual(b);
        expect(a).toEqual(['bath', 'bed1', 'bed2']);   // sorted; master direct, ensuite exempt
    });

    it('no corridor/hall in the program ⇒ nothing to gate (returns empty, never throws)', () => {
        const rooms = [room('living', 'living'), room('kitchen', 'kitchen')];
        const g = bubble(rooms, null, null);
        expect(servedThroughPrivateRoomIds({ bubble: g, doorOpenings: [] })).toEqual([]);
    });
});

// ── End-to-end: on a HOUSE plate (stair keep-out present ⇒ the gate is active) the SELECTED
//    winner must never strand a non-exempt private room when a direct-access sibling exists. The
//    apartment path (no keep-out) must stay byte-identical (the gate is house-scoped). ──────────
describe('§CIRCULATION-HARD-GATE A3: enumerateLayouts prefers a served-through-clean winner (house path)', () => {
    const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };
    const PROGRAM: ApartmentProgram = {
        bedrooms: 3, bathrooms: 2, masterEnSuite: true,
        includeKitchen: true, livingRoom: true, openPlanKitchenDining: false, entranceHall: true,
    };
    const PLATE: Pt[] = [{ x: 0, z: 0 }, { x: 14, z: 0 }, { x: 14, z: 11 }, { x: 0, z: 11 }];
    const STAIR: Rect = { x0: 12, z0: 9, x1: 14, z1: 11 };   // corner stair keep-out (house path)
    const input = (over: Partial<EnumerateInput> = {}): EnumerateInput => ({
        shellPolygon: PLATE, program: PROGRAM, levelId: 'L0', seed: 'served-through',
        weights: WEIGHTS, count: 3, keepOutRects: [STAIR], ...over,
    });

    it('the shipped winner never carries a `served-through` failure when a clean sibling exists', () => {
        const out = enumerateLayouts(input());
        expect(out.length).toBeGreaterThan(0);
        const anyClean = out.some(c => !c.hardFailedRules.includes('served-through'));
        if (anyClean) {
            expect(out[0]!.hardFailedRules).not.toContain('served-through');
        }
    });

    it('determinism preserved (ADR-0061) — two runs byte-identical', () => {
        const i = input();
        expect(JSON.stringify(enumerateLayouts(i))).toEqual(JSON.stringify(enumerateLayouts(i)));
    });
});
