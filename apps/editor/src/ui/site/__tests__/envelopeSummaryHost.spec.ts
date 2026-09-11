/**
 * §ENVELOPE-SUMMARY-IN-QUESTION-1 (founder ruling 2026-09-11 — Site-panel restructure, Section 1 ·
 * C115 §10 `C115-87`/`C115-88` · C115-17 · L-13315)
 *
 * The buildable envelope's SUMMARY (provenance badge · four ceilings · caveats · source line) is shown
 * in question 1 of the Parcel Law / SITE panel, while the envelope card keeps its Stage-02/03 folds in
 * question 2. These arms pin the three things that make that a MOVE and not a copy:
 *
 *   ARM A — ONE ARBITER. The summary claim and the SHOW ON THE PLOT claim are two jobs of one keyed
 *           arbiter: independent, self-healing, last-claimer-wins, release guarded on identity.
 *   ARM B — THE SATELLITE. Every card arm publishes into it: the FULL arm's figures arrive as REAL,
 *           WIRED highlight controls (rule 2 survives the move); the other arms state, in one line,
 *           why there is no summary here — never a blank, never a stale figure.
 *   ARM C — THE CARD'S SIDE, READ FROM ITS SOURCE (the card is a ~20k-line closure no spec can mount):
 *           every arm and the card-removal path publish; the full arm asks whether the job is TAKEN;
 *           the headline producer is still called exactly once; the badge testid is the constant's.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    claimEnvelopeSummary,
    envelopeSummaryArm,
    envelopeSummaryClaimed,
    getEnvelopeSummaryElement,
    publishEnvelopeSummary,
    releaseEnvelopeSummary,
    __resetEnvelopeSummaryHostForTests,
    ENVELOPE_SUMMARY_ARM_ATTR,
    ENVELOPE_SUMMARY_ARM_TEXT,
    ENVELOPE_SUMMARY_BADGE_TESTID,
    ENVELOPE_SUMMARY_NOTE_TESTID,
    ENVELOPE_SUMMARY_RELOCATED_HTML,
    ENVELOPE_SUMMARY_RELOCATED_TESTID,
    ENVELOPE_SUMMARY_TESTID,
} from '../envelopeSummaryHost';
import {
    envelopeCardJobClaimed,
    subscribeEnvelopeCardJobHost,
    __resetEnvelopeCardJobHostForTests,
} from '../envelopeCardJobHost';
import {
    claimPlotDisplayControls,
    plotDisplayControlsClaimed,
    releasePlotDisplayControls,
} from '../plotDisplayControlsHost';
import { buildCeilingHeadlineHtml, CEILING_HEADLINE_TESTID } from '../ceilingHeadlineSection';
import { describeSiteHighlightAvailability, getSiteHighlight } from '../siteGeometryHighlight';

const AVAIL = describeSiteHighlightAvailability({
    parcelRingLength: 4,
    edgeClassifications: ['front', 'side', 'rear', 'side'],
    footprintRingLength: 3,
    maxHeightM: 22.4,
    gfaM2: 2711,
});

/** The card's full-arm satellite markup, shaped exactly as `GISAreaLayout` builds it. */
function fullSummaryHtml(): string {
    return `<div><span>Buildable envelope</span><span data-testid="${ENVELOPE_SUMMARY_BADGE_TESTID}"><span>Estimated</span></span></div>`
        + buildCeilingHeadlineHtml({ maxFloors: 6, maxHeightM: 22.4, footprintM2: 452, gfaM2: 2711, avail: AVAIL, active: null });
}

beforeEach(() => {
    __resetEnvelopeSummaryHostForTests();
    __resetEnvelopeCardJobHostForTests();
    document.body.replaceChildren();
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('ARM A — one keyed arbiter: the two card jobs are independent, self-healing and identity-guarded', () => {
    it('claiming the summary seats the satellite in the host and marks ONLY that job taken', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        claimEnvelopeSummary(host, 'spec:q1');
        expect(envelopeSummaryClaimed()).toBe(true);
        expect(host.querySelector(`[data-testid="${ENVELOPE_SUMMARY_TESTID}"]`)).toBe(getEnvelopeSummaryElement());
        // ⛔ The OTHER job is untouched — one arbiter, two independent claims.
        expect(plotDisplayControlsClaimed()).toBe(false);
    });

    it('⛔ a release by a surface that does NOT hold the job evicts nobody (C19 §5.7 clause 2)', () => {
        const a = document.createElement('div');
        const b = document.createElement('div');
        document.body.append(a, b);
        claimEnvelopeSummary(a, 'spec:a');
        claimEnvelopeSummary(b, 'spec:b'); // last claimer wins
        releaseEnvelopeSummary(a);          // a is no longer the claimant — must not release b's claim
        expect(envelopeSummaryClaimed()).toBe(true);
        expect(b.contains(getEnvelopeSummaryElement())).toBe(true);
        releaseEnvelopeSummary(b);
        expect(envelopeSummaryClaimed()).toBe(false);
        // The satellite leaves the host that released it — no orphan copy of the card's figures.
        expect(b.contains(getEnvelopeSummaryElement())).toBe(false);
    });

    it('⭐ self-heals: a claimant that left the document without releasing is not a claim', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        claimEnvelopeSummary(host, 'spec:torn-down');
        host.remove(); // a teardown that never reached dispose()
        expect(envelopeCardJobClaimed('envelope-summary')).toBe(false);
    });

    it('the SHOW ON THE PLOT wrapper keeps its API and its semantics over the shared arbiter', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const heard: string[] = [];
        const off = subscribeEnvelopeCardJobHost(() => heard.push('change'));
        claimPlotDisplayControls(host, 'spec:plot-display');
        expect(plotDisplayControlsClaimed()).toBe(true);
        expect(envelopeSummaryClaimed()).toBe(false);
        releasePlotDisplayControls(host);
        expect(plotDisplayControlsClaimed()).toBe(false);
        // The card's host is notified on EITHER job's change — it must repaint for both.
        expect(heard.length).toBe(2);
        off();
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('ARM B — the satellite: every arm is stated, and the full arm keeps rule 2', () => {
    it('⭐ the FULL arm arrives as the card wrote it — four ceiling rows, and three of them are WIRED controls', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        claimEnvelopeSummary(host, 'spec:q1');
        publishEnvelopeSummary({ arm: 'full', safeHtml: fullSummaryHtml() });

        const sat = getEnvelopeSummaryElement();
        expect(sat.getAttribute(ENVELOPE_SUMMARY_ARM_ATTR)).toBe('full');
        expect(envelopeSummaryArm()).toBe('full');
        expect(sat.querySelector(`[data-testid="${CEILING_HEADLINE_TESTID}"]`)).not.toBeNull();
        expect(sat.querySelectorAll('[data-ceiling]')).toHaveLength(4);
        expect(sat.querySelector(`[data-testid="${ENVELOPE_SUMMARY_BADGE_TESTID}"]`)!.textContent).toContain('Estimated');

        // ⛔ RULE 2 SURVIVES THE MOVE (C115-116): the height row is still a control, it is WIRED where
        // it now lives, and following it writes the ONE store every view paints from.
        const heightBtn = [...sat.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('Maximum height'));
        expect(heightBtn, 'Maximum height became plain text on the way to question 1').toBeDefined();
        heightBtn!.click();
        expect(getSiteHighlight()).toBe('height');
        heightBtn!.click(); // toggle back off — leave the one store as we found it
    });

    for (const arm of ['absence', 'refusal', 'reduced', 'not-rendered'] as const) {
        it(`the ${arm.toUpperCase()} arm states, in one line, why there is no summary here — and keeps no stale figure`, () => {
            const host = document.createElement('div');
            document.body.appendChild(host);
            claimEnvelopeSummary(host, 'spec:q1');
            publishEnvelopeSummary({ arm: 'full', safeHtml: fullSummaryHtml() });
            publishEnvelopeSummary({ arm });
            const sat = getEnvelopeSummaryElement();
            expect(sat.getAttribute(ENVELOPE_SUMMARY_ARM_ATTR)).toBe(arm);
            expect(sat.querySelector(`[data-testid="${ENVELOPE_SUMMARY_NOTE_TESTID}"]`)!.textContent)
                .toBe(ENVELOPE_SUMMARY_ARM_TEXT[arm]);
            // ⛔ The previous pass's figures are GONE — a stale ceiling under a refusal would be a lie.
            expect(sat.querySelectorAll('[data-ceiling]')).toHaveLength(0);
        });
    }

    it('a satellite nobody has published into yet says "not rendered" — never an empty box', () => {
        const sat = getEnvelopeSummaryElement();
        expect(sat.getAttribute(ENVELOPE_SUMMARY_ARM_ATTR)).toBe('not-rendered');
        expect(sat.textContent).toBe(ENVELOPE_SUMMARY_ARM_TEXT['not-rendered']);
    });

    it('C115-17 — the stamp the card leaves behind names the destination and carries the machine-readable half', () => {
        const box = document.createElement('div');
        box.innerHTML = ENVELOPE_SUMMARY_RELOCATED_HTML;
        const stamp = box.querySelector(`[data-testid="${ENVELOPE_SUMMARY_RELOCATED_TESTID}"]`)!;
        expect(stamp.getAttribute('data-relocated-to')).toBe('plot');
        expect(stamp.textContent).toContain('What is this plot — and what can I build here?');
        expect(stamp.textContent).toContain('Nothing was removed');
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('ARM C — the card publishes on EVERY arm and asks only whether the job is TAKEN (source read)', () => {
    const card = readFileSync(resolve(__dirname, '../../layout/GISAreaLayout.ts'), 'utf8');

    it('all four render arms and the card-removal path publish into the satellite', () => {
        for (const arm of ['full', 'absence', 'refusal', 'reduced', 'not-rendered']) {
            expect(card, `the card never publishes the "${arm}" arm`).toMatch(new RegExp(`publishEnvelopeSummary\\(\\{ arm: '${arm}'`));
        }
    });

    it('⛔ C115-88 clause 1 — the full arm asks whether the job is TAKEN, never which host it is in', () => {
        expect(card).toContain('const summaryClaimed = envelopeSummaryClaimed();');
        expect(card).toContain('${summaryClaimed ? safeSummaryRelocatedStamp : safeSummaryBody}');
        // …and the badge leaves the header WITH the figures it grades (C58 §1.2).
        expect(card).toContain("${summaryClaimed ? '' : safeBadge}");
    });

    it('⛔ C115-88 clause 2 — still ONE headline producer, called once: the move copied nothing', () => {
        expect((card.match(/buildCeilingHeadlineHtml\(/g) ?? []).length).toBe(1);
    });

    it('the badge wrapper the card writes carries the testid question 1\'s digest reads', () => {
        expect(card).toContain(`data-testid="${ENVELOPE_SUMMARY_BADGE_TESTID}"`);
    });
});
