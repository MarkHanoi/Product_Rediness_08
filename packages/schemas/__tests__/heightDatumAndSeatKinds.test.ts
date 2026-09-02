// LANE S1 (ADR-0377/0378/0379) — the three append-only canonical seats, schema arms.
//
// Targets the ways these seats could FAIL SILENTLY:
//   • an absolute national altitude parsing into a relative-height seat with no flag (the E8 DE
//     «72,2 m über NHN» defect — ADR-0377's reason to exist);
//   • an incoherent pair being silently STRIPPED instead of rejected (frame on a relative datum,
//     street-axis on a non-front boundary, a datum of nothing);
//   • a legacy pack changing bytes (append-only means shipped packs parse identically);
//   • a fabricated setback triple leaking out of a construction kind (`displaySetbacks`).

import { describe, it, expect } from 'vitest';
import {
    HeightDatumSchema,
    HEIGHT_DATUM_KIND_REGISTRY,
    UNKNOWN_HEIGHT_DATUM,
    heightDatumOf,
    type HeightDatumKind,
} from '../src/site/HeightDatum';
import {
    GeometricRuleSchema,
    GeometricRuleCompatSchema,
    GEOMETRIC_RULE_KIND_REGISTRY,
    displaySetbacks,
    requiresBlockRing,
    type GeometricRuleKind,
} from '../src/site/GeometricRule';
import { ZoningRuleSchema } from '../src/site/zoning/JurisdictionZoningContract';

/* ───────────────────────── Seat 1 — the datum (ADR-0377) ───────────────────────── */

describe('ADR-0377 §S1-DATUM — the HeightDatum union', () => {
    it('parses every relative member and the unknown member', () => {
        for (const kind of [
            'facade-rasant',
            'street-level',
            'mean-ground-at-facade',
            'terrain-highest',
            'terrain-lowest',
            'unknown',
        ] as const) {
            expect(HeightDatumSchema.parse({ kind }).kind).toBe(kind);
        }
    });

    it('parses absolute-national WITH its frame (NGF / NHN / EH2000)', () => {
        for (const frame of ['NGF', 'NHN', 'EH2000'] as const) {
            const d = HeightDatumSchema.parse({ kind: 'absolute-national', frame });
            expect(d.kind === 'absolute-national' && d.frame).toBe(frame);
        }
    });

    it('REJECTS a frameless absolute datum — an altitude without its frame is a number, not a datum', () => {
        expect(() => HeightDatumSchema.parse({ kind: 'absolute-national' })).toThrow();
    });

    it('REJECTS a frame on a relative member (strict — incoherent pairs are errors, never stripped)', () => {
        expect(() => HeightDatumSchema.parse({ kind: 'street-level', frame: 'NHN' })).toThrow();
        expect(() => HeightDatumSchema.parse({ kind: 'unknown', frame: 'NGF' })).toThrow();
    });

    it('heightDatumOf is TOTAL: absence is unknown, never any specific plane', () => {
        expect(heightDatumOf(undefined)).toEqual(UNKNOWN_HEIGHT_DATUM);
        expect(heightDatumOf(null)).toEqual(UNKNOWN_HEIGHT_DATUM);
        expect(heightDatumOf({ kind: 'facade-rasant' }).kind).toBe('facade-rasant');
    });

    it('the member registry is closed over the union and flags what is NOT a building height', () => {
        const kinds = Object.keys(HEIGHT_DATUM_KIND_REGISTRY).sort() as HeightDatumKind[];
        expect(kinds).toEqual(
            [
                'absolute-national',
                'facade-rasant',
                'mean-ground-at-facade',
                'street-level',
                'terrain-highest',
                'terrain-lowest',
                'unknown',
            ].sort(),
        );
        expect(HEIGHT_DATUM_KIND_REGISTRY['absolute-national'].comparableToRelativeHeight).toBe(false);
        expect(HEIGHT_DATUM_KIND_REGISTRY.unknown.comparableToRelativeHeight).toBe(false);
        expect(HEIGHT_DATUM_KIND_REGISTRY['facade-rasant'].comparableToRelativeHeight).toBe(true);
    });
});

describe('ADR-0377 — the ZoningRule.heightDatum seat (required-when-height, append-only)', () => {
    const legacyZone = { code: 'R1', label: 'Legacy residential', maxHeight_m: 12 };

    it('a legacy pack zone parses UNCHANGED and gains no injected key (byte-parity guard)', () => {
        const parsed = ZoningRuleSchema.parse(legacyZone);
        expect('heightDatum' in parsed).toBe(false);
        // …and the total read helper stamps unknown, never a plane.
        expect(heightDatumOf(parsed.heightDatum)).toEqual({ kind: 'unknown' });
    });

    it('REPRESENTS-AND-FLAGS the DE «72,2 m über NHN» class', () => {
        const parsed = ZoningRuleSchema.parse({
            code: 'DE-BPlan-GO',
            label: 'Gebäudeoberkante bis zu 72,2 m über NHN',
            maxHeight_m: 72.2,
            heightDatum: { kind: 'absolute-national', frame: 'NHN' },
        });
        const d = heightDatumOf(parsed.heightDatum);
        expect(d).toEqual({ kind: 'absolute-national', frame: 'NHN' });
        // The rule can now SAY which it is — and the registry says it is not a building height.
        expect(HEIGHT_DATUM_KIND_REGISTRY[d.kind].comparableToRelativeHeight).toBe(false);
    });

    it('REJECTS a datum of nothing — a specific datum stated while maxHeight_m is null', () => {
        expect(() =>
            ZoningRuleSchema.parse({
                code: 'X',
                label: 'datum of nothing',
                heightDatum: { kind: 'facade-rasant' },
            }),
        ).toThrow(/datum of nothing|maxHeight_m is null/);
    });

    it("allows an EXPLICIT unknown datum beside a null height — it asserts nothing", () => {
        expect(() =>
            ZoningRuleSchema.parse({ code: 'X', label: 'honest unknown', heightDatum: { kind: 'unknown' } }),
        ).not.toThrow();
    });
});

/* ─────────────── Seat 2 — height-proportional-offset (ADR-0378), parse arms ─────────────── */

describe('ADR-0378 §S1-HPO — the height-proportional-offset kind', () => {
    const deAbstandsflaechen = {
        kind: 'height-proportional-offset' as const,
        heightFactor: 0.4,
        minOffset_m: 3,
        direction: 'into-parcel' as const,
        appliesTo: 'all-plot-boundaries' as const,
        measuredFrom: 'plot-boundary' as const,
        appliesToStoreys: 'all' as const,
        heightDatum: { kind: 'unknown' as const }, // DE §6 H-semantics pending the primary read
    };

    it('parses the DE BauO NRW §6 case (0,4·H min 3 m)', () => {
        const r = GeometricRuleSchema.parse(deAbstandsflaechen);
        expect(r.kind).toBe('height-proportional-offset');
        if (r.kind === 'height-proportional-offset') expect(r.heightFactor).toBe(0.4);
    });

    it('parses the Porto afastamento case (H/2 min 3 m, upper storeys only)', () => {
        const r = GeometricRuleSchema.parse({
            ...deAbstandsflaechen,
            heightFactor: 0.5,
            appliesToStoreys: 'above-ground-floor',
        });
        if (r.kind === 'height-proportional-offset') {
            expect(r.appliesToStoreys).toBe('above-ground-floor');
        }
    });

    it('parses the Madrid NZ5 front-to-axis case', () => {
        const r = GeometricRuleSchema.parse({
            ...deAbstandsflaechen,
            appliesTo: 'front',
            measuredFrom: 'street-axis',
        });
        if (r.kind === 'height-proportional-offset') expect(r.measuredFrom).toBe('street-axis');
    });

    it('REJECTS street-axis measurement on a non-front boundary — no street axis exists there', () => {
        expect(() =>
            GeometricRuleSchema.parse({ ...deAbstandsflaechen, measuredFrom: 'street-axis' }),
        ).toThrow(/street-axis/);
    });

    it('REJECTS an absolute-national H-datum — factor × altitude is not a stated quantity', () => {
        expect(() =>
            GeometricRuleSchema.parse({
                ...deAbstandsflaechen,
                heightDatum: { kind: 'absolute-national', frame: 'NHN' },
            }),
        ).toThrow(/absolute|relative/);
    });

    it('REJECTS a zero/negative factor and a negative floor — transcription errors, not rules', () => {
        expect(() => GeometricRuleSchema.parse({ ...deAbstandsflaechen, heightFactor: 0 })).toThrow();
        expect(() => GeometricRuleSchema.parse({ ...deAbstandsflaechen, minOffset_m: -1 })).toThrow();
    });

    it('REQUIRES the datum seat — a factor with no H reference is unparseable', () => {
        const { heightDatum: _omitted, ...withoutDatum } = deAbstandsflaechen;
        expect(() => GeometricRuleSchema.parse(withoutDatum)).toThrow();
    });
});

/* ─────────────── Seat 3 — context-aggregate (ADR-0379), parse arms ─────────────── */

describe('ADR-0379 §S1-CTXAGG — the context-aggregate (fabricDerivedHeight) kind', () => {
    const portoModa = {
        kind: 'context-aggregate' as const,
        aggregate: 'mode' as const,
        contextSet: 'urban-frontage' as const,
        attribute: 'cornice-height' as const,
        heightDatum: { kind: 'mean-ground-at-facade' as const }, // Porto Art. 3.º g)
    };

    it('parses the Porto moda da cércea case (Art. 3.º o / 24.º n.º 1 e)', () => {
        const r = GeometricRuleSchema.parse(portoModa);
        expect(r.kind).toBe('context-aggregate');
        if (r.kind === 'context-aggregate') expect(r.aggregate).toBe('mode');
    });

    it('parses the median and max statistics', () => {
        for (const aggregate of ['median', 'max'] as const) {
            const r = GeometricRuleSchema.parse({ ...portoModa, aggregate });
            if (r.kind === 'context-aggregate') expect(r.aggregate).toBe(aggregate);
        }
    });

    it('REJECTS an undeclared statistic / set / attribute', () => {
        expect(() => GeometricRuleSchema.parse({ ...portoModa, aggregate: 'min' })).toThrow();
        expect(() => GeometricRuleSchema.parse({ ...portoModa, contextSet: 'whole-city' })).toThrow();
        expect(() => GeometricRuleSchema.parse({ ...portoModa, attribute: 'ridge-height' })).toThrow();
    });

    it('REJECTS an absolute-national datum — an aggregated cornice height is relative by definition', () => {
        expect(() =>
            GeometricRuleSchema.parse({
                ...portoModa,
                heightDatum: { kind: 'absolute-national', frame: 'EH2000' },
            }),
        ).toThrow(/cornice-height-class|relative/);
    });
});

/* ─────────────── The union closure — registry, no fabricated triples, compat ─────────────── */

describe('ADR-0377/0378/0379 — union closure and honesty invariants', () => {
    const newKinds: GeometricRuleKind[] = ['height-proportional-offset', 'context-aggregate'];

    it('the kind registry is closed over the union (compile-enforced; asserted here for the record)', () => {
        const kinds = Object.keys(GEOMETRIC_RULE_KIND_REGISTRY).sort();
        expect(kinds).toEqual(
            [
                'setback',
                'alignment',
                'block-derived-alignment',
                'tiered-occupation',
                'explicit-area',
                'occupation-capped-alignment',
                'height-proportional-offset',
                'context-aggregate',
            ].sort(),
        );
    });

    it('the two new kinds are declarative-seat, non-footprint-shaping, block-ring-free', () => {
        for (const k of newKinds) {
            expect(GEOMETRIC_RULE_KIND_REGISTRY[k].solveSeat).toBe('declarative-evaluator');
            expect(GEOMETRIC_RULE_KIND_REGISTRY[k].footprintShaping).toBe(false);
            expect(GEOMETRIC_RULE_KIND_REGISTRY[k].requiresBlockRing).toBe(false);
        }
    });

    it('requiresBlockRing behaviour is unchanged for the six pre-existing kinds', () => {
        expect(
            requiresBlockRing({ kind: 'setback', front_m: 1, side_m: 1, rear_m: 1 }),
        ).toBe(false);
        expect(requiresBlockRing({ kind: 'explicit-area', ringRef: 'x' })).toBe(false);
        expect(
            requiresBlockRing(
                GeometricRuleSchema.parse({
                    kind: 'block-derived-alignment',
                    alignTo: 'street',
                    sideTreatment: 'party-wall',
                    interiorFreeRatio: 0.3,
                    minDepth_m: 12,
                    maxDepth_m: 30,
                }),
            ),
        ).toBe(true);
    });

    it('displaySetbacks NEVER fabricates a triple for the new kinds', () => {
        const hpo = GeometricRuleSchema.parse({
            kind: 'height-proportional-offset',
            heightFactor: 0.4,
            minOffset_m: 3,
            direction: 'into-parcel',
            appliesTo: 'all-plot-boundaries',
            measuredFrom: 'plot-boundary',
            appliesToStoreys: 'all',
            heightDatum: { kind: 'unknown' },
        });
        const ca = GeometricRuleSchema.parse({
            kind: 'context-aggregate',
            aggregate: 'mode',
            contextSet: 'urban-frontage',
            attribute: 'cornice-height',
            heightDatum: { kind: 'mean-ground-at-facade' },
        });
        expect(displaySetbacks(hpo)).toBeNull();
        expect(displaySetbacks(ca)).toBeNull();
    });

    it('the legacy compat reader still stamps a bare triple as setback (regression)', () => {
        const r = GeometricRuleCompatSchema.parse({ front_m: 6, side_m: 3, rear_m: 5 });
        expect(r.kind).toBe('setback');
    });
});
