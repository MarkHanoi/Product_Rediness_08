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
    FORBIDDEN_ADJACENCIES,
    MANDATORY_ADJACENCIES,
    PREFERRED_ADJACENCIES,
    validateForbiddenAdjacency,
    validateMandatoryAdjacency,
    validatePreferredAdjacency,
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

describe('validatePreferredAdjacency — A-2 stand-alone validator', () => {
    it('returns no violations for an empty rooms list', () => {
        expect(validatePreferredAdjacency([], [])).toEqual([]);
    });

    it('returns no violations for a layout with only rooms not in the rule table', () => {
        const rooms = [room('s1', 'storage'), room('x1', 'corridor')];
        expect(validatePreferredAdjacency(rooms, [])).toEqual([]);
    });

    it('kitchen + utility_room exist and ARE adjacent → no violation', () => {
        const rooms = [room('K', 'kitchen'), room('U', 'utility_room')];
        const edges = [edge('K', 'U')];
        const out = validatePreferredAdjacency(rooms, edges);
        const v = out.filter(x => x.roomATypeName === 'kitchen' && x.roomBTypeName === 'utility_room');
        expect(v).toEqual([]);
    });

    it('kitchen + utility_room exist but NOT adjacent → ONE warning', () => {
        const rooms = [room('K', 'kitchen'), room('U', 'utility_room')];
        const out = validatePreferredAdjacency(rooms, []);
        const v = out.filter(x => x.roomATypeName === 'kitchen' && x.roomBTypeName === 'utility_room');
        expect(v).toHaveLength(1);
        expect(v[0]!.classId).toBe('A-2');
        expect(v[0]!.severity).toBe('warning');
        expect(v[0]!.roomAId).toBe('K');
        assertMessageTraceability(v[0]!);
    });

    it('kitchen alone (no utility_room) → NO violation (if-toType-exists dormant)', () => {
        const rooms = [room('K', 'kitchen')];
        const out = validatePreferredAdjacency(rooms, []);
        // No utility_room, no balcony, no private_office partners either —
        // and no `living_room` so the kitchen↔living_room rule is also dormant.
        const v = out.filter(x => x.roomATypeName === 'kitchen');
        expect(v).toEqual([]);
    });

    it('living_room + balcony adjacent → NO violation', () => {
        const rooms = [room('L', 'living_room'), room('B', 'balcony')];
        const edges = [edge('L', 'B')];
        const out = validatePreferredAdjacency(rooms, edges);
        expect(out.filter(x => x.roomATypeName === 'living_room' && x.roomBTypeName === 'balcony')).toEqual([]);
    });

    it('living_room + balcony exist but not adjacent → ONE warning', () => {
        const rooms = [room('L', 'living_room'), room('B', 'balcony')];
        const out = validatePreferredAdjacency(rooms, []);
        const v = out.filter(x => x.roomATypeName === 'living_room' && x.roomBTypeName === 'balcony');
        expect(v).toHaveLength(1);
        expect(v[0]!.severity).toBe('warning');
    });

    it('master_bedroom + private_office not adjacent → ONE warning', () => {
        const rooms = [room('M', 'master_bedroom'), room('O', 'private_office')];
        const out = validatePreferredAdjacency(rooms, []);
        const v = out.filter(x => x.roomATypeName === 'master_bedroom' && x.roomBTypeName === 'private_office');
        expect(v).toHaveLength(1);
        expect(v[0]!.classId).toBe('A-2');
    });

    it('entrance_hall + wc not adjacent → ONE warning (guest-wc convenience)', () => {
        const rooms = [room('H', 'entrance_hall'), room('W', 'wc')];
        const out = validatePreferredAdjacency(rooms, []);
        const v = out.filter(x => x.roomATypeName === 'entrance_hall' && x.roomBTypeName === 'wc');
        expect(v).toHaveLength(1);
        expect(v[0]!.severity).toBe('warning');
    });

    it('bedroom + bathroom not adjacent → ONE warning (morning-routine)', () => {
        const rooms = [room('Br', 'bedroom'), room('Ba', 'bathroom')];
        const out = validatePreferredAdjacency(rooms, []);
        const v = out.filter(x => x.roomATypeName === 'bedroom' && x.roomBTypeName === 'bathroom');
        expect(v).toHaveLength(1);
    });

    it('edge orientation is symmetric — (bId, aId) satisfies the rule too', () => {
        const rooms = [room('K', 'kitchen'), room('U', 'utility_room')];
        const edges = [edge('U', 'K')];
        const out = validatePreferredAdjacency(rooms, edges);
        expect(out.filter(x => x.roomATypeName === 'kitchen' && x.roomBTypeName === 'utility_room')).toEqual([]);
    });

    it('multiple preferred-adjacency failures across rules are ALL reported as warnings', () => {
        // Every A-2 partner exists and NOTHING is adjacent.
        const rooms = [
            room('K',  'kitchen'),
            room('U',  'utility_room'),
            room('L',  'living_room'),
            room('Ba', 'balcony'),
            room('M',  'master_bedroom'),
            room('O',  'private_office'),
            room('H',  'entrance_hall'),
            room('W',  'wc'),
            room('Br', 'bedroom'),
            room('Bt', 'bathroom'),
        ];
        const out = validatePreferredAdjacency(rooms, []);
        // 6 rules × 1 failing fromType room each ⇒ 6 warnings.
        expect(out).toHaveLength(6);
        for (const v of out) {
            expect(v.classId).toBe('A-2');
            expect(v.severity).toBe('warning');
            assertMessageTraceability(v);
        }
    });

    it('two bedrooms, only one adjacent to bathroom → ONE warning for the other', () => {
        const rooms = [
            room('B1', 'bedroom'),
            room('B2', 'bedroom'),
            room('BA', 'bathroom'),
        ];
        const edges = [edge('B1', 'BA')];
        const out = validatePreferredAdjacency(rooms, edges);
        const v = out.filter(x => x.roomATypeName === 'bedroom' && x.roomBTypeName === 'bathroom');
        expect(v).toHaveLength(1);
        expect(v[0]!.roomAId).toBe('B2');
    });

    it('PREFERRED_ADJACENCIES table exposes the canonical six rules', () => {
        expect(PREFERRED_ADJACENCIES).toHaveLength(6);
        const pairs = PREFERRED_ADJACENCIES.map(r => `${r.fromType}/${r.toType as string}`);
        expect(pairs).toEqual([
            'kitchen/utility_room',
            'living_room/balcony',
            'master_bedroom/private_office',
            'entrance_hall/wc',
            'bedroom/bathroom',
            'kitchen/living_room',
        ]);
        // Every A-2 rule must use the `if-toType-exists` condition.
        for (const r of PREFERRED_ADJACENCIES) {
            expect(r.condition).toBe('if-toType-exists');
        }
    });
});

describe('validateForbiddenAdjacency — A-3 stand-alone validator', () => {
    it('returns no violations for an empty rooms list', () => {
        expect(validateForbiddenAdjacency([], [])).toEqual([]);
    });

    it('returns no violations when no forbidden edges are present', () => {
        const rooms = [
            room('K', 'kitchen'),
            room('L', 'living_room'),
            room('C', 'corridor'),
            room('BA', 'bathroom'),
        ];
        const edges = [edge('K', 'L'), edge('L', 'C'), edge('BA', 'C')];
        expect(validateForbiddenAdjacency(rooms, edges)).toEqual([]);
    });

    it('bathroom ↔ kitchen direct edge → ONE error', () => {
        const rooms = [room('BA', 'bathroom'), room('K', 'kitchen')];
        const edges = [edge('BA', 'K')];
        const out = validateForbiddenAdjacency(rooms, edges);
        expect(out).toHaveLength(1);
        expect(out[0]!.classId).toBe('A-3');
        expect(out[0]!.severity).toBe('error');
        expect(out[0]!.roomAId).toBe('BA');
        expect(out[0]!.roomATypeName).toBe('bathroom');
        expect(out[0]!.roomBTypeName).toBe('kitchen');
        assertMessageTraceability(out[0]!);
    });

    it('edge orientation is symmetric — (K, BA) still violates bathroom↔kitchen', () => {
        const rooms = [room('BA', 'bathroom'), room('K', 'kitchen')];
        const edges = [edge('K', 'BA')];
        const out = validateForbiddenAdjacency(rooms, edges);
        expect(out).toHaveLength(1);
        // roomAId is always the FROMTYPE-side endpoint (bathroom).
        expect(out[0]!.roomAId).toBe('BA');
        expect(out[0]!.roomATypeName).toBe('bathroom');
    });

    it('wc ↔ kitchen direct edge → ONE error', () => {
        const rooms = [room('W', 'wc'), room('K', 'kitchen')];
        const edges = [edge('W', 'K')];
        const out = validateForbiddenAdjacency(rooms, edges);
        expect(out).toHaveLength(1);
        expect(out[0]!.roomATypeName).toBe('wc');
        expect(out[0]!.roomBTypeName).toBe('kitchen');
    });

    it('wc ↔ dining_room direct edge → ONE error', () => {
        const rooms = [room('W', 'wc'), room('D', 'dining_room')];
        const edges = [edge('W', 'D')];
        const out = validateForbiddenAdjacency(rooms, edges);
        expect(out).toHaveLength(1);
        expect(out[0]!.roomBTypeName).toBe('dining_room');
    });

    it('bedroom ↔ kitchen direct edge → ONE error', () => {
        const rooms = [room('B', 'bedroom'), room('K', 'kitchen')];
        const edges = [edge('B', 'K')];
        const out = validateForbiddenAdjacency(rooms, edges);
        const v = out.filter(x => x.roomATypeName === 'bedroom' && x.roomBTypeName === 'kitchen');
        expect(v).toHaveLength(1);
        expect(v[0]!.severity).toBe('error');
    });

    it('master_bedroom ↔ kitchen direct edge → ONE error', () => {
        const rooms = [room('M', 'master_bedroom'), room('K', 'kitchen')];
        const edges = [edge('M', 'K')];
        const out = validateForbiddenAdjacency(rooms, edges);
        const v = out.filter(x => x.roomATypeName === 'master_bedroom' && x.roomBTypeName === 'kitchen');
        expect(v).toHaveLength(1);
    });

    it('ensuite ↔ kitchen direct edge → ONE error', () => {
        const rooms = [room('E', 'ensuite'), room('K', 'kitchen')];
        const edges = [edge('E', 'K')];
        const out = validateForbiddenAdjacency(rooms, edges);
        const v = out.filter(x => x.roomATypeName === 'ensuite' && x.roomBTypeName === 'kitchen');
        expect(v).toHaveLength(1);
    });

    it('multiple forbidden edges in one layout → ONE error per offending edge', () => {
        const rooms = [
            room('BA', 'bathroom'),
            room('K',  'kitchen'),
            room('W',  'wc'),
            room('B',  'bedroom'),
            room('M',  'master_bedroom'),
            room('E',  'ensuite'),
            room('D',  'dining_room'),
        ];
        const edges = [
            edge('BA', 'K'),  // A-3 bathroom↔kitchen
            edge('W',  'K'),  // A-3 wc↔kitchen
            edge('W',  'D'),  // A-3 wc↔dining_room
            edge('B',  'K'),  // A-3 bedroom↔kitchen
            edge('M',  'K'),  // A-3 master_bedroom↔kitchen
            edge('E',  'K'),  // A-3 ensuite↔kitchen
        ];
        const out = validateForbiddenAdjacency(rooms, edges);
        expect(out).toHaveLength(6);
        for (const v of out) {
            expect(v.classId).toBe('A-3');
            expect(v.severity).toBe('error');
            assertMessageTraceability(v);
        }
    });

    it('edges referencing unknown room ids are silently ignored', () => {
        const rooms = [room('BA', 'bathroom')];   // no 'K' in rooms
        const edges = [edge('BA', 'K')];
        expect(validateForbiddenAdjacency(rooms, edges)).toEqual([]);
    });

    it('rooms of forbidden types that are NOT directly edged → NO violation', () => {
        // Open-plan principle: bedroom and kitchen both exist but connect via
        // the corridor — there is no direct edge between them.
        const rooms = [
            room('B', 'bedroom'),
            room('C', 'corridor'),
            room('K', 'kitchen'),
        ];
        const edges = [edge('B', 'C'), edge('C', 'K')];
        const out = validateForbiddenAdjacency(rooms, edges);
        expect(out).toEqual([]);
    });

    it('A-2 (warning) and A-3 (error) emit distinct severities for the same room set', () => {
        // bedroom + kitchen with a direct edge → A-3 error.
        // bedroom + bathroom exist but not edged → A-2 warning.
        const rooms = [
            room('B',  'bedroom'),
            room('K',  'kitchen'),
            room('BA', 'bathroom'),
        ];
        const edges = [edge('B', 'K')];
        const a2 = validatePreferredAdjacency(rooms, edges);
        const a3 = validateForbiddenAdjacency(rooms, edges);
        const a2Bedroom = a2.filter(v => v.roomATypeName === 'bedroom' && v.roomBTypeName === 'bathroom');
        const a3Bedroom = a3.filter(v => v.roomATypeName === 'bedroom' && v.roomBTypeName === 'kitchen');
        expect(a2Bedroom).toHaveLength(1);
        expect(a2Bedroom[0]!.severity).toBe('warning');
        expect(a2Bedroom[0]!.classId).toBe('A-2');
        expect(a3Bedroom).toHaveLength(1);
        expect(a3Bedroom[0]!.severity).toBe('error');
        expect(a3Bedroom[0]!.classId).toBe('A-3');
    });

    it('FORBIDDEN_ADJACENCIES table exposes the canonical six rules', () => {
        expect(FORBIDDEN_ADJACENCIES).toHaveLength(6);
        const pairs = FORBIDDEN_ADJACENCIES.map(r => `${r.fromType}/${r.toType}`);
        expect(pairs).toEqual([
            'bathroom/kitchen',
            'wc/kitchen',
            'wc/dining_room',
            'bedroom/kitchen',
            'master_bedroom/kitchen',
            'ensuite/kitchen',
        ]);
    });
});
