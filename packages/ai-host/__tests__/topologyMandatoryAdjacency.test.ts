// A-1 — Mandatory-adjacency validator tests
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29
// Part B §A-class table).
//
// Pin the canonical residential mandatory-adjacency rules as executable
// assertions. Filename intentionally distinct from `topologyValidators.test.ts`
// (which already pins the existing `topology/` directory's validators) — this
// suite covers the new `validators/topology/` stand-alone validator.

import { describe, expect, it } from 'vitest';
import {
    MANDATORY_ADJACENCIES,
    validateMandatoryAdjacency,
    type AdjacencyEdge,
    type TopologyViolation,
} from '../src/workflows/apartmentLayout/validators/topology/index.js';

const room = (id: string, type: string) => ({ id, type });
const edge = (aId: string, bId: string): AdjacencyEdge => ({ aId, bId });

// Convenience: every emitted violation must mention BOTH the failing room id
// AND the partner type label (traceability — the modal renders this verbatim).
const assertMessageTraceability = (v: TopologyViolation): void => {
    expect(v.message).toContain(v.roomAId);
    expect(v.message).toContain(v.roomATypeName);
    expect(v.message).toContain(v.roomBTypeName);
};

describe('validateMandatoryAdjacency — A-1 stand-alone validator', () => {
    it('returns no violations for an empty rooms list', () => {
        const v = validateMandatoryAdjacency([], []);
        expect(v).toEqual([]);
    });

    it('returns no violations for a layout with only rooms not in the rule table', () => {
        const rooms = [room('s1', 'storage'), room('b1', 'balcony')];
        expect(validateMandatoryAdjacency(rooms, [])).toEqual([]);
    });

    it('master_bedroom adjacent to ensuite → no violation (rule satisfied)', () => {
        const rooms = [room('M', 'master_bedroom'), room('E', 'ensuite')];
        const edges = [edge('M', 'E')];
        const out = validateMandatoryAdjacency(rooms, edges);
        const a1 = out.filter(v => v.roomATypeName === 'master_bedroom');
        expect(a1).toEqual([]);
    });

    it('master_bedroom WITHOUT adjacency to ensuite, ensuite EXISTS → ONE violation', () => {
        const rooms = [room('M', 'master_bedroom'), room('E', 'ensuite')];
        const out = validateMandatoryAdjacency(rooms, []);
        const a1 = out.filter(v => v.roomATypeName === 'master_bedroom');
        expect(a1).toHaveLength(1);
        expect(a1[0]!.classId).toBe('A-1');
        expect(a1[0]!.severity).toBe('error');
        expect(a1[0]!.roomAId).toBe('M');
        expect(a1[0]!.roomBTypeName).toBe('ensuite');
        assertMessageTraceability(a1[0]!);
    });

    it('master_bedroom without ensuite in the layout → NO violation (if-toType-exists)', () => {
        const rooms = [room('M', 'master_bedroom'), room('B', 'bedroom')];
        const out = validateMandatoryAdjacency(rooms, []);
        const a1 = out.filter(v => v.roomATypeName === 'master_bedroom');
        expect(a1).toEqual([]);
    });

    it('kitchen + dining_room exist but not adjacent → ONE violation', () => {
        const rooms = [room('K', 'kitchen'), room('D', 'dining_room')];
        const out = validateMandatoryAdjacency(rooms, []);
        const kitchenV = out.filter(v => v.roomATypeName === 'kitchen');
        expect(kitchenV).toHaveLength(1);
        expect(kitchenV[0]!.roomAId).toBe('K');
        expect(kitchenV[0]!.roomBTypeName).toBe('dining_room');
    });

    it('kitchen alone with no separate dining_room → NO violation (open-plan implicit)', () => {
        const rooms = [
            room('K', 'kitchen'), room('L', 'living_room'), room('C', 'corridor'),
        ];
        const edges = [edge('K', 'L')];
        const out = validateMandatoryAdjacency(rooms, edges);
        const kitchenV = out.filter(v => v.roomATypeName === 'kitchen');
        expect(kitchenV).toEqual([]);
    });

    it('entrance_hall adjacent to corridor → NO violation', () => {
        const rooms = [room('H', 'entrance_hall'), room('C', 'corridor')];
        const edges = [edge('H', 'C')];
        const out = validateMandatoryAdjacency(rooms, edges);
        const hallV = out.filter(v => v.roomATypeName === 'entrance_hall');
        expect(hallV).toEqual([]);
    });

    it('entrance_hall adjacent ONLY to a bedroom → ONE violation (always condition)', () => {
        const rooms = [room('H', 'entrance_hall'), room('B', 'bedroom')];
        const edges = [edge('H', 'B')];
        const out = validateMandatoryAdjacency(rooms, edges);
        const hallV = out.filter(v => v.roomATypeName === 'entrance_hall');
        expect(hallV).toHaveLength(1);
        expect(hallV[0]!.roomAId).toBe('H');
        // The partner label is a pipe-joined OR set.
        expect(hallV[0]!.roomBTypeName).toBe('living_room|kitchen|corridor');
        assertMessageTraceability(hallV[0]!);
    });

    it('entrance_hall present, NO social or circulation rooms at all → still ONE violation', () => {
        // `always` means the rule fires whenever the fromType room exists,
        // regardless of partner presence.
        const rooms = [room('H', 'entrance_hall')];
        const out = validateMandatoryAdjacency(rooms, []);
        const hallV = out.filter(v => v.roomATypeName === 'entrance_hall');
        expect(hallV).toHaveLength(1);
    });

    it('utility_room exists, no kitchen edge → ONE violation', () => {
        const rooms = [room('U', 'utility_room'), room('K', 'kitchen')];
        const out = validateMandatoryAdjacency(rooms, []);
        const utilV = out.filter(v => v.roomATypeName === 'utility_room');
        expect(utilV).toHaveLength(1);
        expect(utilV[0]!.roomBTypeName).toBe('kitchen');
    });

    it('utility_room adjacent to kitchen → NO violation', () => {
        const rooms = [room('U', 'utility_room'), room('K', 'kitchen')];
        const edges = [edge('U', 'K')];
        const out = validateMandatoryAdjacency(rooms, edges);
        expect(out.filter(v => v.roomATypeName === 'utility_room')).toEqual([]);
    });

    it('bathroom adjacent ONLY to bedroom → ONE violation (cross-checks §BATH-CORRIDOR-ONLY)', () => {
        const rooms = [room('B', 'bedroom'), room('BA', 'bathroom')];
        const edges = [edge('BA', 'B')];
        const out = validateMandatoryAdjacency(rooms, edges);
        const bathV = out.filter(v => v.roomATypeName === 'bathroom');
        expect(bathV).toHaveLength(1);
        expect(bathV[0]!.roomAId).toBe('BA');
        expect(bathV[0]!.roomBTypeName).toBe('corridor|entrance_hall');
    });

    it('bathroom adjacent to corridor → NO violation', () => {
        const rooms = [room('BA', 'bathroom'), room('C', 'corridor')];
        const edges = [edge('BA', 'C')];
        const out = validateMandatoryAdjacency(rooms, edges);
        expect(out.filter(v => v.roomATypeName === 'bathroom')).toEqual([]);
    });

    it('wc adjacent to corridor → NO violation', () => {
        const rooms = [room('W', 'wc'), room('C', 'corridor')];
        const edges = [edge('W', 'C')];
        const out = validateMandatoryAdjacency(rooms, edges);
        expect(out.filter(v => v.roomATypeName === 'wc')).toEqual([]);
    });

    it('wc adjacent ONLY to a bedroom → ONE violation (privacy programme)', () => {
        const rooms = [room('W', 'wc'), room('B', 'bedroom')];
        const edges = [edge('W', 'B')];
        const out = validateMandatoryAdjacency(rooms, edges);
        const wcV = out.filter(v => v.roomATypeName === 'wc');
        expect(wcV).toHaveLength(1);
        expect(wcV[0]!.roomBTypeName).toBe('corridor|entrance_hall');
    });

    it('multiple violations across rules are ALL reported', () => {
        // Construct a deliberately bad layout: every mandatory rule fails.
        const rooms = [
            room('M',  'master_bedroom'),
            room('E',  'ensuite'),         // master ↛ ensuite
            room('K',  'kitchen'),
            room('D',  'dining_room'),     // kitchen ↛ dining_room
            room('H',  'entrance_hall'),   // hall ↛ social/corridor
            room('U',  'utility_room'),    // utility ↛ kitchen
            room('W',  'wc'),              // wc ↛ corridor/hall
            room('BA', 'bathroom'),        // bathroom ↛ corridor/hall
        ];
        const out = validateMandatoryAdjacency(rooms, []);
        // Six failing rules over six unique fromType rooms ⇒ 6 violations.
        expect(out).toHaveLength(6);
        const types = out.map(v => v.roomATypeName).sort();
        expect(types).toEqual([
            'bathroom', 'entrance_hall', 'kitchen', 'master_bedroom',
            'utility_room', 'wc',
        ].sort());
        for (const v of out) {
            expect(v.classId).toBe('A-1');
            expect(v.severity).toBe('error');
            assertMessageTraceability(v);
        }
    });

    it('edge orientation is symmetric — (bId, aId) satisfies the rule too', () => {
        const rooms = [room('M', 'master_bedroom'), room('E', 'ensuite')];
        // Reversed orientation.
        const edges = [edge('E', 'M')];
        const out = validateMandatoryAdjacency(rooms, edges);
        expect(out.filter(v => v.roomATypeName === 'master_bedroom')).toEqual([]);
    });

    it('MANDATORY_ADJACENCIES table exposes the canonical six rules', () => {
        expect(MANDATORY_ADJACENCIES).toHaveLength(6);
        const froms = MANDATORY_ADJACENCIES.map(r => r.fromType);
        expect(froms).toEqual([
            'master_bedroom', 'kitchen', 'entrance_hall',
            'utility_room', 'wc', 'bathroom',
        ]);
    });
});
