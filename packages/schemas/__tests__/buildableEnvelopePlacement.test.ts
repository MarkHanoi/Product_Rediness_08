// §L-619 / DK-ENVELOPE-REALISM — `placement` + `openSpace` and the three refinements that keep the
// footprint's evidence class and the void's evidence class from drifting apart.
//
// WHAT IS ACTUALLY BEING PROVED (not that the fields exist — that the DISHONEST combinations are
// unrepresentable):
//   1. Every envelope shipped before these fields still parses, and comes out with BOTH null —
//      "makes no placement statement" is the default, not a permissive one.
//   2. An `openSpace` without a `placement` is REJECTED (an un-attributable courtyard, C58 §1.6).
//   3. A `derived` (constructed) footprint may NOT claim a published `byggefelt` hole as its
//      courtyard — that would launder a study into official plan geometry (C58 §1.4).
//   4. `openSpace.courtyard` and `footprintIsUpperBound` cannot both be true — a footprint that
//      leaves a courtyard is not the whole parcel drawn as an upper bound.

import { describe, expect, it } from 'vitest';
import {
    BuildableEnvelopeSchema,
    OPEN_SPACE_SOURCES_BY_PLACEMENT,
    type EnvelopeOpenSpaceSource,
    type EnvelopePlacementSource,
} from '../src/site/index.js';

/** The minimum a valid envelope needs; every optional field takes its schema default. */
function baseEnvelope(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        insetPolygon: [
            { x: 0, z: 0 },
            { x: 10, z: 0 },
            { x: 10, z: 10 },
            { x: 0, z: 10 },
        ],
        insetAreaM2: 100,
        confidence: 'structured',
        status: 'ok',
        ...over,
    };
}

describe('§L-619 — placement/openSpace are additive and default to "no statement"', () => {
    it('parses a pre-L-619 envelope and yields placement=null, openSpace=null', () => {
        const parsed = BuildableEnvelopeSchema.parse(baseEnvelope());
        expect(parsed.placement).toBeNull();
        expect(parsed.openSpace).toBeNull();
        // The neighbouring honesty flag is untouched — this change adds a statement, it does not
        // silently re-label any existing envelope.
        expect(parsed.footprintIsUpperBound).toBe(false);
    });

    it('accepts a published-byggefelt placement with its byggefelt-hole courtyard', () => {
        const parsed = BuildableEnvelopeSchema.parse(
            baseEnvelope({
                placement: { source: 'byggefelt' },
                openSpace: { courtyard: true, source: 'byggefelt-hole' },
            }),
        );
        expect(parsed.placement?.source).toBe('byggefelt');
        expect(parsed.openSpace).toEqual({ courtyard: true, source: 'byggefelt-hole' });
    });

    it('accepts a placement that makes NO open-space statement (the allowed asymmetry)', () => {
        const parsed = BuildableEnvelopeSchema.parse(
            baseEnvelope({ placement: { source: 'buildingLine' }, openSpace: null }),
        );
        expect(parsed.placement?.source).toBe('buildingLine');
        expect(parsed.openSpace).toBeNull();
    });

    it('rejects an unknown placement/open-space vocabulary rather than passing it through', () => {
        expect(
            BuildableEnvelopeSchema.safeParse(baseEnvelope({ placement: { source: 'guessed' } })).success,
        ).toBe(false);
        expect(
            BuildableEnvelopeSchema.safeParse(
                baseEnvelope({
                    placement: { source: 'derived' },
                    openSpace: { courtyard: true, source: 'vibes' },
                }),
            ).success,
        ).toBe(false);
    });
});

describe('§L-619 — an open-space statement requires a placement (C58 §1.6)', () => {
    it('REJECTS a courtyard attributed to no placement', () => {
        const r = BuildableEnvelopeSchema.safeParse(
            baseEnvelope({ placement: null, openSpace: { courtyard: true, source: 'lokalplan-depth' } }),
        );
        expect(r.success).toBe(false);
        expect(JSON.stringify(r.error?.issues)).toMatch(/requires a non-null `placement`/);
    });

    it('REJECTS it even when the courtyard claim is FALSE — attribution is the issue, not the value', () => {
        const r = BuildableEnvelopeSchema.safeParse(
            baseEnvelope({
                placement: null,
                openSpace: { courtyard: false, source: 'block-derived-study' },
            }),
        );
        expect(r.success).toBe(false);
    });
});

describe('§L-619 — the placement and the void must cite the same evidence class', () => {
    // The table is the normative pairing; the loop proves the schema agrees with it EXACTLY, so a
    // future edit to one without the other fails here rather than shipping a launderable combination.
    const ALL_PLACEMENTS: EnvelopePlacementSource[] = ['byggefelt', 'buildingLine', 'derived'];
    const ALL_OPEN_SPACES: EnvelopeOpenSpaceSource[] = [
        'byggefelt-hole',
        'building-line-band',
        'lokalplan-depth',
        'block-derived-study',
    ];

    for (const placement of ALL_PLACEMENTS) {
        for (const openSpace of ALL_OPEN_SPACES) {
            const allowed = OPEN_SPACE_SOURCES_BY_PLACEMENT[placement].includes(openSpace);
            it(`${allowed ? 'accepts' : 'REJECTS'} placement=${placement} + openSpace=${openSpace}`, () => {
                const r = BuildableEnvelopeSchema.safeParse(
                    baseEnvelope({
                        placement: { source: placement },
                        openSpace: { courtyard: true, source: openSpace },
                    }),
                );
                expect(r.success).toBe(allowed);
            });
        }
    }

    it('names the laundering failure explicitly: derived footprint + byggefelt-hole courtyard', () => {
        const r = BuildableEnvelopeSchema.safeParse(
            baseEnvelope({
                placement: { source: 'derived' },
                openSpace: { courtyard: true, source: 'byggefelt-hole' },
            }),
        );
        expect(r.success).toBe(false);
        expect(JSON.stringify(r.error?.issues)).toMatch(/launders a study into plan geometry/);
    });

    it('the table covers every placement source and every open-space source exactly once', () => {
        expect(Object.keys(OPEN_SPACE_SOURCES_BY_PLACEMENT).sort()).toEqual(
            [...ALL_PLACEMENTS].sort(),
        );
        const covered = ALL_PLACEMENTS.flatMap((p) => [...OPEN_SPACE_SOURCES_BY_PLACEMENT[p]]);
        expect([...covered].sort()).toEqual([...ALL_OPEN_SPACES].sort());
    });
});

describe('§L-619 — a real courtyard and a full-parcel upper bound are mutually exclusive', () => {
    it('REJECTS courtyard=true alongside footprintIsUpperBound=true', () => {
        const r = BuildableEnvelopeSchema.safeParse(
            baseEnvelope({
                footprintIsUpperBound: true,
                placement: { source: 'derived' },
                openSpace: { courtyard: true, source: 'block-derived-study' },
            }),
        );
        expect(r.success).toBe(false);
        expect(JSON.stringify(r.error?.issues)).toMatch(/cannot both be true/);
    });

    it('ACCEPTS courtyard=false alongside footprintIsUpperBound=true — an honest "no void found"', () => {
        // A resolver that placed the footprint but could not establish a courtyard, on a ring that
        // is still the whole parcel, is a coherent (if weak) answer. The refinement must not
        // over-reach into forbidding it.
        const r = BuildableEnvelopeSchema.safeParse(
            baseEnvelope({
                footprintIsUpperBound: true,
                placement: { source: 'derived' },
                openSpace: { courtyard: false, source: 'block-derived-study' },
            }),
        );
        expect(r.success).toBe(true);
    });
});
