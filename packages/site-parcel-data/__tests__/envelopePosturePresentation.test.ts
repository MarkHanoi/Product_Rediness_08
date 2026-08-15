// §OPEN-TOP-INDICATIVE × §1.14 — THE POSTURE IS A RENDER SIGNAL, AND AN INDICATIVE ENVELOPE CAN
// NEVER CLASSIFY AS A DETERMINATION.
//
// ⭐ THE ONE PROPERTY THIS FILE EXISTS TO PIN: `complete === true` is UNREACHABLE for
// `publicationPosture: 'open-top-indicative'`. Not "unlikely", not "the renderers check first" —
// unreachable, across the WHOLE cross-product of the other three signals. That is what makes it safe
// for the founder to list a jurisdiction with a one-line registry entry: no surface, including one
// written later by someone who never read `openTopIndicative.ts`, can paint an indicative solid in
// the confident violet, because the value it would have to branch on is never produced.
//
// The second half is the regression half, and it is equally load-bearing: EVERY pre-existing call
// site passed three arguments, and all three must behave byte-for-byte as they did. A fourth input
// that quietly changed the default would have greyed every confident envelope in every jurisdiction.

import { describe, it, expect } from 'vitest';
import type { EnvelopeConfidence, EnvelopePublicationPosture, Pt } from '@pryzm/schemas';
import {
    classifyEnvelopeCompleteness,
    envelopeToMassing,
    SOLID_FILL_ALPHA,
    UPPER_BOUND_FILL_ALPHA,
    OPEN_TOP_FILL_ALPHA,
    type BuildableEnvelopeMassingInput,
} from '../src/envelopeToMassing.js';

/** Every confidence label the schema admits — the classifier must be total over them. */
const ALL_CONFIDENCES: readonly EnvelopeConfidence[] = [
    'authoritative',
    'structured',
    'block-constructed',
    'estimated-ruleset',
    'not-determined',
];

const rect = (w: number, d: number): Pt[] => [
    { x: 0, z: 0 },
    { x: w, z: 0 },
    { x: w, z: d },
    { x: 0, z: d },
];

const baseEnv: BuildableEnvelopeMassingInput = {
    insetPolygon: rect(20, 20),
    insetAreaM2: 400,
    maxHeight_m: 18,
    confidence: 'authoritative',
    status: 'ok',
    tiers: [],
};

describe('§OPEN-TOP · 5 — THE POSTURE CHANGES THE CLASSIFICATION', () => {
    it('⭐ the SAME three signals classify DIFFERENTLY once the posture is indicative', () => {
        const asDetermination = classifyEnvelopeCompleteness('authoritative', true);
        const asIndicative = classifyEnvelopeCompleteness(
            'authoritative',
            true,
            false,
            'open-top-indicative',
        );
        // The inputs that existed before are IDENTICAL; only the fourth differs.
        expect(asDetermination.complete).toBe(true);
        expect(asIndicative.complete).toBe(false);
        expect(asIndicative.openTop).toBe(true);
        expect(asDetermination.openTop).toBe(false);
        expect(asIndicative.reason).not.toBe(asDetermination.reason);
    });

    it('the reason NAMES the claim being withheld, not merely "provisional"', () => {
        const r = classifyEnvelopeCompleteness('authoritative', true, false, 'open-top-indicative')
            .reason;
        expect(r).toMatch(/indicative/i);
        expect(r).toMatch(/open top/i);
        expect(r).toMatch(/no buildable right/i);
        // ⛔ It must say the constraints REDUCE — an open top that reads as "we might allow more"
        // would be the overstatement this posture exists to prevent.
        expect(r).toMatch(/REDUCE/i);
    });

    it('⚠ the two doubts COMPOSE — an upper-bound footprint UNDER an indicative posture reports BOTH', () => {
        const both = classifyEnvelopeCompleteness('structured', true, true, 'open-top-indicative');
        expect(both.complete).toBe(false);
        expect(both.footprintUpperBound).toBe(true); // the plan is unknown
        expect(both.openTop).toBe(true); // …and the section is unclaimed
        expect(both.reason).toMatch(/maximum extent/i);
        expect(both.reason).toMatch(/open top/i);
    });

    it('`refused` can never be complete either, and is NOT dressed up as an open top', () => {
        const r = classifyEnvelopeCompleteness('authoritative', true, false, 'refused');
        expect(r.complete).toBe(false);
        // ⛔ An open top is a DISCLOSURE about a solid we drew. A refusal drew nothing, so labelling
        // it "open top" would advertise a disclosure that has no subject.
        expect(r.openTop).toBe(false);
        expect(r.reason).toMatch(/refused/i);
    });
});

describe('§OPEN-TOP · 6 — AN INDICATIVE ENVELOPE NEVER RENDERS AS A DETERMINATION', () => {
    it('⛔ `complete` is UNREACHABLE across the WHOLE cross-product of the other three signals', () => {
        let checked = 0;
        for (const confidence of [...ALL_CONFIDENCES, null, undefined]) {
            for (const hasRealHeight of [true, false]) {
                for (const upperBound of [true, false]) {
                    const cls = classifyEnvelopeCompleteness(
                        confidence,
                        hasRealHeight,
                        upperBound,
                        'open-top-indicative',
                    );
                    expect(cls.complete, `${confidence}/${hasRealHeight}/${upperBound}`).toBe(false);
                    expect(cls.openTop, `${confidence}/${hasRealHeight}/${upperBound}`).toBe(true);
                    checked++;
                }
            }
        }
        expect(checked).toBe(28); // 7 confidences × 2 heights × 2 upper-bound — nothing skipped.
    });

    it('⛔ EVERY SOLID of an indicative envelope is provisional + open-top — no confident member', () => {
        // A tiered + FAR-limited + null-height sweep: whichever role each solid takes, none of them
        // may read as a determination. A multi-solid envelope with one confident member would be the
        // §CONTEXT-DATA-HONESTY defect in a corner case nobody screenshots.
        const shapes: BuildableEnvelopeMassingInput[] = [
            { ...baseEnv, publicationPosture: 'open-top-indicative' },
            // FAR-limited → a height SHELL + a FAR massing.
            { ...baseEnv, farLimitedHeight_m: 9, publicationPosture: 'open-top-indicative' },
            // No height → a flat footprint slab.
            { ...baseEnv, maxHeight_m: null, publicationPosture: 'open-top-indicative' },
            // Tiered → one solid per tier, one of them height-less.
            {
                ...baseEnv,
                publicationPosture: 'open-top-indicative',
                // Full tier members, so the CAST CAN GO. The previous
                // `as BuildableEnvelopeMassingInput['tiers']` was hiding three missing
                // required fields (label, maxFloors, ordinanceRef) behind an assertion —
                // which is how a fixture drifts out of shape with the type it claims to be.
                // maxFloors/ordinanceRef are null on purpose: this fixture asserts that an
                // indicative envelope carries no determination, and a cited ordinanceRef
                // would be exactly such a determination.
                tiers: [
                    {
                        id: 'a', label: 'tier A', polygon: rect(20, 10), areaM2: 200,
                        baseHeight_m: 0, maxHeight_m: 12, maxFloors: null, ordinanceRef: null,
                    },
                    {
                        id: 'b', label: 'tier B', polygon: rect(20, 6), areaM2: 120,
                        baseHeight_m: 12, maxHeight_m: null, maxFloors: null, ordinanceRef: null,
                    },
                ],
            },
        ];
        let solidsSeen = 0;
        for (const env of shapes) {
            const solids = envelopeToMassing(env);
            expect(solids.length).toBeGreaterThan(0);
            for (const s of solids) {
                expect(s.style.complete, s.id).toBe(false);
                expect(s.style.hue, s.id).toBe('provisional');
                expect(s.style.openTop, s.id).toBe(true);
                expect(s.style.reason, s.id).toMatch(/indicative/i);
                solidsSeen++;
            }
        }
        expect(solidsSeen).toBeGreaterThanOrEqual(6);
    });

    it('⭐ the SAME envelope drawn as a determination vs indicative differs in BOTH channels', () => {
        const determined = envelopeToMassing({ ...baseEnv, publicationPosture: 'determination' });
        const indicative = envelopeToMassing({ ...baseEnv, publicationPosture: 'open-top-indicative' });
        expect(determined).toHaveLength(1);
        expect(indicative).toHaveLength(1);
        const d = determined[0]!;
        const i = indicative[0]!;
        // Same GEOMETRY — the shape a rule produces is the same question either way.
        expect(i.ring).toEqual(d.ring);
        expect(i.topHeightM).toBe(d.topHeightM);
        expect(i.areaM2).toBe(d.areaM2);
        // …and a DIFFERENT CLAIM, in both channels a viewer has: hue AND silhouette.
        expect(d.style.hue).toBe('confident');
        expect(i.style.hue).toBe('provisional');
        expect(d.style.openTop).toBe(false);
        expect(i.style.openTop).toBe(true);
        // The near-wireframe weight is the §L-619 alias, NOT a fourth tuneable number.
        expect(d.style.fillAlpha).toBe(SOLID_FILL_ALPHA);
        expect(i.style.fillAlpha).toBe(OPEN_TOP_FILL_ALPHA);
        expect(OPEN_TOP_FILL_ALPHA).toBe(UPPER_BOUND_FILL_ALPHA);
    });

    it('⛔ NO NEW COLOUR: the hue vocabulary is still exactly the two members it was', () => {
        const hues = new Set(
            (['determination', 'open-top-indicative', 'refused', null] as const).flatMap((p) =>
                envelopeToMassing({ ...baseEnv, publicationPosture: p }).map((s) => s.style.hue),
            ),
        );
        expect([...hues].sort()).toEqual(['confident', 'provisional']);
    });
});

describe('§OPEN-TOP · 7 — THE PRE-EXISTING CALL SITES ARE UNCHANGED', () => {
    it('⭐ 3-arg === 4-arg-null === 4-arg-undefined === 4-arg-`determination`, over the whole matrix', () => {
        // The three shipped call sites (`envelopeToMassing` ×2, `envelopeRenderStyle` ×1) all passed
        // THREE arguments. If the fourth's default were anything but inert, every confident envelope
        // in every jurisdiction would have greyed on the day this landed.
        let checked = 0;
        for (const confidence of [...ALL_CONFIDENCES, null, undefined]) {
            for (const hasRealHeight of [true, false]) {
                for (const upperBound of [true, false]) {
                    const three = classifyEnvelopeCompleteness(confidence, hasRealHeight, upperBound);
                    const label = `${confidence}/${hasRealHeight}/${upperBound}`;
                    expect(
                        classifyEnvelopeCompleteness(confidence, hasRealHeight, upperBound, null),
                        label,
                    ).toEqual(three);
                    expect(
                        classifyEnvelopeCompleteness(confidence, hasRealHeight, upperBound, undefined),
                        label,
                    ).toEqual(three);
                    // ⛔ `'determination'` is a RECORD of what the owned gate already said, never a
                    // grant — so it must be treated EXACTLY like an absent posture.
                    expect(
                        classifyEnvelopeCompleteness(
                            confidence,
                            hasRealHeight,
                            upperBound,
                            'determination',
                        ),
                        label,
                    ).toEqual(three);
                    checked++;
                }
            }
        }
        expect(checked).toBe(28);
    });

    it('the §L-619 upper-bound wording is byte-identical when no posture is stated', () => {
        // Pinned verbatim: the composed reason must not have rewritten the original sentence.
        expect(classifyEnvelopeCompleteness('structured', true, true).reason).toBe(
            'maximum extent — ordinance publishes no setbacks, footprint is an upper bound (L-619)',
        );
        expect(classifyEnvelopeCompleteness('authoritative', true).reason).toBe(
            'confident (authoritative)',
        );
    });

    it('`envelopeToMassing` output is byte-identical with the posture absent vs null vs determination', () => {
        const shapes: BuildableEnvelopeMassingInput[] = [
            baseEnv,
            { ...baseEnv, farLimitedHeight_m: 9 },
            { ...baseEnv, maxHeight_m: null },
            { ...baseEnv, footprintIsUpperBound: true },
            { ...baseEnv, confidence: 'estimated-ruleset' },
        ];
        for (const env of shapes) {
            const absent = envelopeToMassing(env);
            expect(envelopeToMassing({ ...env, publicationPosture: null })).toEqual(absent);
            expect(envelopeToMassing({ ...env, publicationPosture: 'determination' })).toEqual(absent);
            // …and nothing in the absent case claims an open top.
            for (const s of absent) expect(s.style.openTop).toBe(false);
        }
    });

    it('a persisted / geometry-only envelope (no posture field at all) still greys as before', () => {
        // The C58 §1.7a reload path builds a MINIMAL envelope with confidence null and no posture.
        const solids = envelopeToMassing({
            insetPolygon: rect(12, 12),
            maxHeight_m: 10,
            confidence: null,
            status: 'ok',
            tiers: [],
        });
        expect(solids).toHaveLength(1);
        expect(solids[0]!.style.hue).toBe('provisional');
        expect(solids[0]!.style.openTop).toBe(false);
        expect(solids[0]!.style.fillAlpha).toBe(SOLID_FILL_ALPHA);
    });

    it('a posture never changes GEOMETRY or the volume claimed — only the claim', () => {
        // ⛔ The never-overstate invariant (§1.14.4) must not be perturbed by a presentation signal.
        for (const p of [null, 'determination', 'open-top-indicative'] as const) {
            const solids = envelopeToMassing({ ...baseEnv, publicationPosture: p });
            expect(solids).toHaveLength(1);
            expect(solids[0]!.topHeightM).toBe(18);
            expect(solids[0]!.areaM2).toBe(400);
            expect(solids[0]!.claimsVolume).toBe(true);
            expect(solids[0]!.role).toBe('massing');
        }
    });

    it('a REFUSED envelope still draws nothing, whatever posture is stamped on it', () => {
        for (const p of [null, 'refused', 'open-top-indicative'] as EnvelopePublicationPosture[]) {
            expect(
                envelopeToMassing({ ...baseEnv, status: 'none', publicationPosture: p }),
            ).toEqual([]);
        }
    });
});
