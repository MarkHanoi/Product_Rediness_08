// The contextual planner — containment REFUSES with both numbers; the shared face adapts.
// §RESI-STAGE-G (2026-09-05) · STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §11 / §12 · C114 §12a ·
// C73 §2 · C78 §8 · C84 EI-8a.

import { describe, expect, it } from 'vitest';
import {
    SPACE_ENVELOPE_COINCIDENT_M,
    findSharedFaces,
    levelOrphanRefusal,
    planSpaceEnvelopeFaceMoveInContext,
    roomContainmentRefusal,
    SPACE_ENVELOPE_REFUSAL_CODES,
    type SpaceEnvelopeContextEntry,
} from '../src/index.js';
// ⭐ THE LICENSED COPY, PINNED AGAINST ITS SOURCE by relative path (the package may not add
// a workspace dependency in a shared tree). If the kernel moves its value, this fails.
import { COINCIDENT_M } from '../../geometry-kernel/src/tolerance.js';

function box(id: string, x0: number, z0: number, w: number, d: number, h = 3, base = 0) {
    return {
        id,
        footprint: [
            { x: x0, y: 0, z: z0 },
            { x: x0 + w, y: 0, z: z0 },
            { x: x0 + w, y: 0, z: z0 + d },
            { x: x0, y: 0, z: z0 + d },
        ],
        baseOffset: base,
        height: h,
    };
}

function level(id: string, x0: number, z0: number, w: number, d: number): SpaceEnvelopeContextEntry {
    return { prism: box(id, x0, z0, w, d, 3), role: 'level', levelId: 'L0', withinId: null, name: id };
}
function room(id: string, within: string, x0: number, z0: number, w: number, d: number): SpaceEnvelopeContextEntry {
    return { prism: box(id, x0, z0, w, d, 3), role: 'room', levelId: 'L0', withinId: within, name: id };
}

describe('tolerance — a licensed copy of the kernel (C73 §2.1, C84 EI-8a)', () => {
    it('SPACE_ENVELOPE_COINCIDENT_M equals @pryzm/geometry-kernel COINCIDENT_M', () => {
        expect(SPACE_ENVELOPE_COINCIDENT_M).toBe(COINCIDENT_M);
    });
    it('the two containment codes are in the closed union with sentences', () => {
        expect(SPACE_ENVELOPE_REFUSAL_CODES).toContain('room-leaves-level');
        expect(SPACE_ENVELOPE_REFUSAL_CODES).toContain('level-orphans-room');
    });
});

describe('room ⊂ level — REFUSED, never clamped (STR §12)', () => {
    const L = level('Ground', 0, 0, 10, 10);
    // Room 0..4 in x, 0..4 in z, inside the level.
    const R = room('Kitchen', 'Ground', 0, 0, 4, 4);

    it('a contained room yields no refusal', () => {
        expect(roomContainmentRefusal(R.prism, L.prism)).toBeNull();
    });

    it('⛔ a room outside its level refuses with the measured excursion and the bboxes', () => {
        const far = room('Far', 'Ground', 12, 0, 4, 4);
        const r = roomContainmentRefusal(far.prism, L.prism)!;
        expect(r).not.toBeNull();
        expect(r.code).toBe('room-leaves-level');
        expect(r.ground).toBe('INCUMBENT');
        expect(r.requestedValue).toBeCloseTo(6, 6); // 16 - 10
        expect(r.permittedValue).toBe(0);
        expect(r.message).toMatch(/asks for 6\.00 m; the limit is 0\.00 m/);
        expect(r.message).toMatch(/level footprint x 0\.00…10\.00/);
    });

    it('⛔ a face move that would leave the level refuses with BOTH numbers, the second MEASURED', () => {
        // Kitchen's side face #1 is x = 4 (edge from (4,0) to (4,4)), outward +x. Level ends at x = 10.
        const res = planSpaceEnvelopeFaceMoveInContext({
            subject: R, face: { kind: 'side', edgeIndex: 1 }, deltaM: 8, world: [L, R],
        });
        expect('refusal' in res).toBe(true);
        if (!('refusal' in res)) return;
        expect(res.refusal.code).toBe('room-leaves-level');
        expect(res.refusal.requestedValue).toBe(8);
        // The furthest the face can go is 6 m (x = 4 → 10) plus the joined containment
        // question's own 1 cm tolerance (`CONTAINMENT_TOLERANCE_M`), found by bisection.
        expect(res.refusal.permittedValue).toBeGreaterThanOrEqual(6);
        expect(res.refusal.permittedValue).toBeLessThan(6.0102);
        expect(res.refusal.message).toMatch(/asks for 8\.00 m; the limit is 6\.0[01] m/);
        expect(res.refusal.message).toMatch(/'Kitchen'/);
        expect(res.refusal.message).toMatch(/'Ground'/);
    });

    it('a face move that stays inside is planned, and nothing was clamped', () => {
        const res = planSpaceEnvelopeFaceMoveInContext({
            subject: R, face: { kind: 'side', edgeIndex: 1 }, deltaM: 5, world: [L, R],
        });
        expect('plan' in res).toBe(true);
        if (!('plan' in res)) return;
        expect(res.plan.entry.requestedDeltaM).toBe(5);
        expect(Math.max(...res.plan.entry.footprint.map((p) => p.x))).toBeCloseTo(9, 9);
    });

    it('⛔ the top face may not rise above the level', () => {
        const res = planSpaceEnvelopeFaceMoveInContext({
            subject: R, face: { kind: 'top' }, deltaM: 1, world: [L, R],
        });
        expect('refusal' in res).toBe(true);
        if (!('refusal' in res)) return;
        expect(res.refusal.code).toBe('room-leaves-level');
        expect(res.refusal.permittedValue).toBeCloseTo(0, 3);
    });

    it('a room with no level in the world is judged on its own solidity only', () => {
        const orphan = room('Loose', 'missing-level', 0, 0, 4, 4);
        const res = planSpaceEnvelopeFaceMoveInContext({
            subject: orphan, face: { kind: 'side', edgeIndex: 1 }, deltaM: 50, world: [orphan],
        });
        expect('plan' in res).toBe(true);
    });
});

describe('level ⊇ rooms — a level face may not strand a room', () => {
    const L = level('Ground', 0, 0, 10, 10);
    const R = room('Kitchen', 'Ground', 6, 0, 4, 4); // touches the level's x = 10 face

    it('⛔ shrinking the level through the room refuses, naming the room, with both numbers', () => {
        // Level side face #1 is x = 10, outward +x; -3 pulls it to x = 7, through the Kitchen.
        const res = planSpaceEnvelopeFaceMoveInContext({
            subject: L, face: { kind: 'side', edgeIndex: 1 }, deltaM: -3, world: [L, R],
        });
        expect('refusal' in res).toBe(true);
        if (!('refusal' in res)) return;
        expect(res.refusal.code).toBe('level-orphans-room');
        expect(res.refusal.requestedValue).toBe(-3);
        // The room ends at x = 10 exactly, so the permitted inward move is the joined
        // containment question's own tolerance (`CONTAINMENT_TOLERANCE_M` = 0.01 in
        // @pryzm/site-parcel-data) and nothing more — the bisection MEASURES that band
        // rather than assuming zero, which is the point of measuring.
        expect(Math.abs(res.refusal.permittedValue)).toBeLessThan(0.0102);
        expect(Math.abs(res.refusal.permittedValue)).toBeGreaterThan(0.0095);
        expect(res.refusal.message).toMatch(/'Kitchen'/);
        expect(res.refusal.message).toMatch(/asks for -3\.00 m; the limit is/);
    });

    it('growing the level is always fine for its rooms', () => {
        const res = planSpaceEnvelopeFaceMoveInContext({
            subject: L, face: { kind: 'side', edgeIndex: 1 }, deltaM: 3, world: [L, R],
        });
        expect('plan' in res).toBe(true);
    });

    it('levelOrphanRefusal reports the first stranded room', () => {
        const shrunk = box('Ground', 0, 0, 5, 10);
        const r = levelOrphanRefusal(shrunk, [R], "'Ground'")!;
        expect(r.code).toBe('level-orphans-room');
        expect(r.requestedValue).toBeCloseTo(5, 6);
        expect(r.message).toMatch(/'Kitchen'/);
    });
});

describe('neighbour adaptation — the shared face moves in the same plan (STR §11)', () => {
    const L = level('Ground', 0, 0, 12, 6);
    const A = room('A', 'Ground', 0, 0, 4, 6);   // x 0..4
    const B = room('B', 'Ground', 4, 0, 4, 6);   // x 4..8 — shares A's x = 4 face
    const C = room('C', 'Ground', 8, 0, 4, 6);   // x 8..12 — does NOT touch A

    it('findSharedFaces finds B’s x = 4 face against A’s, and not C', () => {
        const shared = findSharedFaces(A, { kind: 'side', edgeIndex: 1 }, [L, A, B, C]);
        expect(shared.map((s) => s.envelopeId)).toEqual(['B']);
        // B's ring: (4,0)→(8,0)→(8,6)→(4,6); its x = 4 edge is #3, from (4,6) to (4,0).
        expect(shared[0]!.face.edgeIndex).toBe(3);
        expect(shared[0]!.overlapM).toBeCloseTo(6, 9);
    });

    it('a face 2 mm away is NOT shared (tolerance is 1 mm, C73)', () => {
        const B2 = room('B2', 'Ground', 4.002, 0, 4, 6);
        expect(findSharedFaces(A, { kind: 'side', edgeIndex: 1 }, [L, A, B2])).toEqual([]);
    });

    it('⭐ moving A’s shared face by +1 moves B’s face with it, in ONE plan', () => {
        const res = planSpaceEnvelopeFaceMoveInContext({
            subject: A, face: { kind: 'side', edgeIndex: 1 }, deltaM: 1, world: [L, A, B, C],
        });
        expect('plan' in res).toBe(true);
        if (!('plan' in res)) return;
        expect(Math.max(...res.plan.entry.footprint.map((p) => p.x))).toBeCloseTo(5, 9);
        expect(res.plan.adapted).toHaveLength(1);
        const b = res.plan.adapted[0]!;
        expect(b.envelopeId).toBe('B');
        // B's x = 4 face moved to x = 5 — the SAME world displacement, a NEGATED face delta.
        expect(b.requestedDeltaM).toBe(-1);
        expect(Math.min(...b.footprint.map((p) => p.x))).toBeCloseTo(5, 9);
        expect(res.plan.undetermined).toEqual([]);
    });

    it('⛔ a neighbour that cannot adapt is UNDETERMINED with a typed reason, and the primary still plans', () => {
        // Push A's face +3.999: A grows to x = 7.999; B would shrink to 8 - 7.999 ≈ 1 mm wide
        // — B's planner still accepts that (area 6 mm²), so instead push through B entirely.
        const res = planSpaceEnvelopeFaceMoveInContext({
            subject: A, face: { kind: 'side', edgeIndex: 1 }, deltaM: 5, world: [L, A, B],
        });
        expect('plan' in res).toBe(true);
        if (!('plan' in res)) return;
        expect(res.plan.adapted).toEqual([]);
        expect(res.plan.undetermined).toHaveLength(1);
        expect(res.plan.undetermined[0]!.envelopeId).toBe('B');
        expect(res.plan.undetermined[0]!.reason).toBe('GEOMETRY_UNPREDICTABLE');
    });

    it('a room on ANOTHER storey sharing the face is UNSUPPORTED_ELEMENT_TYPE, not adapted', () => {
        const upstairs: SpaceEnvelopeContextEntry = { ...B, levelId: 'L1', withinId: null };
        const res = planSpaceEnvelopeFaceMoveInContext({
            subject: A, face: { kind: 'side', edgeIndex: 1 }, deltaM: 1, world: [L, A, upstairs],
        });
        expect('plan' in res).toBe(true);
        if (!('plan' in res)) return;
        expect(res.plan.adapted).toEqual([]);
        expect(res.plan.undetermined.map((u) => u.reason)).toEqual(['UNSUPPORTED_ELEMENT_TYPE']);
    });

    it('a neighbour whose adaptation would leave ITS level is RELATIONSHIP_NOT_RECORDED', () => {
        // B is declared within a tiny level that ends at x = 8 exactly; pulling A's face back
        // (-1) would grow B to x = 3..8, still inside; pushing (+1) shrinks B — fine. Instead
        // give B a level that ends at x = 7 so B is ALREADY at its bound on the far side, then
        // move A's face -1: B grows to x = 3, outside the small level's x ≥ 4 bound.
        const small = level('Small', 4, 0, 3, 6);
        const Bsmall = room('B', 'Small', 4, 0, 3, 6);
        const res = planSpaceEnvelopeFaceMoveInContext({
            subject: A, face: { kind: 'side', edgeIndex: 1 }, deltaM: -1, world: [L, small, A, Bsmall],
        });
        expect('plan' in res).toBe(true);
        if (!('plan' in res)) return;
        expect(res.plan.adapted).toEqual([]);
        // The small LEVEL also shares that face (its x = 4 side faces A's), and a level
        // is reported UNSUPPORTED rather than silently skipped — both reasons, typed.
        expect(res.plan.undetermined.map((u) => `${u.envelopeId}:${u.reason}`).sort()).toEqual([
            'B:RELATIONSHIP_NOT_RECORDED',
            'Small:UNSUPPORTED_ELEMENT_TYPE',
        ]);
    });

    it('adaptNeighbours: false previews the subject alone', () => {
        const res = planSpaceEnvelopeFaceMoveInContext({
            subject: A, face: { kind: 'side', edgeIndex: 1 }, deltaM: 1, world: [L, A, B], adaptNeighbours: false,
        });
        expect('plan' in res && res.plan.adapted.length === 0).toBe(true);
    });
});
