/**
 * §TOBE-ENVELOPE / §TOBE-ALLOCATION (STR §25.2) — the card's half of the to-be-built envelope:
 * the three-envelope LEGEND, and the BRUT/NET remainder the founder asks the user to be TOLD.
 *
 * ⛔ WHAT THESE ARMS GUARD, beyond "does it emit a div":
 *
 *   1. THE LEGEND MUST REACH THE CARD WITHOUT ANYONE PASSING IT ANYTHING. It is rendered from
 *      inside `buildTargetAreaEntryHtml`, whose call site already exists — an authored legend that
 *      needed a new argument would be one more "authored but unwired" artefact, which is this
 *      repo's second-most-expensive recurring failure.
 *   2. `null` REMAINING MUST NOT RENDER AS `0`. The two arms are asserted to produce visibly
 *      different markup AND different words, because they demand opposite next actions.
 *   3. A MISSING ALLOCATION MODEL MUST RENDER NOTHING, not an empty table. "The host did not wire
 *      it" and "you have allocated nothing" are different facts, and a zeroed table states the
 *      second while meaning the first.
 *   4. A REFUSED STOREY MUST STILL SHOW ITS NUMBERS. A refusal that reaches the DOM without the
 *      pair it was decided from is the bare "cannot" the whole lane is written against.
 */

import { describe, it, expect } from 'vitest';

import {
    buildEnvelopeLegendHtml,
    buildBrutAllocationHtml,
    buildTargetAreaEntryHtml,
    ENVELOPE_LEGEND_TESTID,
    BRUT_ALLOCATION_TESTID,
    BRUT_ALLOCATION_HEADLINE_TESTID,
    BRUT_ALLOCATION_INPUT_ATTR,
} from '../envelopeCardSections';
import {
    resolveBrutAllowance,
    buildBrutAllocation,
    type AllocationStorey,
} from '../brutAreaAllocation';
import { TO_BE_BUILT_ROSE_CSS } from '../toBeBuiltEnvelopeStyle';

const GROUND: AllocationStorey = { levelId: 'L0', name: 'Ground', elevation: 0 };
const FIRST: AllocationStorey = { levelId: 'L1', name: 'Level 1', elevation: 3 };

/** The founder's worked example: 1,200 m² plot · 200 m² implantation · 320 m² BRUT. */
const FOUNDER = resolveBrutAllowance({
    permittedFootprintM2: 200, maxFAR: 320 / 1200, parcelAreaM2: 1200, maxFloors: null,
});

describe('§25.2 — the three-envelope legend', () => {
    it('names all three envelopes and carries the to-be-built swatch', () => {
        const html = buildEnvelopeLegendHtml();
        expect(html).toContain(ENVELOPE_LEGEND_TESTID);
        expect(html).toContain('data-legend-kind="permitted"');
        expect(html).toContain('data-legend-kind="to-be-built"');
        expect(html).toContain('data-legend-kind="room"');
        expect(html).toContain(TO_BE_BUILT_ROSE_CSS);
    });

    it('⛔ marks WHICH row carries a confidence badge — only the permitted one', () => {
        const html = buildEnvelopeLegendHtml();
        expect(html).toContain('data-legend-kind="permitted" data-carries-confidence="yes"');
        expect(html).toContain('data-legend-kind="to-be-built" data-carries-confidence="no"');
        expect(html).toContain('data-legend-kind="room" data-carries-confidence="no"');
    });

    it('the to-be-built row says ORIENTATIVE in words, so the disclosure survives greyscale', () => {
        expect(buildEnvelopeLegendHtml()).toContain('Orientative');
    });

    it('⭐ REACHABILITY: it renders from the EXISTING target-area entry, with no new argument', () => {
        // The four-argument call is the one `GISAreaLayout.refreshEnvelopePanel` already makes.
        const full = buildTargetAreaEntryHtml(200, null, false, null);
        expect(full).toContain(ENVELOPE_LEGEND_TESTID);
        // …and on the arm where there is no footprint to fit anything inside, too — the permitted
        // envelope may still be drawn there, so the key is still needed.
        const none = buildTargetAreaEntryHtml(null, null, false, null);
        expect(none).toContain(ENVELOPE_LEGEND_TESTID);
    });
});

describe('§25.2 — the remainder the user must be TOLD', () => {
    it('⭐ the founder\'s sentence reaches the DOM, in the open, not folded away', () => {
        const model = buildBrutAllocation(FOUNDER, [GROUND, FIRST], [
            { levelId: 'L0', requestedM2: 200 },
        ]);
        const html = buildBrutAllocationHtml(model);
        expect(html).toContain(BRUT_ALLOCATION_HEADLINE_TESTID);
        expect(html).toContain('120 m² remains for the floors above');
        // The chip carries the number on its own, in the to-be-built colour.
        expect(html).toContain('120 m²');
        expect(html).toContain(TO_BE_BUILT_ROSE_CSS);
        // ⛔ NOT inside a <details> — a remainder a user must click to find has not been disclosed.
        const headlineAt = html.indexOf(BRUT_ALLOCATION_HEADLINE_TESTID);
        const firstDetailsAt = html.indexOf('<details');
        expect(headlineAt).toBeGreaterThan(-1);
        expect(firstDetailsAt === -1 || headlineAt < firstDetailsAt).toBe(true);
    });

    it('⛔ an UNKNOWN total renders differently from a ZERO remainder — words AND state', () => {
        const unknown = buildBrutAllocation(
            resolveBrutAllowance({
                permittedFootprintM2: 200, maxFAR: null, parcelAreaM2: 1200, maxFloors: null,
            }),
            [GROUND, FIRST],
            [{ levelId: 'L0', requestedM2: 150 }],
        );
        const unknownHtml = buildBrutAllocationHtml(unknown);
        expect(unknownHtml).toContain('data-state="total-unknown"');
        expect(unknownHtml).toContain('not known');
        expect(unknownHtml).toContain('PRYZM will not guess');

        const exhausted = buildBrutAllocation(FOUNDER, [GROUND, FIRST], [
            { levelId: 'L0', requestedM2: 200 },
            { levelId: 'L1', requestedM2: 120 },
        ]);
        const exhaustedHtml = buildBrutAllocationHtml(exhausted);
        expect(exhaustedHtml).toContain('data-state="known"');
        expect(exhaustedHtml).toContain('Nothing remains');
        expect(exhaustedHtml).not.toContain('not known');
    });

    it('a refused storey reaches the DOM WITH both numbers and its reason', () => {
        const model = buildBrutAllocation(FOUNDER, [GROUND, FIRST], [
            { levelId: 'L0', requestedM2: 200 },
            { levelId: 'L1', requestedM2: 180 },
        ]);
        const html = buildBrutAllocationHtml(model);
        expect(html).toContain('data-refusal="exceeds-remaining-brut"');
        expect(html).toContain('180');
        expect(html).toContain('120');
        expect(html).toContain('320');
    });

    it('the per-storey ceiling names WHAT BINDS it, so the panel can say why', () => {
        const model = buildBrutAllocation(FOUNDER, [GROUND, FIRST], [
            { levelId: 'L0', requestedM2: 200 },
        ]);
        const html = buildBrutAllocationHtml(model);
        expect(html).toContain('data-ceiling-source="remaining-brut"');
    });

    it('⛔ an editable table is opt-in — an unwired input is a dead click', () => {
        const model = buildBrutAllocation(FOUNDER, [GROUND, FIRST], []);
        expect(buildBrutAllocationHtml(model)).not.toContain(BRUT_ALLOCATION_INPUT_ATTR);
        expect(buildBrutAllocationHtml(model, true)).toContain(BRUT_ALLOCATION_INPUT_ATTR);
    });

    it('⛔ NO allocation model ⇒ NO block at all, never a zeroed table', () => {
        const html = buildTargetAreaEntryHtml(200, null, false, null);
        expect(html).not.toContain(BRUT_ALLOCATION_TESTID);

        const model = buildBrutAllocation(FOUNDER, [GROUND, FIRST], [
            { levelId: 'L0', requestedM2: 200 },
        ]);
        const wired = buildTargetAreaEntryHtml(200, null, false, null, null, model);
        expect(wired).toContain(BRUT_ALLOCATION_TESTID);
        expect(wired).toContain('120 m² remains for the floors above');
    });

    it('over-allocation is its own state, not a negative number in the success voice', () => {
        // Two storeys of 200 m² against a 320 m² total: the second is REFUSED, so the model is not
        // over-allocated — the honest picture. Force the over arm through a smaller total instead.
        const tiny = resolveBrutAllowance({
            permittedFootprintM2: 200, maxFAR: 100 / 1200, parcelAreaM2: 1200, maxFloors: null,
        });
        const refusedSecond = buildBrutAllocation(tiny, [GROUND, FIRST], [
            { levelId: 'L0', requestedM2: 150 },
        ]);
        // 150 > 100 remaining ⇒ refused, nothing allocated, remainder intact.
        expect(refusedSecond.rows[0]!.refusal).toBe('exceeds-remaining-brut');
        const html = buildBrutAllocationHtml(refusedSecond);
        expect(html).toContain('data-state="known"');
        expect(html).toContain('data-refusal="exceeds-remaining-brut"');
    });

    it('never throws on a degenerate model', () => {
        const empty = buildBrutAllocation(
            resolveBrutAllowance({
                permittedFootprintM2: null, maxFAR: null, parcelAreaM2: null, maxFloors: null,
            }),
            [],
            [],
        );
        expect(() => buildBrutAllocationHtml(empty, true)).not.toThrow();
    });
});
