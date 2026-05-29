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
