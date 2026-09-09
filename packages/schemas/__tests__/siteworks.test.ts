// Siteworks — L0 schema invariants. C116 · ADR-0384.
//
// ⛔ EVERY ARM HERE BINDS TO A `.refine()` OR A CITED CONSTANT. C84 §8.d records
// that "a comment as the synchronisation mechanism" has failed twice in this repo,
// so each invariant the schema claims is asserted by CONSTRUCTING THE VIOLATION and
// requiring a refusal — never by reading the comment that promises it.
//
// The scramble control for this file is recorded in the lane's commit message:
// each refine was deleted in turn and the arm below it was confirmed to go RED.

import { describe, it, expect } from 'vitest';
import {
    Siteworks,
    SITEWORKS_ROLES,
    SITEWORKS_FORMS,
    SITEWORKS_ROLE_EXPLANATIONS,
    SITEWORKS_FORM_EXPLANATIONS,
    SITEWORKS_DEFAULT_WIDTH_M,
    SITEWORKS_DEFAULT_THICKNESS_M,
} from '../src/elements/Siteworks.js';
import { SCHEMA_REGISTRY } from '../src/registry.js';

const P = (x: number, z: number) => ({ x, y: 0, z });

/** A minimal VALID linear surface, so every failure arm differs by exactly one thing. */
const linear = () => ({
    form: 'linear' as const,
    centreline: [P(0, 0), P(10, 0)],
    boundary: [],
    holes: [],
});

/** A minimal VALID areal surface. */
const areal = () => ({
    form: 'areal' as const,
    centreline: [],
    boundary: [P(0, 0), P(10, 0), P(10, 10)],
    holes: [],
});

describe('Siteworks — identity and registration', () => {
    it('is registered in SCHEMA_REGISTRY under the kind `siteworks`', () => {
        expect(SCHEMA_REGISTRY.siteworks).toBe(Siteworks);
    });

    it('stamps the discriminator and mints a `siteworks_<ulid>` id', () => {
        const s = Siteworks.parse({});
        expect(s.type).toBe('siteworks');
        expect(s.id).toMatch(/^siteworks_[0-9A-HJKMNP-TV-Z]{26}$/);
    });

    it('parses empty and defaults to a valid LINEAR road', () => {
        const s = Siteworks.parse({});
        expect(s.role).toBe('road');
        expect(s.form).toBe('linear');
        expect(s.centreline.length).toBeGreaterThanOrEqual(2);
        expect(s.boundary).toEqual([]);
    });

    it('carries provenance and confidence — C75, and the arm check-provenance-coverage reads', () => {
        const s = Siteworks.parse({});
        expect(s.provenance).toBeDefined();
        expect(s.confidence).toBeDefined();
    });
});

describe('Siteworks — ONE KIND, THREE ROLES (ADR-0384 D1)', () => {
    it('has exactly the three roles the founder named, and no more', () => {
        expect([...SITEWORKS_ROLES]).toEqual(['road', 'parking', 'pedestrian']);
    });

    it('⭐ every role carries an explanation — a role cannot exist without one', () => {
        for (const r of SITEWORKS_ROLES) {
            expect(SITEWORKS_ROLE_EXPLANATIONS[r].length).toBeGreaterThan(20);
        }
        expect(Object.keys(SITEWORKS_ROLE_EXPLANATIONS).sort())
            .toEqual([...SITEWORKS_ROLES].sort());
    });

    it('every form carries an explanation, and there are exactly two', () => {
        expect([...SITEWORKS_FORMS]).toEqual(['linear', 'areal']);
        expect(Object.keys(SITEWORKS_FORM_EXPLANATIONS).sort())
            .toEqual([...SITEWORKS_FORMS].sort());
    });

    it('⭐ form is ORTHOGONAL to role — all SIX combinations are legal', () => {
        for (const role of SITEWORKS_ROLES) {
            expect(Siteworks.safeParse({ ...linear(), role }).success).toBe(true);
            expect(Siteworks.safeParse({ ...areal(), role }).success).toBe(true);
        }
    });

    it('refuses a role outside the closed union', () => {
        expect(Siteworks.safeParse({ ...linear(), role: 'runway' }).success).toBe(false);
    });
});

describe('Siteworks — THE CITED DEFAULTS (ADR-0384 D6, C116 §9d)', () => {
    it('road is 7.00 m and cites Norma 3.1-IC by its BOE number', () => {
        const d = SITEWORKS_DEFAULT_WIDTH_M.road;
        expect(d.valueM).toBe(7.0);
        expect(d.standing).toBe('standard');
        expect(d.instrument).toContain('BOE-A-2016-2217');
        expect(d.instrument).toContain('3,50');
    });

    it('⭐ the road note records that the ARCENES are excluded — the ~29 % silent inflation', () => {
        expect(SITEWORKS_DEFAULT_WIDTH_M.road.note.toLowerCase()).toContain('arcenes');
    });

    it('pedestrian is 1.80 m and cites Orden VIV/561/2010', () => {
        const d = SITEWORKS_DEFAULT_WIDTH_M.pedestrian;
        expect(d.valueM).toBe(1.8);
        expect(d.standing).toBe('standard');
        expect(d.instrument).toContain('VIV/561/2010');
    });

    it('⛔ parking ships as an ADMITTED CONVENTION, never as a standard', () => {
        const d = SITEWORKS_DEFAULT_WIDTH_M.parking;
        expect(d.valueM).toBe(5.0);
        expect(d.standing).toBe('convention');
        expect(d.instrument).toBeNull();
    });

    it('⭐ §CONTEXT-DATA-HONESTY — a `convention` CANNOT omit why no instrument exists', () => {
        // The type makes this structural; this arm asserts the runtime data honours it,
        // so "we looked and found none" can never read the same as "we did not look".
        for (const d of [...Object.values(SITEWORKS_DEFAULT_WIDTH_M), SITEWORKS_DEFAULT_THICKNESS_M]) {
            if (d.standing === 'convention') {
                expect(d.instrument).toBeNull();
                expect(d.whyNoInstrument.length).toBeGreaterThan(40);
            } else {
                expect(typeof d.instrument).toBe('string');
                expect(d.instrument.length).toBeGreaterThan(20);
            }
        }
    });

    it('the thickness default is a convention that names 6.1-IC as the table it does NOT resolve', () => {
        expect(SITEWORKS_DEFAULT_THICKNESS_M.standing).toBe('convention');
        expect(SITEWORKS_DEFAULT_THICKNESS_M.whyNoInstrument).toContain('6.1-IC');
    });

    it('the schema seeds widthM and thickness FROM the cited records, not from literals', () => {
        const s = Siteworks.parse({});
        expect(s.widthM).toBe(SITEWORKS_DEFAULT_WIDTH_M.road.valueM);
        expect(s.thickness).toBe(SITEWORKS_DEFAULT_THICKNESS_M.valueM);
    });

    it('⛔ a default is NOT a constraint — a 3 m and a 40 m road both parse', () => {
        expect(Siteworks.safeParse({ ...linear(), widthM: 3 }).success).toBe(true);
        expect(Siteworks.safeParse({ ...linear(), widthM: 40 }).success).toBe(true);
    });
});

describe('Siteworks — THE GROUND PLANE IS ENFORCED, NOT DOCUMENTED (C84 EI-2.d)', () => {
    it('refuses a centreline vertex with y !== 0', () => {
        const r = Siteworks.safeParse({
            ...linear(),
            centreline: [P(0, 0), { x: 10, y: 2.5, z: 0 }],
        });
        expect(r.success).toBe(false);
    });

    it('refuses a boundary vertex with y !== 0', () => {
        const r = Siteworks.safeParse({
            ...areal(),
            boundary: [P(0, 0), P(10, 0), { x: 10, y: 1, z: 10 }],
        });
        expect(r.success).toBe(false);
    });

    it('refuses a HOLE vertex with y !== 0 — holes are checked, not just the outer ring', () => {
        const r = Siteworks.safeParse({
            ...areal(),
            holes: [[P(1, 1), P(2, 1), { x: 2, y: 9, z: 2 }]],
        });
        expect(r.success).toBe(false);
    });
});

describe('Siteworks — FORM DISCRIMINATES, AND THE WRONG-FORM FIELD IS REFUSED', () => {
    it('refuses a LINEAR surface with fewer than 2 centreline points', () => {
        expect(Siteworks.safeParse({ ...linear(), centreline: [P(0, 0)] }).success).toBe(false);
    });

    it('⛔ refuses a LINEAR surface that also carries a boundary — a stored ring is a cache', () => {
        const r = Siteworks.safeParse({
            ...linear(),
            boundary: [P(0, 0), P(1, 0), P(1, 1)],
        });
        expect(r.success).toBe(false);
    });

    it('refuses a LINEAR surface that carries holes', () => {
        const r = Siteworks.safeParse({ ...linear(), holes: [[P(1, 1), P(2, 1), P(2, 2)]] });
        expect(r.success).toBe(false);
    });

    it('refuses an AREAL surface with fewer than 3 boundary points', () => {
        expect(Siteworks.safeParse({ ...areal(), boundary: [P(0, 0), P(1, 0)] }).success)
            .toBe(false);
    });

    it('⛔ refuses an AREAL surface that also carries a centreline — two answers to "where"', () => {
        const r = Siteworks.safeParse({ ...areal(), centreline: [P(0, 0), P(5, 0)] });
        expect(r.success).toBe(false);
    });
});

describe('Siteworks — RINGS ARE OPEN (Slab convention, C116 §9c)', () => {
    it('refuses a boundary whose closing vertex is duplicated', () => {
        const r = Siteworks.safeParse({
            ...areal(),
            boundary: [P(0, 0), P(10, 0), P(10, 10), P(0, 0)],
        });
        expect(r.success).toBe(false);
    });

    it('refuses a HOLE whose closing vertex is duplicated', () => {
        const r = Siteworks.safeParse({
            ...areal(),
            holes: [[P(1, 1), P(2, 1), P(2, 2), P(1, 1)]],
        });
        expect(r.success).toBe(false);
    });

    it('accepts the same rings written OPEN', () => {
        expect(Siteworks.safeParse({
            ...areal(),
            boundary: [P(0, 0), P(10, 0), P(10, 10)],
            holes: [[P(1, 1), P(2, 1), P(2, 2)]],
        }).success).toBe(true);
    });
});

describe('Siteworks — the sweep cannot be handed an undefined direction', () => {
    it('⛔ refuses consecutive duplicate centreline points — a zero-length segment has no normal', () => {
        const r = Siteworks.safeParse({
            ...linear(),
            centreline: [P(0, 0), P(5, 0), P(5, 0), P(10, 0)],
        });
        expect(r.success).toBe(false);
    });

    it('accepts a polyline that REVISITS a point non-consecutively', () => {
        // A figure-of-eight centreline is geometrically awkward but not undefined;
        // refusing it here would be a spatial-validity judgement, and C116 §12 puts
        // overlap in FINE/INADVISABLE, not IMPOSSIBLE.
        const r = Siteworks.safeParse({
            ...linear(),
            centreline: [P(0, 0), P(5, 0), P(5, 5), P(0, 0), P(-5, 0)],
        });
        expect(r.success).toBe(true);
    });
});

describe('Siteworks — the plate', () => {
    it('refuses a zero or negative thickness — a plate with no depth is a plane', () => {
        expect(Siteworks.safeParse({ ...linear(), thickness: 0 }).success).toBe(false);
        expect(Siteworks.safeParse({ ...linear(), thickness: -0.2 }).success).toBe(false);
    });

    it('refuses a zero or negative width', () => {
        expect(Siteworks.safeParse({ ...linear(), widthM: 0 }).success).toBe(false);
    });

    it('accepts a NEGATIVE baseOffset — a sunken ramp is legal', () => {
        expect(Siteworks.safeParse({ ...linear(), baseOffset: -1.5 }).success).toBe(true);
    });
});

describe('Siteworks — MATERIAL (C100 §2.1, C116 §9e as amended)', () => {
    it('declares materialId alongside materialColor — the pair Slab declares', () => {
        const s = Siteworks.parse({ ...linear(), materialId: 'mat_asphalt', materialColor: '#333' });
        expect(s.materialId).toBe('mat_asphalt');
        expect(s.materialColor).toBe('#333');
    });

    // ⚠ THESE THREE ARMS ASSERT THAT A SUPPLIED VALUE IS **STRIPPED**, NOT THAT A KEY
    //   IS ABSENT FROM A DEFAULT PARSE. The scramble control caught the difference:
    //   an `x: z.string().optional()` that is never supplied produces NO KEY EITHER, so
    //   `expect('x' in parsed).toBe(false)` passes whether or not the field is declared
    //   — it measured nothing. Re-adding `systemTypeId` to the schema left the original
    //   arm GREEN. Supplying the value binds: a declared field would survive the parse.
    it('⛔ STRIPS systemTypeId and layers — a car park is not schedulable building fabric', () => {
        const s = Siteworks.parse({
            ...linear(),
            systemTypeId: 'st_asphalt_buildup',
            layers: [{ thickness: 0.1 }],
        }) as Record<string, unknown>;
        expect(s.systemTypeId).toBeUndefined();
        expect(s.layers).toBeUndefined();
    });

    it('⛔ STRIPS sourceFeatureId — context roads are never adopted (C84 EI-9)', () => {
        const s = Siteworks.parse({ ...linear(), sourceFeatureId: 'osm/way/12345' }) as Record<string, unknown>;
        expect(s.sourceFeatureId).toBeUndefined();
    });

    it('⛔ STRIPS a derived ring and a cached area — one authority, one answer', () => {
        const s = Siteworks.parse({
            ...linear(),
            ring: [P(0, 0), P(1, 0), P(1, 1)],
            areaM2: 999,
            footprintAreaM2: 999,
        }) as Record<string, unknown>;
        expect(s.ring).toBeUndefined();
        expect(s.areaM2).toBeUndefined();
        expect(s.footprintAreaM2).toBeUndefined();
    });
});
