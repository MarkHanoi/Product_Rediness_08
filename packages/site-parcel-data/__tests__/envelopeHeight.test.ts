// §L-590b / ADR-0273 — `applyConstructedHeight`.
//
// TWO THINGS TO PROVE, AND THE FIRST IS THE ONE THAT PROTECTS SHIPPED ZONES:
//   1. On a SINGLE-PRISM envelope it is byte-identical to the inline spread `siteDispatch.ts` does
//      today. This helper exists to serve a zone that is not registered yet; it must not quietly
//      move the live 13a/13b answer on its way there.
//   2. On a TIERED envelope it keeps the envelope parseable — the principal-tier refinement is
//      what stops a height patch from leaving `tiers` and the top-level fields describing
//      different buildings, and re-selecting the principal is what stops the short tier's ring
//      being published beside the tall tier's height.

import { describe, it, expect } from 'vitest';
import type { BuildableEnvelope, Pt } from '@pryzm/schemas';
import { BuildableEnvelopeSchema } from '@pryzm/schemas';
import { applyConstructedHeight } from '../src/envelopeHeight.js';

const RING: Pt[] = [
    { x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 10 }, { x: 0, z: 10 },
];
const INTERIOR: Pt[] = [
    { x: 0, z: 10 }, { x: 20, z: 10 }, { x: 20, z: 40 }, { x: 0, z: 40 },
];
const PARCEL: Pt[] = [
    { x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 40 }, { x: 0, z: 40 },
];

const base = (over: Partial<BuildableEnvelope>): BuildableEnvelope =>
    BuildableEnvelopeSchema.parse({
        insetPolygon: RING,
        insetAreaM2: 200,
        maxHeight_m: null,
        confidence: 'estimated-ruleset',
        granularity: 'parcel',
        status: 'ok',
        zoneCode: 'test',
        ...over,
    });

describe('ADR-0273 — single-prism behaviour is UNCHANGED', () => {
    it('matches the inline spread the dispatcher does today', () => {
        const env = base({});
        const out = applyConstructedHeight(env, { height_m: 17, maxFloors: 4 });
        expect(out.maxHeight_m).toBe(17);
        expect(out.maxFloors).toBe(4);
        expect(out.maxVolumeM3).toBe(200 * 17);
        expect(out.tiers).toEqual([]);
        expect(out.insetPolygon).toEqual(env.insetPolygon);
    });

    it('refuses on a non-ok envelope and on a nonsense height — returns the input untouched', () => {
        const degenerate = base({ status: 'degenerate', insetPolygon: [], insetAreaM2: 0 });
        expect(applyConstructedHeight(degenerate, { height_m: 17, maxFloors: 4 })).toBe(degenerate);
        const ok = base({});
        expect(applyConstructedHeight(ok, { height_m: 0, maxFloors: 1 })).toBe(ok);
        expect(applyConstructedHeight(ok, { height_m: Number.NaN, maxFloors: 1 })).toBe(ok);
    });
});

describe('ADR-0273 — a TIERED envelope stays internally consistent', () => {
    /** Band tier height not yet established; block-interior tier stated by Art. 350.2.e. */
    const tiered = (): BuildableEnvelope =>
        base({
            insetPolygon: INTERIOR,
            insetAreaM2: 600,
            maxHeight_m: 5,
            maxFloors: 1,
            maxCoverage: 0.9,
            tiers: [
                {
                    id: 'block-band', label: 'band', polygon: RING, areaM2: 200,
                    baseHeight_m: 0, maxHeight_m: null, maxFloors: null, ordinanceRef: null,
                },
                {
                    id: 'block-interior', label: 'interior', polygon: INTERIOR, areaM2: 600,
                    baseHeight_m: 0, maxHeight_m: 5, maxFloors: 1, ordinanceRef: null,
                },
            ],
        });

    it('attaches the height to the NAMED tier and re-selects the principal one', () => {
        // The band tier leads only once its height arrives — before that the 5 m interior tier is
        // the principal one. Keeping the old principal here would publish the interior ring beside
        // a 17 m height: an over-statement, and one the schema then rejects.
        const out = applyConstructedHeight(tiered(), {
            height_m: 17, maxFloors: 4, tierId: 'block-band', parcelRing: PARCEL,
        });
        expect(out.tiers[0]!.maxHeight_m).toBe(17);
        expect(out.tiers[1]!.maxHeight_m).toBe(5);        // Art. 350.2.e must NOT move
        expect(out.maxHeight_m).toBe(17);
        expect(out.insetPolygon).toEqual(RING);
        expect(out.insetAreaM2).toBe(200);
        // 200 m² < 0.9 × 800 m², so the occupation cap does not bind here.
        expect(out.maxVolumeM3).toBe(200 * 17);
        expect(() => BuildableEnvelopeSchema.parse(out)).not.toThrow();
    });

    it('⚠ the occupation cap BINDS when the parcel lies wholly inside the band (the L-590 case)', () => {
        // The case `BCN_22A_ENVELOPE_BLOCKER` named: a parcel shallower than the tier boundary has
        // ONE tier covering 100 % of the plot, beside a 90 % occupation cap from the same article.
        // Left alone the volume comes out 111 % of what Art. 350.2.a permits.
        const shallow = base({
            insetPolygon: RING,
            insetAreaM2: 200,
            maxCoverage: 0.9,
            tiers: [{
                id: 'block-band', label: 'band', polygon: RING, areaM2: 200,
                baseHeight_m: 0, maxHeight_m: null, maxFloors: null, ordinanceRef: null,
            }],
        });
        const out = applyConstructedHeight(shallow, {
            height_m: 17, maxFloors: 4, tierId: 'block-band', parcelRing: RING,
        });
        expect(out.insetAreaM2).toBe(200);              // the permitted REGION is the whole plot…
        expect(out.maxVolumeM3).toBe(200 * 0.9 * 17);   // …but the VOLUME is capped at 90 % of it
        expect(out.maxVolumeM3!).toBeLessThan(200 * 17);
    });

    it('⚠ omitting `parcelRing` leaves the cap UNAPPLIED — stated, because that over-states', () => {
        // Documented rather than silently defaulted: without the parcel the function cannot know
        // what 90 % is a share OF, and inventing a denominator would be worse than not capping.
        // A caller on a `maxCoverage` zone MUST pass it.
        const shallow = base({
            insetPolygon: RING, insetAreaM2: 200, maxCoverage: 0.9,
            tiers: [{
                id: 'block-band', label: 'band', polygon: RING, areaM2: 200,
                baseHeight_m: 0, maxHeight_m: null, maxFloors: null, ordinanceRef: null,
            }],
        });
        const out = applyConstructedHeight(shallow, {
            height_m: 17, maxFloors: 4, tierId: 'block-band',
        });
        expect(out.maxVolumeM3).toBe(200 * 17);
    });

    it('⚠ REFUSES to attach when no tier is named, or the id matches nothing', () => {
        // Attaching to the wrong tier is undetectable downstream, so "no attachment" is the only
        // honest failure. The caller then publishes no height, exactly as it does when no street
        // width can be established.
        const env = tiered();
        expect(applyConstructedHeight(env, { height_m: 17, maxFloors: 4 })).toBe(env);
        expect(
            applyConstructedHeight(env, { height_m: 17, maxFloors: 4, tierId: 'nope' }),
        ).toBe(env);
    });

    it('⚠ the naive spread the dispatcher does today would NOT parse — which is why this exists', () => {
        const naive = { ...tiered(), maxHeight_m: 17, maxFloors: 4, maxVolumeM3: 600 * 17 };
        expect(() => BuildableEnvelopeSchema.parse(naive)).toThrow(/PRINCIPAL/);
    });
});
