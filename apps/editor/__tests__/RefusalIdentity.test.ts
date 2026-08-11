// §REFUSAL-IDENTITY (C58 §1.13, ADR-0269, ADR-0279 BLOCKER-1) — THE PROBE.
//
// C58 §1.13 makes a refusal a first-class, CITED answer: `BuildableEnvelope.refusal`
// carries a `code` over a CLOSED union, so "the ordinance grants no envelope here",
// "PRYZM has not encoded this zone" and "the fetch failed" are three different values
// the user can tell apart. §1.13.8 restates it at the fetch seam: the resolver's
// distinction MUST REACH THE CARD.
//
// This suite asserts that same invariant on the refusal surfaces OUTSIDE the envelope
// schema. Every assertion is on the RENDERED OUTPUT — the HTML/text a user actually
// reads — not on the existence of a field in a type. A `kind` that reaches a variable
// and dies before the DOM is exactly the defect: the layer that KNOWS is not the layer
// that REPORTS.
//
// Rule: no test here may pass because a union member exists. It passes only when the
// member's own identity is legible in what is rendered.

import { describe, it, expect } from 'vitest';

import {
    checkMaxHeightGate,
    maxHeightRefusalText,
    MAX_HEIGHT_REFUSAL_CODES,
} from '../src/ui/generation/maxHeightGate.js';
import { buildCapacitySectionHtml } from '../src/ui/site/capacityPanelSection.js';
import { UNMEASURED_REASON_TEXT } from '../src/ui/site/designMeasurement.js';
import type { DesignMeasurement, UnmeasuredReason } from '../src/ui/site/designMeasurement.js';
import type { CapacityComparison } from '@pryzm/site-parcel-data';
import {
    friendlyResidentialError,
    buildResidentialErrorModalHtml,
} from '../src/ui/residential-building/residentialError.js';
import {
    resolveFacadeStudySubject,
    facadeRefusalBadgeText,
    FACADE_STUDY_REFUSAL_CODES,
} from '../src/ui/geospatial/facadeStudySubject.js';
import { validationFailureText } from '../src/ui/ai/proposalRefusalText.js';

// ─────────────────────────────────────────────────────────────────────────────
// CLASS B-1 — `maxHeightGate`: an ORDINANCE-GROUNDED refusal that was
// unattributable BY CONSTRUCTION (no `code` field at all).
// ─────────────────────────────────────────────────────────────────────────────
describe('§GEN-MAXHEIGHT-GATE refusal carries its identity (C58 §1.13.1)', () => {
    it('the refusal arm carries a code from a CLOSED union', () => {
        const out = checkMaxHeightGate({ floors: 10, floorToFloorM: 3, maxHeightM: 25.75 });
        expect(out.ok).toBe(false);
        if (out.ok) throw new Error('unreachable');
        expect(MAX_HEIGHT_REFUSAL_CODES).toContain(out.code);
    });

    it('the gate\'s TWO real branches get TWO DIFFERENT codes', () => {
        // Branch 1: a reduced storey count would fit (`maxFeasibleFloors > 0`).
        const fits = checkMaxHeightGate({ floors: 10, floorToFloorM: 3, maxHeightM: 25.75 });
        // Branch 2: not even one floor fits (`maxFeasibleFloors === 0`).
        const none = checkMaxHeightGate({ floors: 1, floorToFloorM: 3, maxHeightM: 0 });
        if (fits.ok || none.ok) throw new Error('both inputs must refuse');
        expect(fits.maxFeasibleFloors).toBeGreaterThan(0);
        expect(none.maxFeasibleFloors).toBe(0);
        expect(fits.code).not.toBe(none.code);
    });

    it('the RENDERED refusal text names the code — not just the numbers', () => {
        const out = checkMaxHeightGate({ floors: 10, floorToFloorM: 3, maxHeightM: 25.75 });
        if (out.ok) throw new Error('unreachable');
        const rendered = maxHeightRefusalText(out);
        expect(rendered).toContain(out.code);
        // …and still quotes BOTH numbers (the pre-existing §GEN-MAXHEIGHT-GATE promise).
        expect(rendered).toContain('25.75');
        expect(rendered).toContain('30');
    });

    it('the two branches RENDER distinguishably (a user can tell them apart)', () => {
        const fits = checkMaxHeightGate({ floors: 10, floorToFloorM: 3, maxHeightM: 25.75 });
        const none = checkMaxHeightGate({ floors: 1, floorToFloorM: 3, maxHeightM: 0 });
        if (fits.ok || none.ok) throw new Error('unreachable');
        const a = maxHeightRefusalText(fits);
        const b = maxHeightRefusalText(none);
        expect(a).not.toBe(b);
        expect(a).toContain(fits.code);
        expect(b).toContain(none.code);
        expect(a).not.toContain(none.code);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// CLASS A-1 — capacity panel: `UnmeasuredReason` (10 members) rendered as prose
// only, on an element that already carries `data-metric` / `data-status`.
// ─────────────────────────────────────────────────────────────────────────────
describe('capacity panel renders the UnmeasuredReason IDENTITY (C58 §1.13)', () => {
    const REASONS = Object.keys(UNMEASURED_REASON_TEXT) as UnmeasuredReason[];

    // Asserted through the PUBLIC render — `buildCapacitySectionHtml` is exactly what the
    // site panel calls, so this is the HTML the user's browser receives.
    const heightComparison = (proposed: number | null): CapacityComparison => ({
        rows: [{
            metric: 'height', label: 'Height', localTerm: 'altura reguladora', unit: 'm',
            proposed, permitted: 20,
            remaining: proposed === null ? null : 20 - proposed,
            utilisationPct: proposed === null ? null : (proposed / 20) * 100,
            status: proposed === null ? 'unknown' : 'within',
        }],
        basis: 'structured', isIndicativeOnly: false,
        overCount: 0, unknownCount: proposed === null ? 1 : 0,
        allJudgedWithin: proposed !== null,
    } as CapacityComparison);

    const measurementWith = (reason: UnmeasuredReason | null): DesignMeasurement => ({
        design: { footprintM2: null, grossFloorAreaM2: null, netFloorAreaM2: null, heightM: null, floors: null },
        unmeasured: {
            footprintM2: null, grossFloorAreaM2: null, netFloorAreaM2: null,
            heightM: reason, floors: null,
        },
        caveats: [],
        designedStoreyCount: 1,
    } as DesignMeasurement);

    it('every unmeasured reason reaches the DOM as data-unmeasured-reason', () => {
        for (const reason of REASONS) {
            const html = buildCapacitySectionHtml(heightComparison(null), measurementWith(reason));
            expect(html).toContain(`data-unmeasured-reason="${reason}"`);
        }
    });

    it('a MEASURED row carries no refusal identity (failure ≠ emptiness)', () => {
        const html = buildCapacitySectionHtml(heightComparison(12), measurementWith(null));
        expect(html).not.toContain('data-unmeasured-reason');
    });

    it('two DIFFERENT reasons produce two DIFFERENT rendered identities', () => {
        const a = buildCapacitySectionHtml(heightComparison(null), measurementWith('no-levels'));
        const b = buildCapacitySectionHtml(heightComparison(null), measurementWith('no-storey-height'));
        expect(a).toContain('data-unmeasured-reason="no-levels"');
        expect(b).toContain('data-unmeasured-reason="no-storey-height"');
        expect(a).not.toContain('data-unmeasured-reason="no-storey-height"');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// CLASS A-2 — residential error modal: a 7-member `kind` union used ONLY to pick
// a glyph that collapses 6 of 7 onto `⚠` (and is `aria-hidden`, so a screen
// reader gets nothing at all).
// ─────────────────────────────────────────────────────────────────────────────
describe('residential refusal modal renders its `kind` (C58 §1.13)', () => {
    const CASES: ReadonlyArray<readonly [string, string]> = [
        ['plate is too narrow: the buildable plate measures 9 m across its short side; needs at least 14 m', 'too-narrow'],
        ['building height exceeds the permitted envelope: the envelope here allows 12 m', 'exceeds-height'],
        ['all 4 apartment cell(s) failed to lay out', 'no-apartments'],
        ['level 1 partition placed zero apartments on a 10 m × 40 m plate', 'too-small'],
        ['footprint is degenerate (zero-area plate)', 'degenerate'],
        ["core doesn't fit inside the plate", 'core-too-large'],
        ['the solver gave up', 'generic'],
    ];

    it('all seven kinds reach the DOM as data-refusal-kind', () => {
        const seen = new Set<string>();
        for (const [reason, kind] of CASES) {
            const err = friendlyResidentialError(reason, 674);
            expect(err.kind).toBe(kind);
            const html = buildResidentialErrorModalHtml(err);
            expect(html).toContain(`data-refusal-kind="${kind}"`);
            seen.add(kind);
        }
        expect(seen.size).toBe(7);
    });

    it('the notice is not the ONLY carrier — six kinds must not collapse onto one glyph', () => {
        const glyphs = new Set(
            CASES.map(([reason]) => {
                const html = buildResidentialErrorModalHtml(friendlyResidentialError(reason, 674));
                return /class="alm-notice-icon"[^>]*>([^<]*)</.exec(html)?.[1] ?? '';
            }),
        );
        // Before the fix this was 2 ('⬚' and '⚠'). A 7-member union deserves better
        // than a 2-valued render, and the glyph is aria-hidden either way — which is
        // precisely why `data-refusal-kind` is the load-bearing carrier.
        expect(glyphs.size).toBeGreaterThanOrEqual(4);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// CLASS B-2 — façade study subject: three distinct refusals, one untyped
// `reason: string`. §ENVELOPE-NO-FABRICATED-HEIGHT is named in a comment and
// never in the badge.
// ─────────────────────────────────────────────────────────────────────────────
describe('§FACADE-STUDY-SUBJECT refusals carry a closed code (C58 §1.13)', () => {
    const noBuilding = () => resolveFacadeStudySubject({ subject: 'building', envelope: null, hasBuildingRing: false });
    const noEnvelope = () => resolveFacadeStudySubject({ subject: 'envelope', envelope: null, hasBuildingRing: true });
    const noHeight = () => resolveFacadeStudySubject({
        subject: 'envelope',
        envelope: { ring: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }], maxHeightM: null },
        hasBuildingRing: true,
    });

    it('each of the THREE refusal branches carries a DISTINCT code from the closed union', () => {
        const codes = [noBuilding(), noEnvelope(), noHeight()].map(r => {
            if (r.status !== 'refused') throw new Error('expected a refusal');
            expect(FACADE_STUDY_REFUSAL_CODES).toContain(r.code);
            return r.code;
        });
        expect(new Set(codes).size).toBe(3);
    });

    it('the RENDERED badge names the code — §ENVELOPE-NO-FABRICATED-HEIGHT reaches the screen', () => {
        const r = noHeight();
        if (r.status !== 'refused') throw new Error('expected a refusal');
        const badge = facadeRefusalBadgeText(r);
        expect(badge).toContain(r.code);
        expect(badge).toContain(r.reason);
    });

    it('two different refusals render two different badges', () => {
        const a = noBuilding(); const b = noEnvelope();
        if (a.status !== 'refused' || b.status !== 'refused') throw new Error('unreachable');
        expect(facadeRefusalBadgeText(a)).not.toBe(facadeRefusalBadgeText(b));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// CLASS A-5 — ValidatePanel / AIPanel: `{ok, reason?}` with `|| 'Validation
// failed'`, MANUFACTURING a generic "no" out of an absent reason.
// ─────────────────────────────────────────────────────────────────────────────
describe('proposal validation failure is never MANUFACTURED (C58 §1.13, doctrine 2)', () => {
    it('a stated reason is rendered verbatim, under the command type that produced it', () => {
        const txt = validationFailureText({ ok: false, reason: 'wall would overlap an opening' }, 'wall.create');
        expect(txt).toContain('wall would overlap an opening');
        expect(txt).toContain('wall.create');
    });

    it('an ABSENT reason does NOT become the sentence "Validation failed"', () => {
        const txt = validationFailureText({ ok: false }, 'wall.create');
        expect(txt).not.toBe('Validation failed');
        expect(txt).not.toBe('Validation failed — cannot approve');
    });

    it('an ABSENT reason still carries the identity that DOES exist — the command type', () => {
        const txt = validationFailureText({ ok: false }, 'stair.create');
        expect(txt).toContain('stair.create');
        // …and says plainly that no reason was stated, rather than inventing one.
        expect(txt.toLowerCase()).toContain('stated no reason');
    });

    it('a stated reason and an absent reason are NEVER the same value (failure ≠ emptiness)', () => {
        expect(validationFailureText({ ok: false, reason: 'x' }, 'wall.create'))
            .not.toBe(validationFailureText({ ok: false }, 'wall.create'));
    });
});
