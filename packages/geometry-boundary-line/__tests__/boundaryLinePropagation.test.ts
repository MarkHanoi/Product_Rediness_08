// §FEAT-CONSTRUCTION-BOUNDARY-LINE — the propagation PLANNER, at the layer that
// decides. L-7904..L-7907 · C105 §3 · C84 §EI-PROP · ADR-0348.
//
// ⭐ WHAT THIS FILE PINS, AND WHAT IT DELIBERATELY DOES NOT.
//
// It pins the ANSWER: given a line that moved and the things attached to it, which
// of them go, where exactly, and — the half the founder's ask turns on — which ones
// do NOT and what the user is told about each. Nothing here proves a store was
// written; that is `moveBoundaryLineCascade.test.ts`'s job, and it asserts against a
// re-read rather than a return value ([[committed-is-not-reachable]]).
//
// The planner is PURE, so every case below runs exactly the code production runs. A
// planner that needed a store could only be tested through a fake, and a fake built
// from the same header cannot falsify the header ([[fake-more-capable-than-real]]).

import { describe, expect, it } from 'vitest';
import { BoundaryLine } from '@pryzm/schemas';
import {
    BOUNDARY_LINE_FAMILY_RULES,
    anchorOnBoundaryLine,
    boundaryLineLength,
    boundaryLineSegments,
    boundaryLineSolid,
    planBoundaryLineMove,
    poseOnBoundaryLine,
    resolveBoundaryLineDimensions,
    resolveBoundaryLineMaterial,
    resolveBoundaryLineSolidity,
    summariseBoundaryLineRefusals,
    type BoundaryLineData,
} from '../src/index';

const ID = 'boundaryLine_01ARZ3NDEKTSV4RRFFQ69G5H00';

/** A 10 m line along +X at the origin, with whatever attachments a case needs. */
function line(over: Partial<BoundaryLineData> = {}): BoundaryLineData {
    return BoundaryLine.parse({
        id: ID,
        levelId: 'level-1',
        vertices: [
            { x: 0, y: 0, z: 0 },
            { x: 10, y: 0, z: 0 },
        ],
        ...over,
    }) as BoundaryLineData;
}

const wallAtt = {
    elementId: 'wall_01ARZ3NDEKTSV4RRFFQ69G5H01',
    elementKind: 'wall',
    segmentIndex: 0,
    t: 0,
    offset: 0,
    end: { segmentIndex: 0, t: 1, offset: 0 },
};

describe('§FEAT-CONSTRUCTION-BOUNDARY-LINE — geometry', () => {
    it('G-1: segments, length and pose are all FUNCTIONS of the vertices — nothing is stored', () => {
        const l = line();
        expect(boundaryLineSegments(l)).toHaveLength(1);
        expect(boundaryLineLength(l)).toBeCloseTo(10, 10);
        // Mid-point of the only segment, with no offset.
        expect(poseOnBoundaryLine(l, { segmentIndex: 0, t: 0.5, offset: 0 })).toEqual({
            x: 5,
            y: 0,
            z: 0,
        });
    });

    it('G-2: a CLOSED line has one more segment than an open one with the same vertices', () => {
        const verts = [
            { x: 0, y: 0, z: 0 },
            { x: 10, y: 0, z: 0 },
            { x: 10, y: 0, z: 6 },
        ];
        expect(boundaryLineSegments(line({ vertices: verts }))).toHaveLength(2);
        expect(boundaryLineSegments(line({ vertices: verts, closed: true }))).toHaveLength(3);
    });

    it('G-3: ⭐ the anchor round-trips, AND THE SIDE SURVIVES — a signed offset, not a distance', () => {
        const l = line();
        // 1.5 m on the +Z side of a +X line. The LEFT normal of (+1,0) is (0,-1), so a
        // point at +Z sits at a NEGATIVE offset. The exact sign matters far less than
        // that it round-trips: an unsigned distance would mirror every inset wall to
        // the outside on the first move, which is the defect this case exists to catch.
        const p = { x: 4, z: 1.5 };
        const a = anchorOnBoundaryLine(l, p)!;
        expect(a.segmentIndex).toBe(0);
        expect(a.t).toBeCloseTo(0.4, 10);
        const back = poseOnBoundaryLine(l, a)!;
        expect(back.x).toBeCloseTo(p.x, 9);
        expect(back.z).toBeCloseTo(p.z, 9);
        // …and the sign is not zero, i.e. the offset really was carried.
        expect(Math.abs(a.offset)).toBeCloseTo(1.5, 9);
    });

    it('G-4: a point beyond the end CLAMPS to the end rather than extrapolating', () => {
        // An unclamped projection would let a dependent fly off the end of a shortened
        // line; clamping makes it ride the new corner, which is what an architect means
        // by "it stayed on the boundary".
        const a = anchorOnBoundaryLine(line(), { x: 40, z: 0 })!;
        expect(a.t).toBe(1);
    });

    it('G-5: ⭐ DEFENCE IN DEPTH — L0 REFUSES a degenerate line, and the geometry layer refuses it too', () => {
        // ARM 1 — the schema refuses it, so the record can never HOLD one. Measured:
        // this throws, and the message is the non-degeneracy refine's own.
        expect(() =>
            BoundaryLine.parse({
                id: ID,
                levelId: 'level-1',
                vertices: [
                    { x: 0, y: 0, z: 0 },
                    { x: 0, y: 0, z: 0.0000001 },
                ],
            }),
        ).toThrow(/1 mm or longer/);

        // ARM 2 — and the geometry layer refuses INDEPENDENTLY, on a record built by
        // hand. This arm is not redundant: a record can reach the propagator from a
        // legacy snapshot, an in-flight edit, or a caller that skipped `parse()`, and
        // the layer that would otherwise misplace an element silently must say no on
        // its own authority rather than on the schema's.
        const hand = {
            ...(line() as unknown as Record<string, unknown>),
            vertices: [
                { x: 0, y: 0, z: 0 },
                { x: 0, y: 0, z: 0.0000001 },
            ],
        } as unknown as BoundaryLineData;
        expect(poseOnBoundaryLine(hand, { segmentIndex: 0, t: 0.5, offset: 0 })).toBeNull();
        expect(anchorOnBoundaryLine(hand, { x: 1, z: 1 })).toBeNull();
    });
});

describe('§FEAT-CONSTRUCTION-BOUNDARY-LINE — volume', () => {
    it('V-1: hasVolume false ⇒ NO slices, and that is an intent, not a failure', () => {
        expect(boundaryLineSolid(line(), { height: 3, thickness: 0.2, baseOffset: 0 })).toEqual([]);
    });

    it('V-2: hasVolume true ⇒ one prism per segment, thickness CENTRED on the line', () => {
        const slices = boundaryLineSolid(
            line({ hasVolume: true }),
            { height: 3, thickness: 0.4, baseOffset: 0 },
            0,
        );
        expect(slices).toHaveLength(1);
        expect(slices[0]!.footprint).toHaveLength(4);
        expect(slices[0]!.topY - slices[0]!.baseY).toBeCloseTo(3, 10);
        // Centred: the two sides sit ±0.2 m off the centreline, so the extreme Z
        // values are symmetric about it. A one-sided extrusion would put both on one
        // side and silently shift the massing by half a thickness.
        const zs = slices[0]!.footprint.map((p) => p.z).sort((a, b) => a - b);
        expect(zs[0]).toBeCloseTo(-0.2, 10);
        expect(zs[3]).toBeCloseTo(0.2, 10);
    });

    it('V-3: the solid rides the level elevation and the base offset', () => {
        const s = boundaryLineSolid(line({ hasVolume: true }), { height: 3, thickness: 0.2, baseOffset: 0.15 }, 6)[0]!;
        expect(s.baseY).toBeCloseTo(6.15, 10);
        expect(s.topY).toBeCloseTo(9.15, 10);
    });

    it('V-4: ⭐ the INTENT bool beats the record, and `false` is an opinion — not silence', () => {
        expect(resolveBoundaryLineSolidity({ hasVolume: false }, true)).toEqual({ solid: true, source: 'intent' });
        // The case a `||` would break: the view says linework, the record says volume.
        expect(resolveBoundaryLineSolidity({ hasVolume: true }, false)).toEqual({ solid: false, source: 'intent' });
        // No opinion ⇒ the record answers.
        expect(resolveBoundaryLineSolidity({ hasVolume: true }, undefined)).toEqual({ solid: true, source: 'record' });
    });
});

describe('§FEAT-CONSTRUCTION-BOUNDARY-LINE — dimensions and material (L-127 / C100)', () => {
    it('D-1: record beats systemType beats default, and the SOURCE is reported per field', () => {
        const r = resolveBoundaryLineDimensions(
            { height: 4.2, thickness: undefined, baseOffset: undefined, systemTypeId: 't' },
            { id: 't', name: 'T', thickness: 0.35 },
        );
        expect(r.height).toBe(4.2);
        expect(r.source.height).toBe('record');
        expect(r.thickness).toBe(0.35);
        expect(r.source.thickness).toBe('systemType');
        expect(r.source.baseOffset).toBe('default');
    });

    it('M-1: LINEWORK legitimately has no material — and that is NOT reported as a failure', () => {
        expect(resolveBoundaryLineMaterial({ hasVolume: false })).toEqual({ kind: 'linework' });
    });

    it('M-2: ⭐ a SOLID with no material is UNRESOLVED, with a reason — the handrail defect, not repeated', () => {
        const m = resolveBoundaryLineMaterial({ hasVolume: true });
        expect(m.kind).toBe('unresolved');
        // The sentence must tell the user BOTH routes back (C16 CA-18).
        expect(m.kind === 'unresolved' && m.reason).toMatch(/C100/);
        expect(m.kind === 'unresolved' && m.reason).toMatch(/switch volume off/i);
    });

    it('M-3: a solid that names a material resolves, and says which tier answered', () => {
        expect(resolveBoundaryLineMaterial({ hasVolume: true, materialId: 'mat-concrete' })).toEqual({
            kind: 'resolved',
            materialId: 'mat-concrete',
            materialColor: undefined,
            source: 'record',
        });
    });
});

describe('§FEAT-CONSTRUCTION-BOUNDARY-LINE — the per-family table (C105 §3.3)', () => {
    it('T-1: EVERY row is complete — a PROPAGATES row has a verb and a shape, a REFUSES row has a reason', () => {
        for (const r of BOUNDARY_LINE_FAMILY_RULES) {
            if (r.verdict === 'PROPAGATES') {
                expect(r.moveVerb, `${r.family} must name the bus verb that carries it`).toBeTruthy();
                expect(r.shape, `${r.family} must declare its shape`).toBeTruthy();
            } else {
                // ⛔ C84 EI-PROP-a: a refusal without a reason is a silence with a label
                // on it. This assertion is what makes the table's promise mechanical.
                expect(r.reason, `${r.family} REFUSES and must say why`).toBeTruthy();
                expect((r.reason ?? '').length, `${r.family}'s reason must be a sentence`).toBeGreaterThan(40);
            }
        }
    });

    it('T-2: ⛔ NO ROW IS `SILENT` — that is the EI-PROP-b target state, asserted', () => {
        expect(BOUNDARY_LINE_FAMILY_RULES.filter((r) => r.verdict === 'SILENT')).toEqual([]);
    });

    it('T-3: no family appears twice — one answer per question (C84 EI-9)', () => {
        const names = BOUNDARY_LINE_FAMILY_RULES.map((r) => r.family);
        expect(new Set(names).size).toBe(names.length);
    });
});

describe('§FEAT-CONSTRUCTION-BOUNDARY-LINE — the move plan', () => {
    it('P-1: ⭐ A WALL ATTACHED TO THE LINE FOLLOWS IT — the founder`s sentence, as a span', () => {
        const prev = line({ attachments: [wallAtt] });
        const next = line({ attachments: [wallAtt], vertices: [
            { x: 0, y: 0, z: 4 },
            { x: 10, y: 0, z: 4 },
        ] });
        const plan = planBoundaryLineMove(prev, next);
        expect(plan.adapt).toHaveLength(1);
        expect(plan.adapt[0]!.moveVerb).toBe('wall.updateBaseline');
        expect(plan.adapt[0]!.span!.start).toEqual({ x: 0, y: 0, z: 4 });
        expect(plan.adapt[0]!.span!.end).toEqual({ x: 10, y: 0, z: 4 });
    });

    it('P-2: an INSET wall stays inset — the offset is carried, not flattened onto the line', () => {
        const inset = { ...wallAtt, offset: 0.15, end: { segmentIndex: 0, t: 1, offset: 0.15 } };
        const prev = line({ attachments: [inset] });
        const next = line({ attachments: [inset], vertices: [
            { x: 0, y: 0, z: 4 },
            { x: 10, y: 0, z: 4 },
        ] });
        const s = planBoundaryLineMove(prev, next).adapt[0]!.span!;
        // The offset survives the move: the wall is still 0.15 m off the new line, on
        // the same side. This is the assertion a naive "snap everything to the line"
        // implementation fails.
        expect(Math.abs(s.start.z - 4)).toBeCloseTo(0.15, 9);
        expect(Math.abs(s.end.z - 4)).toBeCloseTo(0.15, 9);
    });

    it('P-3: an AREA dependent is TRANSLATED by its anchor`s displacement — never re-shaped', () => {
        const slab = { elementId: 'slab_01ARZ3NDEKTSV4RRFFQ69G5H02', elementKind: 'slab', segmentIndex: 0, t: 0.5, offset: 2 };
        const prev = line({ attachments: [slab] });
        const next = line({ attachments: [slab], vertices: [
            { x: 3, y: 0, z: 0 },
            { x: 13, y: 0, z: 0 },
        ] });
        const a = planBoundaryLineMove(prev, next).adapt[0]!;
        expect(a.shape).toBe('area');
        expect(a.moveVerb).toBe('slab.movePolygon');
        expect(a.delta!.dx).toBeCloseTo(3, 9);
        expect(a.delta!.dz).toBeCloseTo(0, 9);
        // ⛔ And NO span/vertex list — an authored slab outline is not re-projected
        // onto the line. C81: an edit must not change something the user did not point at.
        expect(a.span).toBeUndefined();
    });

    it('P-4: ⭐ A DOOR REFUSES **BY NAME**, and the reason names the route back to success', () => {
        const door = { elementId: 'door_01ARZ3NDEKTSV4RRFFQ69G5H03', elementKind: 'door', segmentIndex: 0, t: 0.5, offset: 0 };
        const prev = line({ attachments: [door] });
        const plan = planBoundaryLineMove(prev, line({ attachments: [door], vertices: [
            { x: 0, y: 0, z: 4 }, { x: 10, y: 0, z: 4 },
        ] }));
        expect(plan.adapt).toEqual([]);
        expect(plan.refused).toHaveLength(1);
        expect(plan.refused[0]!.reason).toMatch(/hosted/i);
        expect(plan.refused[0]!.reason).toMatch(/Attach the WALL/);
    });

    it('P-5: ⛔ NOTHING IS DROPPED — every attachment lands in exactly one bucket', () => {
        const atts = [
            wallAtt,
            { elementId: 'door_01ARZ3NDEKTSV4RRFFQ69G5H03', elementKind: 'door', segmentIndex: 0, t: 0.5, offset: 0 },
            { elementId: 'x_01ARZ3NDEKTSV4RRFFQ69G5H04', elementKind: 'sprocket', segmentIndex: 0, t: 0.5, offset: 0 },
        ];
        const prev = line({ attachments: atts });
        const plan = planBoundaryLineMove(prev, line({ attachments: atts, vertices: [
            { x: 0, y: 0, z: 4 }, { x: 10, y: 0, z: 4 },
        ] }));
        // THE INVARIANT THIS WHOLE FILE EXISTS FOR. A partial cascade that does not
        // say what it skipped is worse than none.
        expect(plan.attempted).toBe(3);
        expect(
            plan.adapt.length + plan.refused.length + plan.unresolved.length + plan.unclassified.length,
        ).toBe(plan.attempted);
    });

    it('P-6: ⭐ AN UNKNOWN FAMILY IS `unclassified`, NOT SILENTLY SKIPPED', () => {
        const odd = { elementId: 'x_01ARZ3NDEKTSV4RRFFQ69G5H04', elementKind: 'sprocket', segmentIndex: 0, t: 0.5, offset: 0 };
        const prev = line({ attachments: [odd] });
        const plan = planBoundaryLineMove(prev, line({ attachments: [odd], vertices: [
            { x: 0, y: 0, z: 4 }, { x: 10, y: 0, z: 4 },
        ] }));
        expect(plan.unclassified).toHaveLength(1);
        // It must read to a DEVELOPER as a missing row (C84 EI-PROP-a), not merely to
        // a user as "no".
        expect(plan.unclassified[0]!.reason).toMatch(/EI-PROP-a/);
        expect(plan.unclassified[0]!.reason).toMatch(/UNDECIDED/);
    });

    it('P-7: a LINE dependent with only a start anchor is UNRESOLVED, with the fix stated', () => {
        const half = { ...wallAtt, end: undefined };
        const prev = line({ attachments: [half] });
        const plan = planBoundaryLineMove(prev, line({ attachments: [half], vertices: [
            { x: 0, y: 0, z: 4 }, { x: 10, y: 0, z: 4 },
        ] }));
        expect(plan.unresolved).toHaveLength(1);
        expect(plan.unresolved[0]!.reason).toMatch(/both ends/);
    });

    it('S-1: the summary NAMES every family that did not move, and is null when all did', () => {
        const prev = line({ attachments: [wallAtt] });
        const allMoved = planBoundaryLineMove(prev, line({ attachments: [wallAtt], vertices: [
            { x: 0, y: 0, z: 4 }, { x: 10, y: 0, z: 4 },
        ] }));
        expect(summariseBoundaryLineRefusals(allMoved)).toBeNull();

        const door = { elementId: 'door_01ARZ3NDEKTSV4RRFFQ69G5H03', elementKind: 'door', segmentIndex: 0, t: 0.5, offset: 0 };
        const mixed = planBoundaryLineMove(
            line({ attachments: [wallAtt, door] }),
            line({ attachments: [wallAtt, door], vertices: [{ x: 0, y: 0, z: 4 }, { x: 10, y: 0, z: 4 }] }),
        );
        const s = summariseBoundaryLineRefusals(mixed)!;
        expect(s).toMatch(/did NOT move/);
        expect(s).toMatch(/1 door/);
    });
});
