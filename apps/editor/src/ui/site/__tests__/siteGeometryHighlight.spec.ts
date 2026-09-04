/**
 * §RESI-ORCH-HIGHLIGHT (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §3) — "click a NUMBER, light the
 * GEOMETRY", and the honesty rules that make it safe.
 *
 * ⭐ WHAT THESE ARMS ARE FOR, stated so nobody weakens them later. A suite that only proved
 * "six subjects exist and a store toggles" would pass just as happily over the two failures this
 * binding is actually exposed to:
 *
 *   1. A ROW THAT IS CLICKABLE WITH NOTHING TO POINT AT. A dead click is indistinguishable from
 *      a broken product AND from "we looked and there is nothing there" — the
 *      §CONTEXT-DATA-HONESTY conflation (failure and emptiness rendering as one value) wearing an
 *      affordance. So availability is asserted per subject, and the FRONTAGE arms are asserted
 *      THREE ways: unrecorded ≠ landlocked ≠ n > 0. Collapsing the first two is precisely the lie
 *      `parcelEdgeClassificationDetermination.ts` exists to prevent, and a `?? []` at the call
 *      site would silently re-introduce it — so an arm here passes `undefined` and demands the
 *      "missing measurement" wording rather than the "landlocked" wording.
 *
 *   2. EMPHASIS THAT STRENGTHENS A CLAIM. The envelope's hue and fill alpha ARE its honesty
 *      signal (confident violet · provisional grey · suggested amber · study teal; near-wireframe
 *      for an upper bound). Brightening a provisional solid to "highlight" it would make an
 *      ESTIMATE read as a DETERMINATION — the §L-616 overstatement, re-introduced by a UI
 *      affordance rather than by a rule pack. So the emphasis rule is asserted as a total table
 *      (every subject × every role) and the recede factor is asserted to be a MULTIPLIER strictly
 *      inside (0, 1): a fixed target alpha could make a near-wireframe shell DENSER while it
 *      recedes than it was authored.
 */

import { describe, it, expect, afterEach } from 'vitest';

import {
    SITE_HIGHLIGHT_SUBJECTS,
    SITE_HIGHLIGHT_MEANING,
    SITE_HIGHLIGHT_ATTR,
    SITE_HIGHLIGHT_RECEDE_FACTOR,
    describeSiteHighlightAvailability,
    siteHighlightCue,
    siteHighlightEmphasis,
    getSiteHighlight,
    setSiteHighlight,
    toggleSiteHighlight,
    subscribeSiteHighlight,
    __resetSiteHighlightForTests,
    type SiteHighlightSubject,
    type SiteHighlightRole,
    type SiteHighlightInputs,
} from '../siteGeometryHighlight';

afterEach(() => {
    __resetSiteHighlightForTests();
});

/** A parcel that has everything: a ring, classified edges with one frontage, a solved inset,
 *  a derived height and a derived GFA. Every arm below removes exactly one of those. */
const COMPLETE: SiteHighlightInputs = {
    parcelRingLength: 4,
    edgeClassifications: ['front', 'side', 'back', 'side'],
    footprintRingLength: 4,
    maxHeightM: 16,
    gfaM2: 420,
};

describe('§RESI-ORCH-HIGHLIGHT — availability: a row may only be clickable when it has geometry', () => {
    it('makes all six clickable on a fully determined parcel', () => {
        const a = describeSiteHighlightAvailability(COMPLETE);
        for (const s of SITE_HIGHLIGHT_SUBJECTS) {
            expect(a[s].available, `${s} should be available`).toBe(true);
        }
    });

    it('states a non-empty reason on BOTH arms — an available row says what will light up', () => {
        const yes = describeSiteHighlightAvailability(COMPLETE);
        const no = describeSiteHighlightAvailability({
            parcelRingLength: 0,
            edgeClassifications: undefined,
            footprintRingLength: 0,
            maxHeightM: null,
            gfaM2: null,
        });
        for (const s of SITE_HIGHLIGHT_SUBJECTS) {
            expect(yes[s].reason.length, `${s} available reason`).toBeGreaterThan(0);
            expect(no[s].reason.length, `${s} unavailable reason`).toBeGreaterThan(0);
        }
    });

    it('turns EVERY subject off when there is no committed parcel ring', () => {
        const a = describeSiteHighlightAvailability({
            ...COMPLETE,
            parcelRingLength: 2, // degenerate: fewer than three vertices is not a plot
            footprintRingLength: 0,
        });
        for (const s of SITE_HIGHLIGHT_SUBJECTS) {
            expect(a[s].available, `${s}`).toBe(false);
        }
    });

    // ── THE THREE FRONTAGE ARMS. This is the sharpest case and the reason the module exists. ──

    it('frontage — NOT RECORDED reads as a missing measurement, never as a finding', () => {
        const a = describeSiteHighlightAvailability({ ...COMPLETE, edgeClassifications: undefined });
        expect(a.frontage.available).toBe(false);
        expect(a.frontage.reason).toMatch(/missing measurement/i);
        expect(a.frontage.reason).not.toMatch(/landlocked/i);
    });

    it('frontage — CLASSIFIED-AND-LANDLOCKED reads as a real finding, never as a gap', () => {
        const a = describeSiteHighlightAvailability({
            ...COMPLETE,
            edgeClassifications: ['side', 'side', 'back', 'side'],
        });
        expect(a.frontage.available).toBe(false);
        expect(a.frontage.reason).toMatch(/landlocked/i);
        expect(a.frontage.reason).not.toMatch(/missing measurement/i);
    });

    it('frontage — the two unavailable arms do NOT share a sentence', () => {
        const unrecorded = describeSiteHighlightAvailability({
            ...COMPLETE,
            edgeClassifications: null,
        }).frontage.reason;
        const landlocked = describeSiteHighlightAvailability({
            ...COMPLETE,
            edgeClassifications: ['side', 'side', 'side', 'side'],
        }).frontage.reason;
        expect(unrecorded).not.toBe(landlocked);
    });

    it('frontage — a WRONG-LENGTH array is unrecorded, not landlocked (the schema `[]` default)', () => {
        // `ParcelBoundarySchema` DEFAULTS `edgeClassifications` to `[]`, so a committed,
        // never-classified parcel carries an empty array against a non-empty polygon. Reading that
        // as "examined, no frontage" is the same defect one notch deeper.
        const a = describeSiteHighlightAvailability({ ...COMPLETE, edgeClassifications: [] });
        expect(a.frontage.available).toBe(false);
        expect(a.frontage.reason).toMatch(/missing measurement/i);
    });

    it('height — refuses to be clickable when the rule pack derived no maximum height', () => {
        const a = describeSiteHighlightAvailability({ ...COMPLETE, maxHeightM: null });
        expect(a.height.available).toBe(false);
        // The whole point: a plane at a guessed height is indistinguishable from a published one.
        expect(a.height.reason).toMatch(/guessed/i);
        // …and the other five are untouched by a missing height.
        expect(a.parcel.available).toBe(true);
        expect(a.footprint.available).toBe(true);
        expect(a.gfa.available).toBe(true);
    });

    it('gfa — refuses to be clickable when the storey count was never derived', () => {
        const a = describeSiteHighlightAvailability({ ...COMPLETE, gfaM2: null });
        expect(a.gfa.available).toBe(false);
        expect(a.gfa.reason).toMatch(/storey count/i);
        expect(a.footprint.available).toBe(true);
    });

    it('footprint — a parcel with no solved inset ring keeps its parcel + boundary rows live', () => {
        const a = describeSiteHighlightAvailability({ ...COMPLETE, footprintRingLength: 0 });
        expect(a.footprint.available).toBe(false);
        expect(a.height.available).toBe(false);
        expect(a.gfa.available).toBe(false);
        expect(a.parcel.available).toBe(true);
        expect(a.boundary.available).toBe(true);
        expect(a.frontage.available).toBe(true);
    });

    it('is total — never throws on garbage input', () => {
        expect(() =>
            describeSiteHighlightAvailability({
                parcelRingLength: Number.NaN,
                edgeClassifications: { nope: true },
                footprintRingLength: -1,
                maxHeightM: 0,
                gfaM2: 0,
            }),
        ).not.toThrow();
    });
});

describe('§RESI-ORCH-HIGHLIGHT — the emphasis rule: emphasis may never strengthen a claim', () => {
    const ROLES: readonly SiteHighlightRole[] = [
        'parcel-line',
        'parcel-fill',
        'envelope-volume',
        'study-volume',
        'proposal',
        'cue',
    ];

    it('recedes by a MULTIPLIER strictly inside (0, 1) — never a target alpha', () => {
        expect(SITE_HIGHLIGHT_RECEDE_FACTOR).toBeGreaterThan(0);
        expect(SITE_HIGHLIGHT_RECEDE_FACTOR).toBeLessThan(1);
    });

    it('is total — every subject × role pair decides, and only ever to two values', () => {
        for (const s of SITE_HIGHLIGHT_SUBJECTS) {
            for (const r of ROLES) {
                expect(['subject', 'recede'], `${s}/${r}`).toContain(siteHighlightEmphasis(s, r));
            }
        }
    });

    it('never recedes a CUE — geometry that exists only to answer a highlight IS the answer', () => {
        for (const s of SITE_HIGHLIGHT_SUBJECTS) {
            expect(siteHighlightEmphasis(s, 'cue'), `${s}`).toBe('subject');
        }
    });

    it('Area lights the plot as one thing; Perimeter lights the ring ALONE', () => {
        // A length is measured ALONG a line, so the fill is not part of the perimeter's answer.
        expect(siteHighlightEmphasis('parcel', 'parcel-fill')).toBe('subject');
        expect(siteHighlightEmphasis('parcel', 'parcel-line')).toBe('subject');
        expect(siteHighlightEmphasis('boundary', 'parcel-line')).toBe('subject');
        expect(siteHighlightEmphasis('boundary', 'parcel-fill')).toBe('recede');
    });

    it('GFA lights whichever massing is drawn — plan-backed OR study, never the parcel', () => {
        expect(siteHighlightEmphasis('gfa', 'envelope-volume')).toBe('subject');
        expect(siteHighlightEmphasis('gfa', 'study-volume')).toBe('subject');
        expect(siteHighlightEmphasis('gfa', 'parcel-fill')).toBe('recede');
        expect(siteHighlightEmphasis('gfa', 'parcel-line')).toBe('recede');
    });

    it('the three CONSTRUCTED subjects recede every authored surface', () => {
        // frontage / footprint / height are answered by a cue the renderer builds; if the cue
        // cannot be built nothing is emphasised, which is the honest outcome — never "light the
        // parcel instead", because the reader could not tell that was a substitution.
        for (const s of ['frontage', 'footprint', 'height'] as const) {
            for (const r of ROLES.filter((x) => x !== 'cue')) {
                expect(siteHighlightEmphasis(s, r), `${s}/${r}`).toBe('recede');
            }
        }
    });

    it('never lets the USER PROPOSAL answer a question about the parcel or the law', () => {
        // §RESI-ORCH-TARGET-AREA — all six subjects are facts about the parcel or the ordinance.
        // None of them describes what the user asked for, so lighting the user's own plate when
        // they click "Max footprint" would answer a question about the law with a picture of a wish.
        for (const s of SITE_HIGHLIGHT_SUBJECTS) {
            expect(siteHighlightEmphasis(s, 'proposal'), s).toBe('recede');
        }
    });

    it('every subject has at least one role or cue that answers it — no subject is inert', () => {
        for (const s of SITE_HIGHLIGHT_SUBJECTS) {
            const answeredByEmphasis = ROLES.some(
                (r) => r !== 'cue' && siteHighlightEmphasis(s, r) === 'subject',
            );
            const answeredByCue = siteHighlightCue(s) !== null;
            expect(answeredByEmphasis || answeredByCue, `${s} is inert`).toBe(true);
        }
    });

    it('maps exactly the three constructed subjects to a cue, and the other three to none', () => {
        expect(siteHighlightCue('frontage')).toBe('front-edges');
        expect(siteHighlightCue('footprint')).toBe('inset-ring');
        expect(siteHighlightCue('height')).toBe('limit-plane');
        expect(siteHighlightCue('parcel')).toBeNull();
        expect(siteHighlightCue('boundary')).toBeNull();
        expect(siteHighlightCue('gfa')).toBeNull();
    });
});

describe('§RESI-ORCH-HIGHLIGHT — the store: push, not poll', () => {
    it('rests at null so nothing is emphasised until a user asks', () => {
        expect(getSiteHighlight()).toBeNull();
    });

    it('notifies subscribers on a change and NOT on an idempotent re-assert', () => {
        let calls = 0;
        const off = subscribeSiteHighlight(() => { calls += 1; });
        setSiteHighlight('parcel');
        expect(calls).toBe(1);
        setSiteHighlight('parcel');
        expect(calls).toBe(1); // a repaint costs a scene rebuild; unchanged must stay free
        setSiteHighlight('gfa');
        expect(calls).toBe(2);
        off();
        setSiteHighlight(null);
        expect(calls).toBe(2); // unsubscribed
    });

    it('toggles the same subject back to null — click again to clear', () => {
        expect(toggleSiteHighlight('height')).toBe('height');
        expect(getSiteHighlight()).toBe('height');
        expect(toggleSiteHighlight('height')).toBeNull();
        expect(getSiteHighlight()).toBeNull();
    });

    it('switches subject rather than accumulating — only one thing is emphasised at a time', () => {
        toggleSiteHighlight('footprint');
        expect(toggleSiteHighlight('frontage')).toBe('frontage');
        expect(getSiteHighlight()).toBe('frontage');
    });

    it('survives a throwing subscriber — a highlight is a reading aid, not a critical path', () => {
        const seen: string[] = [];
        subscribeSiteHighlight(() => { throw new Error('boom'); });
        subscribeSiteHighlight(() => { seen.push('second ran'); });
        expect(() => setSiteHighlight('boundary')).not.toThrow();
        expect(seen).toEqual(['second ran']);
    });
});

describe('§RESI-ORCH-HIGHLIGHT — the shared vocabulary', () => {
    it('enumerates all six subjects exactly once', () => {
        expect(SITE_HIGHLIGHT_SUBJECTS).toHaveLength(6);
        expect(new Set(SITE_HIGHLIGHT_SUBJECTS).size).toBe(6);
    });

    it('gives every subject a physical meaning — STR §3’s "what does this number mean?"', () => {
        for (const s of SITE_HIGHLIGHT_SUBJECTS) {
            const meaning: string = SITE_HIGHLIGHT_MEANING[s as SiteHighlightSubject];
            expect(meaning.length, `${s}`).toBeGreaterThan(20);
            expect(meaning.toLowerCase()).toContain('lights');
        }
    });

    it('names ONE DOM attribute, so the card and its wiring cannot disagree', () => {
        expect(SITE_HIGHLIGHT_ATTR).toBe('data-site-highlight');
    });
});
