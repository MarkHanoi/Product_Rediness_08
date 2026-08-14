// PV-08 — the exhaustive, type-checked L0 `member → ValueOrigin` map, and the
// `floor` kind that C75 §5 says must be decided rather than omitted.
//
// ─── WHAT THE TYPE SYSTEM ALREADY PROVES, AND WHY THESE ARMS STILL EXIST ─────
// Each map is annotated `{ readonly [K in <Members>]: ValueProvenance }`, so a
// missing row and a row for a non-member are both compile errors. That is the
// strongest rung available (C75 §2.8) and it is where the guarantee lives.
//
// These arms cover the three things the annotation CANNOT reach:
//
//  1. **The runtime shape.** A `Record<string, …>` cast, an `as`, or a member
//     added to the enum but not to the union type would all compile. The
//     enum's own `.options` is the independent witness — the maps are compared
//     against it, not against a hand-listed copy.
//  2. **The VALUES, not the keys.** The mapped type says each row is a
//     `ValueProvenance`; it does not say each row PARSES. `inferred` requires
//     `detail` and `regenerated` requires `replaced`, both by cross-field
//     refinement — a row that skipped them would type-check and then fail at the
//     first real parse.
//  3. **The judgements.** That `auto-topology` is `computed` and `repaired-ring`
//     is `inferred` is the entire subject of C75 §1.2, and no type can hold it.
//     Pinned by name so the COMPUTED/INFERRED merge is a failing test, not a
//     review comment.

import { describe, it, expect } from 'vitest';
import {
    RoomDetectionMethodSchema,
    FinishBoundaryDetectionMethodSchema,
    FloorDetectionMethodSchema,
    CeilingDetectionMethodSchema,
    ROOM_DETECTION_ORIGIN,
    FINISH_BOUNDARY_DETECTION_ORIGIN,
    FLOOR_DETECTION_ORIGIN,
    CEILING_DETECTION_ORIGIN,
    classifyRoomDetectionMethod,
    classifyFinishBoundaryDetectionMethod,
    detectionMethodOriginRows,
    ASSERT_SAME_MEMBERS_CONTROL,
    type AssertSameMembers,
} from '../src/provenance/DetectionMethodOrigin.js';
import {
    ValueProvenanceSchema,
    VALUE_ORIGINS,
} from '../src/provenance/ValueOrigin.js';
import { SCHEMA_REGISTRY } from '../src/registry.js';
import { Floor } from '../src/elements/Floor.js';

/** The member every vocabulary map deliberately does NOT carry (C75 §1.4). */
const ORIGIN_UNKNOWN = 'origin-unknown';

describe('PV-08 · C75 §1.2 — the room vocabulary is mapped EXHAUSTIVELY', () => {
    it('every DETERMINATION has a row, measured against the enum itself', () => {
        const determinations = RoomDetectionMethodSchema.options.filter((m) => m !== ORIGIN_UNKNOWN);
        expect([...Object.keys(ROOM_DETECTION_ORIGIN)].sort()).toEqual([...determinations].sort());
    });

    it('`origin-unknown` is NOT a row — it is a value with a reason, not an origin', () => {
        // A row for it would have had to invent an origin for "we do not know",
        // which is the defect C75 §1.4 exists to refuse. The key type excludes it;
        // this is the runtime witness that no cast put it back.
        expect(Object.keys(ROOM_DETECTION_ORIGIN)).not.toContain(ORIGIN_UNKNOWN);
    });

    it('every row PARSES as a ValueProvenance — the refinements are not bypassed', () => {
        for (const [member, provenance] of Object.entries(ROOM_DETECTION_ORIGIN)) {
            const r = ValueProvenanceSchema.safeParse(provenance);
            expect(r.success, `row '${member}' does not parse: ${JSON.stringify(provenance)}`).toBe(true);
        }
    });

    it('every row states one of the five — no row is an unknown wearing a member', () => {
        for (const [member, p] of Object.entries(ROOM_DETECTION_ORIGIN)) {
            expect(VALUE_ORIGINS, `row '${member}'`).toContain(p.origin);
            expect(p.unknownReason).toBeUndefined();
        }
    });
});

describe('PV-08 — the floor / ceiling vocabulary is ONE list, mapped exhaustively', () => {
    it('every member has a row', () => {
        expect([...Object.keys(FINISH_BOUNDARY_DETECTION_ORIGIN)].sort()).toEqual(
            [...FinishBoundaryDetectionMethodSchema.options].sort(),
        );
    });

    it('floor and ceiling share the SAME schema object and the SAME map', () => {
        // Structural identity, not a comment claiming equality: two `z.enum`
        // declarations would be two rival lists inside the file that exists to
        // unify them, and they could drift apart in a later edit.
        expect(FloorDetectionMethodSchema).toBe(FinishBoundaryDetectionMethodSchema);
        expect(CeilingDetectionMethodSchema).toBe(FinishBoundaryDetectionMethodSchema);
        expect(FLOOR_DETECTION_ORIGIN).toBe(FINISH_BOUNDARY_DETECTION_ORIGIN);
        expect(CEILING_DETECTION_ORIGIN).toBe(FINISH_BOUNDARY_DETECTION_ORIGIN);
    });

    it('every row PARSES as a ValueProvenance', () => {
        for (const [member, provenance] of Object.entries(FINISH_BOUNDARY_DETECTION_ORIGIN)) {
            const r = ValueProvenanceSchema.safeParse(provenance);
            expect(r.success, `row '${member}' does not parse: ${JSON.stringify(provenance)}`).toBe(true);
        }
    });
});

describe('C75 §1.2 — COMPUTED and INFERRED are not merged, per row', () => {
    it('auto-topology is COMPUTED and repaired-ring is INFERRED', () => {
        // C75 §0 Finding 4 is exactly these two collapsing into one another: a
        // flood fill is ENTAILED by the wall graph; a repaired ring is a polygon
        // the topology never traced.
        expect(ROOM_DETECTION_ORIGIN['auto-topology'].origin).toBe('computed');
        expect(ROOM_DETECTION_ORIGIN['repaired-ring'].origin).toBe('inferred');
    });

    it('from-room / from-slab are COMPUTED and ai-generated is INFERRED', () => {
        expect(FINISH_BOUNDARY_DETECTION_ORIGIN['from-room'].origin).toBe('computed');
        expect(FINISH_BOUNDARY_DETECTION_ORIGIN['from-slab'].origin).toBe('computed');
        expect(FINISH_BOUNDARY_DETECTION_ORIGIN['ai-generated'].origin).toBe('inferred');
    });

    it('every INFERRED row states what it inferred from (§2.3)', () => {
        for (const p of detectionMethodOriginRows()) {
            if (p.origin === 'inferred') expect(p.detail, `row '${p.member}'`).toBeTruthy();
        }
    });

    it('imports are OBSERVED — received, not computed', () => {
        expect(ROOM_DETECTION_ORIGIN['ifc-import'].origin).toBe('observed');
        expect(FINISH_BOUNDARY_DETECTION_ORIGIN['ifc-import'].origin).toBe('observed');
    });
});

describe('C75 §2.2 — AUTHORED is minted by exactly the rows that mean a human acted', () => {
    it('the authored surface is exactly three rows, named', () => {
        // Pinned so widening it is a deliberate edit to this list rather than a
        // quiet extra row: `authored` is the one origin the system may never
        // invent, and every row carrying it is a standing claim that a user acted.
        const authored = detectionMethodOriginRows()
            .filter((r) => r.origin === 'authored')
            .map((r) => `${r.vocabulary}:${r.member}`)
            .sort();
        expect(authored).toEqual([
            'Floor/CeilingDetectionMethod:manual-polygon',
            'RoomDetectionMethod:manual-boundary',
            'RoomDetectionMethod:point-pick',
        ]);
    });
});

describe('C75 §1.4 / §2.1 — the classifiers never upgrade an unknown to a member', () => {
    const notAMember = [undefined, null, '', 42, {}, 'auto-topolgy', 'AUTO-TOPOLOGY'];

    it.each(notAMember.map((v) => [JSON.stringify(v) ?? String(v), v] as const))(
        'room: %s resolves to UNKNOWN-with-reason, never to one of the five',
        (_label, value) => {
            const p = classifyRoomDetectionMethod(value);
            expect(p.origin).toBeNull();
            expect(VALUE_ORIGINS).not.toContain(p.origin);
            expect(p.unknownReason).toBeTruthy();
        },
    );

    it.each(notAMember.map((v) => [JSON.stringify(v) ?? String(v), v] as const))(
        'floor/ceiling: %s resolves to UNKNOWN-with-reason, never to one of the five',
        (_label, value) => {
            const p = classifyFinishBoundaryDetectionMethod(value);
            expect(p.origin).toBeNull();
            expect(VALUE_ORIGINS).not.toContain(p.origin);
            expect(p.unknownReason).toBeTruthy();
        },
    );

    it('an ABSENCE and a DRIFT are different answers', () => {
        // The whole §CONTEXT-DATA-HONESTY rule at provenance grain: a field that
        // was never written is `not-recorded`; a field carrying a value this
        // translation cannot account for is a POSITIVE finding about vocabulary
        // drift — PV-08's own subject — and collapsing the two throws away the one
        // fact actually established.
        expect(classifyRoomDetectionMethod(undefined).unknownReason).toBe('not-recorded');
        expect(classifyRoomDetectionMethod('a-member-that-never-existed').unknownReason).toBe(
            'conflicting-records',
        );
    });

    it("a room STATING `origin-unknown` stays unknown — it is carried, not translated", () => {
        const p = classifyRoomDetectionMethod(ORIGIN_UNKNOWN);
        expect(p.origin).toBeNull();
        expect(p.unknownReason).toBe('not-recorded');
    });

    it.each(RoomDetectionMethodSchema.options.filter((m) => m !== ORIGIN_UNKNOWN))(
        'room determination %s round-trips through the classifier to its mapped row',
        (member) => {
            expect(classifyRoomDetectionMethod(member)).toBe(
                ROOM_DETECTION_ORIGIN[member as keyof typeof ROOM_DETECTION_ORIGIN],
            );
        },
    );

    it.each(FinishBoundaryDetectionMethodSchema.options)(
        'finish determination %s round-trips through the classifier to its mapped row',
        (member) => {
            expect(classifyFinishBoundaryDetectionMethod(member)).toBe(
                FINISH_BOUNDARY_DETECTION_ORIGIN[member],
            );
        },
    );
});

describe('AssertSameMembers — the one-line drift guard upstream installs', () => {
    it('accepts an identical member set spelled in a different order', () => {
        const same: AssertSameMembers<'a' | 'b', 'b' | 'a'> = true;
        expect(same).toBe(true);
    });

    it('its REFUSAL is proven by tsc, not here — and that is stated, not assumed', () => {
        // ⚠ `AssertSameMembers` is pure type-level machinery: at runtime there is
        // nothing to observe, so a test cannot watch it refuse. Its negative
        // control is `ASSERT_SAME_MEMBERS_CONTROL` in
        // `src/provenance/DetectionMethodOrigin.ts`, where two `@ts-expect-error`
        // directives go RED under `tsc` the moment the helper stops catching
        // drift in either direction. It sits in `src/` because that is compiled
        // by BOTH of this package's configurations — including `tsconfig.json`,
        // the one the build depends on; `__tests__` is compiled only by
        // `tsconfig.tests.json`, which is RED at HEAD on unrelated pre-existing
        // errors and would have buried a regression in noise.
        expect(ASSERT_SAME_MEMBERS_CONTROL).toHaveLength(3);
        expect(ASSERT_SAME_MEMBERS_CONTROL.every((v) => v === true)).toBe(true);
    });
});

describe("C75 §5 — `floor` is IN scope at L0, decided rather than omitted", () => {
    it('the kind exists in the registry alongside its twin `ceiling`', () => {
        expect(Object.keys(SCHEMA_REGISTRY)).toContain('floor');
        expect(Object.keys(SCHEMA_REGISTRY)).toContain('ceiling');
    });

    it('Floor.parse({}) yields a floor-branded id and the discriminator', () => {
        const f = Floor.parse({});
        expect(f.type).toBe('floor');
        expect(f.id).toMatch(/^floor_[0-9A-HJKMNP-TV-Z]{26}$/);
    });

    it('a floor defaults to UNKNOWN-with-reason provenance, never to one of the five', () => {
        const f = Floor.parse({}) as unknown as {
            provenance: { origin: unknown; unknownReason?: unknown };
        };
        expect(f.provenance.origin).toBeNull();
        expect(f.provenance.unknownReason).toBe('predates-provenance');
        expect(VALUE_ORIGINS).not.toContain(f.provenance.origin);
    });

    it('the geometry mirrors a ceiling: FFL on top, body downward', () => {
        const f = Floor.parse({});
        expect(f.boundary.length).toBeGreaterThanOrEqual(3);
        expect(f.thickness).toBeGreaterThan(0);
        expect(f.baseOffset).toBeGreaterThanOrEqual(0);
    });
});
