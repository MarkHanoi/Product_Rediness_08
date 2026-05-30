// T1 + T2.1 + T2.2 — Part B topology validators tests
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29
// §19).

import { describe, expect, it } from 'vitest';
import {
    mandatoryAdjacenciesFor,
    WET_ROOM_TYPES,
    ACOUSTIC_SOURCE_TYPES,
    ACOUSTIC_RECEIVER_TYPES,
} from '../src/workflows/apartmentLayout/topology/adjacencyRules.js';
import {
    validateMandatoryAdjacencies,
    type DoorOpening,
} from '../src/workflows/apartmentLayout/topology/validateMandatoryAdjacencies.js';
import { validateForbiddenAdjacencies } from
    '../src/workflows/apartmentLayout/topology/validateForbiddenAdjacencies.js';
import { validateCorridorConnectivity } from
    '../src/workflows/apartmentLayout/topology/validateCorridorConnectivity.js';
import type { ApartmentProgram, RoomType } from '../src/workflows/apartmentLayout/types.js';
import type { BubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';

const PROG: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};

const room = (id: string, type: RoomType, name = id) => ({
    id, type, name, targetAreaM2: 10, isPrivate: false, needsWindow: false,
});

const bubbleOf = (rooms: readonly { id: string; type: RoomType; name?: string }[]): BubbleGraph => ({
    rooms: rooms.map(r => room(r.id, r.type, r.name ?? r.id)),
    edges: [], corridorId: null, entryId: rooms[0]?.id ?? null,
});

const door = (a: string, b: string): DoorOpening => ({ type: 'door', betweenRoomIds: [a, b] });
const window_ = (a: string, b: string): DoorOpening => ({ type: 'window', betweenRoomIds: [a, b] });

// ── T1.2 mandatoryAdjacenciesFor ─────────────────────────────────────────────
describe('mandatoryAdjacenciesFor (T1.2)', () => {
    it('returns master↔ensuite when masterEnSuite + bedrooms ≥ 1', () => {
        const m = mandatoryAdjacenciesFor(PROG);
        expect(m.some(x => x.id === 'master-ensuite')).toBe(true);
    });

    it('does NOT return master↔ensuite when masterEnSuite is false', () => {
        const m = mandatoryAdjacenciesFor({ ...PROG, masterEnSuite: false });
        expect(m.some(x => x.id === 'master-ensuite')).toBe(false);
    });

    it('does NOT return master↔ensuite when bedrooms = 0', () => {
        const m = mandatoryAdjacenciesFor({ ...PROG, bedrooms: 0, masterEnSuite: true });
        expect(m.some(x => x.id === 'master-ensuite')).toBe(false);
    });

    it('returns hall↔corridor when hall exists AND there are private rooms', () => {
        const m = mandatoryAdjacenciesFor(PROG);
        expect(m.some(x => x.id === 'hall-corridor')).toBe(true);
    });

    it('returns hall↔living when both exist', () => {
        const m = mandatoryAdjacenciesFor(PROG);
        expect(m.some(x => x.id === 'hall-living')).toBe(true);
    });

    it('returns empty when program has no hall / no private rooms', () => {
        const m = mandatoryAdjacenciesFor({
            bedrooms: 0, bathrooms: 0, masterEnSuite: false,
            openPlanKitchenDining: false, livingRoom: false, entranceHall: false,
        });
        expect(m.length).toBe(0);
    });
});

// ── T1.4 + T1.5 classifications ──────────────────────────────────────────────
describe('wet + acoustic classifications', () => {
    it('classifies kitchen, bathroom, ensuite, wc, utility as wet rooms', () => {
        expect(WET_ROOM_TYPES.has('kitchen')).toBe(true);
        expect(WET_ROOM_TYPES.has('bathroom')).toBe(true);
        expect(WET_ROOM_TYPES.has('ensuite')).toBe(true);
        expect(WET_ROOM_TYPES.has('wc')).toBe(true);
        expect(WET_ROOM_TYPES.has('utility')).toBe(true);
        expect(WET_ROOM_TYPES.has('living')).toBe(false);
    });

    it('classifies living / dining / kitchen / utility as acoustic sources', () => {
        expect(ACOUSTIC_SOURCE_TYPES.has('living')).toBe(true);
        expect(ACOUSTIC_SOURCE_TYPES.has('kitchen')).toBe(true);
        expect(ACOUSTIC_SOURCE_TYPES.has('master')).toBe(false);
    });

    it('classifies master / bedroom / study as acoustic receivers', () => {
        expect(ACOUSTIC_RECEIVER_TYPES.has('master')).toBe(true);
        expect(ACOUSTIC_RECEIVER_TYPES.has('bedroom')).toBe(true);
        expect(ACOUSTIC_RECEIVER_TYPES.has('study')).toBe(true);
        expect(ACOUSTIC_RECEIVER_TYPES.has('kitchen')).toBe(false);
    });
});

// ── T2.1 validateMandatoryAdjacencies ────────────────────────────────────────
describe('validateMandatoryAdjacencies (T2.1)', () => {
    const fullBubble = bubbleOf([
        { id: 'L', type: 'living' },
        { id: 'H', type: 'hall' },
        { id: 'C', type: 'corridor' },
        { id: 'M', type: 'master' },
        { id: 'E', type: 'ensuite' },
    ]);

    it('admits when every mandatory adjacency has a realised door', () => {
        const openings = [door('M', 'E'), door('H', 'C'), door('H', 'L')];
        const v = validateMandatoryAdjacencies(PROG, fullBubble, openings);
        expect(v.admissible).toBe(true);
        expect(v.hardFindings.length).toBe(0);
    });

    it('rejects when master↔ensuite has no realised door', () => {
        const openings = [door('H', 'C'), door('H', 'L')];   // missing M↔E
        const v = validateMandatoryAdjacencies(PROG, fullBubble, openings);
        expect(v.admissible).toBe(false);
        expect(v.hardFindings.some(f => f.metric === 'master-ensuite')).toBe(true);
    });

    it('rejects when hall↔corridor has no realised door', () => {
        const openings = [door('M', 'E'), door('H', 'L')];   // missing H↔C
        const v = validateMandatoryAdjacencies(PROG, fullBubble, openings);
        expect(v.admissible).toBe(false);
        expect(v.hardFindings.some(f => f.metric === 'hall-corridor')).toBe(true);
    });

    it('ignores window openings (only doors realise adjacencies)', () => {
        const openings = [door('M', 'E'), door('H', 'C'), window_('H', 'L')];
        const v = validateMandatoryAdjacencies(PROG, fullBubble, openings);
        expect(v.admissible).toBe(false);
        expect(v.hardFindings.some(f => f.metric === 'hall-living')).toBe(true);
    });

    it('admits cleanly when no mandatory adjacencies are declared', () => {
        const studio: ApartmentProgram = {
            bedrooms: 0, bathrooms: 0, masterEnSuite: false,
            openPlanKitchenDining: true, livingRoom: false, entranceHall: false,
        };
        const v = validateMandatoryAdjacencies(studio, fullBubble, []);
        expect(v.admissible).toBe(true);
        expect(v.hardFindings.length).toBe(0);
    });
});

// ── T2.2 validateForbiddenAdjacencies ────────────────────────────────────────
describe('validateForbiddenAdjacencies (T2.2)', () => {
    const bubble = bubbleOf([
        { id: 'B1', type: 'bedroom' },
        { id: 'B2', type: 'bedroom' },
        { id: 'BA', type: 'bathroom' },
        { id: 'H',  type: 'hall' },
        { id: 'C',  type: 'corridor' },
    ]);

    it('admits cleanly when every door is a permitted pair', () => {
        const openings = [door('B1', 'C'), door('B2', 'C'), door('BA', 'C'), door('H', 'C')];
        const v = validateForbiddenAdjacencies(bubble, openings);
        expect(v.admissible).toBe(true);
        expect(v.hardFindings.length).toBe(0);
    });

    it('rejects a bedroom ↔ bedroom direct door (post §3rules)', () => {
        const openings = [door('B1', 'C'), door('B1', 'B2')];   // forbidden!
        const v = validateForbiddenAdjacencies(bubble, openings);
        expect(v.admissible).toBe(false);
        expect(v.hardFindings.some(f => f.metric === 'door-bedroom-bedroom')).toBe(true);
    });

    it('rejects a bathroom ↔ hall door (codified "entrance not connected to bath")', () => {
        const openings = [door('BA', 'H')];
        const v = validateForbiddenAdjacencies(bubble, openings);
        expect(v.admissible).toBe(false);
        expect(v.hardFindings.some(f => f.metric.includes('bathroom') && f.metric.includes('hall'))).toBe(true);
    });

    it('rejects a bathroom ↔ bedroom direct door (§BATH-CORRIDOR-ONLY)', () => {
        const openings = [door('BA', 'B1')];
        const v = validateForbiddenAdjacencies(bubble, openings);
        expect(v.admissible).toBe(false);
        expect(v.hardFindings.some(f => f.metric.includes('bathroom') && f.metric.includes('bedroom'))).toBe(true);
    });

    it('ignores window openings (only doors are gated)', () => {
        const openings = [window_('B1', 'B2')];   // forbidden as a DOOR, but it's a window
        const v = validateForbiddenAdjacencies(bubble, openings);
        expect(v.admissible).toBe(true);
    });

    it('finding text names BOTH the room labels + privacy classes', () => {
        const openings = [door('B1', 'B2')];
        const v = validateForbiddenAdjacencies(bubble, openings);
        const f = v.hardFindings[0]!;
        expect(f.reason).toMatch(/bedroom.*bedroom/);
        expect(f.reason).toMatch(/private/);
    });
});

// ── T1.C validateCorridorConnectivity ──────────────────────────────────────
describe('validateCorridorConnectivity (T1.C)', () => {
    it('clean pass when every bedroom has a corridor door', () => {
        const bubble = bubbleOf([
            { id: 'H',  type: 'hall' },
            { id: 'C',  type: 'corridor' },
            { id: 'L',  type: 'living' },
            { id: 'B1', type: 'bedroom' },
            { id: 'B2', type: 'bedroom' },
        ]);
        const openings = [door('H', 'L'), door('H', 'C'), door('C', 'B1'), door('C', 'B2')];
        const v = validateCorridorConnectivity(bubble, openings);
        expect(v.admissible).toBe(true);
        expect(v.softFindings).toHaveLength(0);
    });

    it('flags a bedroom whose only door is into the living room', () => {
        const bubble = bubbleOf([
            { id: 'H',  type: 'hall' },
            { id: 'L',  type: 'living' },
            { id: 'B1', type: 'bedroom' },
        ]);
        const openings = [door('H', 'L'), door('L', 'B1')];
        const v = validateCorridorConnectivity(bubble, openings);
        expect(v.softFindings).toHaveLength(1);
        expect(v.softFindings[0]!.metric).toBe('corridorConnectivity');
        expect(v.softFindings[0]!.roomIdA).toBe('B1');
    });

    it('passes an ensuite reached ONLY through its master bedroom', () => {
        const bubble = bubbleOf([
            { id: 'H',  type: 'hall' },
            { id: 'C',  type: 'corridor' },
            { id: 'M',  type: 'master' },
            { id: 'E',  type: 'ensuite' },
        ]);
        const openings = [door('H', 'C'), door('C', 'M'), door('M', 'E')];
        const v = validateCorridorConnectivity(bubble, openings);
        // M passes via the corridor door; E passes via the master-exception.
        expect(v.softFindings).toHaveLength(0);
    });

    it('flags a non-ensuite bathroom reached only through a bedroom', () => {
        const bubble = bubbleOf([
            { id: 'H',  type: 'hall' },
            { id: 'C',  type: 'corridor' },
            { id: 'B',  type: 'bedroom' },
            { id: 'WC', type: 'bathroom' },     // bathroom, not ensuite
        ]);
        const openings = [door('H', 'C'), door('C', 'B'), door('B', 'WC')];
        const v = validateCorridorConnectivity(bubble, openings);
        // Bedroom passes (door to C); bathroom does NOT pass.
        const finding = v.softFindings.find(f => f.roomIdA === 'WC');
        expect(finding).toBeDefined();
        expect(finding!.metric).toBe('corridorConnectivity');
    });

    it('flags a fully isolated private room (no doors at all)', () => {
        const bubble = bubbleOf([
            { id: 'H',  type: 'hall' },
            { id: 'L',  type: 'living' },
            { id: 'B',  type: 'bedroom' },
        ]);
        const openings = [door('H', 'L')];  // B has zero doors
        const v = validateCorridorConnectivity(bubble, openings);
        expect(v.softFindings.length).toBeGreaterThanOrEqual(1);
        const bFinding = v.softFindings.find(f => f.roomIdA === 'B');
        expect(bFinding).toBeDefined();
        expect(bFinding!.reason).toMatch(/isolated|no.*door/);
    });

    it('emits at most ONE finding per private room (no duplicate scoring)', () => {
        const bubble = bubbleOf([
            { id: 'L',  type: 'living' },
            { id: 'B',  type: 'bedroom' },
        ]);
        // Two doors B↔L is impossible in practice but pin against double-counting.
        const openings = [door('L', 'B')];
        const v = validateCorridorConnectivity(bubble, openings);
        const bFindings = v.softFindings.filter(f => f.roomIdA === 'B');
        expect(bFindings).toHaveLength(1);
    });

    it('does NOT flag public rooms (living / kitchen / dining)', () => {
        const bubble = bubbleOf([
            { id: 'H',  type: 'hall' },
            { id: 'L',  type: 'living' },
            { id: 'K',  type: 'kitchen' },
            { id: 'D',  type: 'dining' },
        ]);
        const openings = [door('H', 'L'), door('L', 'K'), door('L', 'D')];
        const v = validateCorridorConnectivity(bubble, openings);
        expect(v.softFindings).toHaveLength(0);
    });

    it('windows do NOT count as connectivity (only doors)', () => {
        const bubble = bubbleOf([
            { id: 'H',  type: 'hall' },
            { id: 'C',  type: 'corridor' },
            { id: 'B',  type: 'bedroom' },
        ]);
        const openings = [door('H', 'C'), window_('C', 'B')];  // window not door
        const v = validateCorridorConnectivity(bubble, openings);
        // B has only a window into C — not a door — should flag.
        expect(v.softFindings.find(f => f.roomIdA === 'B')).toBeDefined();
    });

    it('always returns admissible: true (SOFT-only validator)', () => {
        const bubble = bubbleOf([
            { id: 'L', type: 'living' },
            { id: 'B', type: 'bedroom' },
        ]);
        const v = validateCorridorConnectivity(bubble, [door('L', 'B')]);
        expect(v.admissible).toBe(true);
        expect(v.hardFindings).toHaveLength(0);
    });
});
