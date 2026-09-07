// §26.6.7 (L-13085) — THE VERIFICATION `c8c62c51` SAID IT HAD NOT DONE.
//
// The founder ruled on 2026-09-07 that the four named ceilings — `Maximum levels` ·
// `Maximum height` · `Maximum implantation area` · `Maximum buildable area` — be LIFTED out of the
// buildable-envelope card's *Full site & massing data* fold and into its HEADLINE. `c8c62c51`
// implemented it and said so in its own message: *"NOT VERIFIED HERE: that the lifted figures keep
// their rule-2 behaviour — these are CONTROLS that paint on all three views, and a figure that
// becomes plain text in the headline is a rule-2 regression."*
//
// ⭐ THE ANSWER IS: RULE 2 SURVIVED THE LIFT. This suite is what makes that answer re-checkable
// rather than a reading of a diff, and it asserts four things the eye cannot:
//
//   1. **Rule 1 — ONE FIGURE, ONE PLACE.** Each of the four renders EXACTLY ONCE in the mounted
//      headline, and `GISAreaLayout.ts` names none of them a second time. Lifting without removing
//      re-creates the precise duplication rule 1 exists to end, one edit after applying the rule.
//   2. **Rule 2 — EVERY FIGURE IS A HYPERLINK.** Three of the four come back as REAL buttons
//      carrying their REAL subjects, and a click writes the ONE store the views paint from. The
//      fourth (`Maximum levels`) is deliberately NOT a control — there is no geometry for "storeys"
//      to light, and a dead click is indistinguishable from a broken product.
//   3. **It paints on all three views** — BIM 3D, 3D Site and the 2D map each answer all three
//      subjects, and each registers itself so the row can SAY where the click will show.
//   4. **The absence arms survive.** A ceiling the rule pack did not derive prints `not derived` —
//      never a blank, never a zero, and never silently dropped so the headline shows three of four
//      (C58 §1.13 · L-13048: the absence is a card, not a deletion).
//
// ⚠ WHY THIS SUITE EXISTS AT ALL, RATHER THAN MORE SOURCE PINS. Until this lane the headline was
// assembled inside `buildSiteDataBlock`, an arrow function in `mountGISArea` — a ~5,500-line
// closure no spec can render — so the strongest available check was a grep of the card's source for
// the SHAPE of a call (`parcelLawTab.spec.ts` says so in its own words). That check cannot tell a
// button from a `<span>`, cannot click, and cannot count what a browser would actually show. The
// producer now lives in `ceilingHeadlineSection.ts` precisely so this suite can do all three.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import {
    buildCeilingHeadlineHtml,
    CEILING_DERIVED_ATTR,
    CEILING_HEADLINE_TESTID,
    CEILING_KEYS,
    CEILING_ROW_ATTR,
    CEILING_SUBJECT,
    type CeilingKey,
} from '../ceilingHeadlineSection';
import { CEILING_LABEL } from '../intentAgainstCeilingModel';
import {
    __resetSiteHighlightForTests,
    __resetSiteHighlightSurfacesForTests,
    describeSiteHighlightAvailability,
    describeSiteHighlightReach,
    getSiteHighlight,
    registerSiteHighlightSurface,
    siteHighlightCue,
    siteHighlightEmphasis,
    SITE_HIGHLIGHT_ATTR,
    type SiteHighlightFixedSubject,
} from '../siteGeometryHighlight';
import {
    keepSiteHighlightRowsPainted,
    wireSiteHighlightRows,
    SITE_HIGHLIGHT_REACH_ATTR,
    SITE_HIGHLIGHT_UNAVAILABLE_ATTR,
} from '../siteHighlightRowControl';

const src = (rel: string): string => readFileSync(resolve(__dirname, rel), 'utf8');

/**
 * A DETERMINED Barcelona-shaped parcel: ring, inset footprint, height and GFA all real. Built by
 * the REAL availability rule, never by a hand-written record — a fake availability table would let
 * this suite assert a control the production rule would have refused to render.
 */
const DERIVED_AVAIL = describeSiteHighlightAvailability({
    parcelRingLength: 4,
    edgeClassifications: undefined,
    footprintRingLength: 4,
    maxHeightM: 18,
    gfaM2: 1260,
});

/** The same card on a parcel the rule pack derived NOTHING for — every ceiling absent. */
const ABSENT_AVAIL = describeSiteHighlightAvailability({
    parcelRingLength: 4,
    edgeClassifications: undefined,
    footprintRingLength: 0,
    maxHeightM: null,
    gfaM2: null,
});

function mountHeadline(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    return host;
}

const derivedHeadline = (): HTMLElement => mountHeadline(buildCeilingHeadlineHtml({
    maxFloors: 6,
    maxHeightM: 18,
    footprintM2: 210,
    gfaM2: 1260,
    avail: DERIVED_AVAIL,
    active: null,
}));

beforeEach(() => {
    document.body.innerHTML = '';
    __resetSiteHighlightForTests();
    __resetSiteHighlightSurfacesForTests();
});

describe('§26.6.0 rule 1 (L-13085) — ONE FIGURE, ONE PLACE: each ceiling renders exactly once', () => {
    it('⭐ the mounted headline carries each of the four EXACTLY ONCE — by key and by label', () => {
        const host = derivedHeadline();
        expect(host.querySelector(`[data-testid="${CEILING_HEADLINE_TESTID}"]`)).not.toBeNull();
        // By KEY — a rename of one of the founder's four cannot turn this into a count of nothing.
        for (const key of CEILING_KEYS) {
            const n = host.querySelectorAll(`[${CEILING_ROW_ATTR}="${key}"]`).length;
            expect(n, `${key} renders ${n} times — rule 1 asks for one`).toBe(1);
        }
        // …and by the LABEL THE READER SEES, which is the figure rule 1 is actually about.
        const text = host.textContent ?? '';
        for (const key of CEILING_KEYS) {
            const label = CEILING_LABEL[key];
            const n = text.split(label).length - 1;
            expect(n, `"${label}" appears ${n} times in the headline`).toBe(1);
        }
        // All four are present. A headline showing three would read as "this parcel has three
        // ceilings", which is a claim about the land (see the absence suite below).
        expect(host.querySelectorAll(`[${CEILING_ROW_ATTR}]`)).toHaveLength(4);
    });

    it('⛔ the card does NOT render the four a second time — the lift was a MOVE, not a copy', () => {
        // The fold still lives inside `mountGISArea`'s closure, so this half is a source count and
        // is stated as one. Together with the DOM count above it covers both places a figure could
        // appear: the headline (counted in a real DOM) and the fold (counted in the card's source).
        const card = src('../../layout/GISAreaLayout.ts');
        // ⛔ The card cannot NAME one of the four, by either route a re-added fold row would take:
        // it no longer imports `CEILING_LABEL` (so it cannot render them from their owner), and no
        // `row()` re-types one (so it cannot render them from a literal). Prose mentions in this
        // file's comments are deliberately not matched — the §26.6.7 record of the lift is in them.
        expect(card).not.toMatch(/\bCEILING_LABEL\b\s*[.[]/);
        expect(card).not.toMatch(/row\(\s*['"`]Maximum/);
        // ⛔ ONE PRODUCER, called ONCE. Two calls would be two headlines built from two reads.
        expect((card.match(/buildCeilingHeadlineHtml\(/g) ?? []).length).toBe(1);
        // ⛔ …and the card keeps NO private copy of the row markup it used to own.
        expect(card).not.toContain('buildSiteHighlightLabelHtml(');
        expect(card).toContain('buildEnvelopeCardRowHtml({');
    });

    it('⛔ the four names come from the ONE owner, so the headline and question 3 cannot drift', () => {
        // `CEILING_LABEL` is `intentAgainstCeilingModel`'s, where question 3's intent/ceiling pairs
        // already read it. Re-typing the strings here is how two surfaces come to name one ceiling
        // two ways — the §26.6.2 complaint that the four be "UNAMBIGUOUS AND NAMED AS HE NAMES THEM".
        const producer = src('../ceilingHeadlineSection.ts');
        expect(producer).toContain("import { CEILING_LABEL } from './intentAgainstCeilingModel'");
        expect(producer).toContain('CEILING_LABEL[key]');
    });
});

describe('§26.6.0 rule 2 (L-13085) — THE LIFTED FIGURES ARE STILL CONTROLS, and still carry their subjects', () => {
    it('⭐ three of the four are REAL buttons carrying their REAL subjects', () => {
        const host = derivedHeadline();
        const subjectOf = (key: CeilingKey): string | null =>
            host.querySelector(`[${CEILING_ROW_ATTR}="${key}"] button[${SITE_HIGHLIGHT_ATTR}]`)
                ?.getAttribute(SITE_HIGHLIGHT_ATTR) ?? null;
        // ⛔ The exact regression `c8c62c51` flagged: a figure that became plain text on the way to
        // the headline would still LOOK right and would silently stop painting on the views.
        expect(subjectOf('height')).toBe('height');
        expect(subjectOf('implantation')).toBe('footprint');
        expect(subjectOf('buildable')).toBe('gfa');
        // …and the table that decides this is the module's, not four literals at a call site.
        expect(CEILING_SUBJECT).toEqual({
            levels: null, height: 'height', implantation: 'footprint', buildable: 'gfa',
        });
    });

    it('⛔ `Maximum levels` is NOT a control — there is no geometry for "storeys" to light', () => {
        const host = derivedHeadline();
        const rowEl = host.querySelector(`[${CEILING_ROW_ATTR}="levels"]`)!;
        expect(rowEl.querySelector('button')).toBeNull();
        // It is not a dimmed-unavailable control either: an unnamed subject is a different fact
        // from a named subject whose geometry is missing, and only the latter carries a reason.
        expect(rowEl.querySelector(`[${SITE_HIGHLIGHT_UNAVAILABLE_ATTR}]`)).toBeNull();
        // The figure itself is still there and still readable.
        expect(rowEl.textContent).toContain(CEILING_LABEL.levels);
        expect(rowEl.textContent).toContain('6');
    });

    it('⭐ the headline WIRES — three controls, and clicking one writes the ONE store', () => {
        const host = derivedHeadline();
        // `wireSiteHighlightRows` is the ONE wire; the card calls it on the whole panel, and the
        // Parcel Law tab calls it on the whole tab body. Either root contains the headline.
        expect(wireSiteHighlightRows(host)).toBe(3);
        for (const [key, subject] of [
            ['height', 'height'], ['implantation', 'footprint'], ['buildable', 'gfa'],
        ] as const) {
            host.querySelector<HTMLButtonElement>(
                `[${CEILING_ROW_ATTR}="${key}"] button[${SITE_HIGHLIGHT_ATTR}]`,
            )!.click();
            expect(getSiteHighlight(), `clicking ${key} must emphasise ${subject}`).toBe(subject);
        }
    });

    it('⭐ the ◉ is PAINTED FROM THE STORE, so a click anywhere repaints the headline', () => {
        // The founder's card is re-homed into three hosts and other producers write the same store
        // (question 1's rows, the setback register, the rooms list). A headline that painted only
        // its own click would show two disagreeing statements of one emphasis.
        const host = derivedHeadline();
        wireSiteHighlightRows(host);
        const stop = keepSiteHighlightRowsPainted(host);
        const footprintBtn = host.querySelector<HTMLButtonElement>(
            `[${CEILING_ROW_ATTR}="implantation"] button`,
        )!;
        const heightBtn = host.querySelector<HTMLButtonElement>(`[${CEILING_ROW_ATTR}="height"] button`)!;
        heightBtn.click();
        expect(heightBtn.getAttribute('aria-pressed')).toBe('true');
        expect(footprintBtn.getAttribute('aria-pressed')).toBe('false');
        // A write from ANOTHER surface — the store, not this button — repaints both.
        footprintBtn.click();
        expect(footprintBtn.getAttribute('aria-pressed')).toBe('true');
        expect(heightBtn.getAttribute('aria-pressed')).toBe('false');
        stop();
    });

    it('⛔ a subject with NO geometry renders as text WITH ITS REASON, never as a dead button', () => {
        const host = mountHeadline(buildCeilingHeadlineHtml({
            maxFloors: null, maxHeightM: null, footprintM2: 0, gfaM2: null,
            avail: ABSENT_AVAIL, active: null,
        }));
        expect(host.querySelectorAll('button')).toHaveLength(0);
        for (const key of ['height', 'implantation', 'buildable'] as const) {
            const marker = host.querySelector(`[${CEILING_ROW_ATTR}="${key}"] [${SITE_HIGHLIGHT_UNAVAILABLE_ATTR}]`);
            expect(marker, `${key} lost its un-clickable arm`).not.toBeNull();
            // Non-empty on BOTH arms — a dead click is indistinguishable from "we looked and found
            // nothing", which is the §CONTEXT-DATA-HONESTY conflation wearing an affordance.
            expect((marker!.getAttribute('title') ?? '').length).toBeGreaterThan(20);
        }
    });
});

describe('§26.6.0 rule 2 (L-13085) — IT PAINTS ON ALL THREE VIEWS: BIM 3D · 3D Site · 2D map', () => {
    const HEADLINE_SUBJECTS: readonly SiteHighlightFixedSubject[] = ['height', 'footprint', 'gfa'];

    it('every headline subject has an ANSWER in the shared vocabulary — a cue, or an emphasis', () => {
        // The subject is either drawn as a CONSTRUCTED cue (`siteHighlightCue`) or answered by
        // emphasis on something ALREADY on screen. A subject with neither would be a button whose
        // click provably changes nothing on any view.
        expect(siteHighlightCue('height')).toBe('limit-plane');
        expect(siteHighlightCue('footprint')).toBe('inset-ring');
        // GFA is the study volume, already drawn: emphasis alone answers it, and inventing a second
        // copy of geometry that is on screen would double-draw the plot.
        expect(siteHighlightCue('gfa')).toBeNull();
        expect(siteHighlightEmphasis('gfa', 'envelope-volume')).toBe('subject');
        expect(siteHighlightEmphasis('gfa', 'study-volume')).toBe('subject');
        // ⛔ And the constructed cues never brighten an authored surface (§L-616): everything else
        // recedes, and the CUE is the subject.
        for (const s of HEADLINE_SUBJECTS) {
            expect(siteHighlightEmphasis(s, 'cue')).toBe('subject');
            expect(siteHighlightEmphasis(s, 'proposal')).toBe('recede');
        }
    });

    it('⭐ each of the three renderers carries the arm for each of the three subjects', () => {
        // Source pins, and they are the honest instrument here: two of the three renderers are
        // Cesium/Leaflet surfaces that cannot be mounted under happy-dom. What they pin is that no
        // renderer silently lost an arm — the failure that makes a click dead on ONE view only,
        // which is the hardest kind to notice.
        const bim3d = src('../ParcelBoundarySceneRenderer.ts');
        const site3d = src('../../geospatial/CesiumViewport.ts');
        const map2d = src('../../geospatial/SiteBoundaryMap2D.ts');
        for (const [name, code] of [['BIM 3D', bim3d], ['3D Site', site3d], ['2D map', map2d]] as const) {
            expect(code, `${name} lost the height cue`).toMatch(/'limit-plane'/);
            expect(code, `${name} lost the footprint cue`).toMatch(/'inset-ring'/);
            expect(code, `${name} lost the GFA emphasis`).toMatch(/'envelope-volume'/);
            // …and each reads the ONE store rather than keeping its own idea of the subject.
            expect(code, `${name} does not read the highlight store`).toContain('getSiteHighlight()');
        }
    });

    it('⭐ all three REGISTER, so the row can say WHERE the click will show', () => {
        registerSiteHighlightSurface('parcelBoundaryScene', 'BIM 3D');
        registerSiteHighlightSurface('cesiumSiteViewport', '3D Site');
        registerSiteHighlightSurface('siteBoundaryMap2d', '2D Site Map');
        const reach = describeSiteHighlightReach();
        expect(reach.surfaces).toEqual(['BIM 3D', '3D Site', '2D Site Map']);
        // The headline's buttons carry that count, so a card rendered before `initScene` is not
        // left asserting an effect it does not yet have.
        const host = derivedHeadline();
        const btn = host.querySelector<HTMLButtonElement>(`[${CEILING_ROW_ATTR}="height"] button`)!;
        expect(btn.getAttribute(SITE_HIGHLIGHT_REACH_ATTR)).toBe('3');
        expect(btn.getAttribute('title')).toContain('BIM 3D');
    });
});

describe('§26.6.7 / C58 §1.13 (L-13048) — THE ABSENCE ARMS SURVIVED THE LIFT', () => {
    it('⛔ a ceiling the pack did not derive reads "not derived" — never blank, zero, or dropped', () => {
        const host = mountHeadline(buildCeilingHeadlineHtml({
            maxFloors: null, maxHeightM: null, footprintM2: 0, gfaM2: null,
            avail: ABSENT_AVAIL, active: null,
        }));
        // ⛔ FOUR ROWS, NOT THREE. Dropping the unknown one would state that this parcel has three
        // ceilings — a claim about the user's land that nothing derived.
        expect(host.querySelectorAll(`[${CEILING_ROW_ATTR}]`)).toHaveLength(4);
        for (const key of CEILING_KEYS) {
            const rowEl = host.querySelector(`[${CEILING_ROW_ATTR}="${key}"]`)!;
            expect(rowEl.getAttribute(CEILING_DERIVED_ATTR)).toBe('not-derived');
            expect(rowEl.textContent, `${key} lost its refusal`).toContain('not derived');
            expect(rowEl.textContent).toContain(CEILING_LABEL[key]);
        }
        // ⛔ AND IT REFUSES THE COMPLETION. "not derived" alone is read as "unbounded", and an
        // unbounded constraint drawn on real land is an overstatement, not a blank (L-616).
        const title = host.querySelector<HTMLElement>(`[${CEILING_ROW_ATTR}="height"] [title*="MISSING LOOKUP"]`);
        expect(title, 'the not-derived sentence lost its "missing lookup, not a finding" clause').not.toBeNull();
    });

    it('⛔ a ZERO footprint is an ABSENCE, not a ceiling of nothing', () => {
        // `permittedStudyFigures` returns 0 when there is no inset ring to measure. "0 m²" under
        // *Maximum implantation area* would say no storey may cover any ground — a determination
        // nobody made. The same rule is why GFA is null rather than `0 × storeys`.
        const host = mountHeadline(buildCeilingHeadlineHtml({
            maxFloors: 4, maxHeightM: 14, footprintM2: 0, gfaM2: null,
            avail: ABSENT_AVAIL, active: null,
        }));
        const implantation = host.querySelector(`[${CEILING_ROW_ATTR}="implantation"]`)!;
        expect(implantation.getAttribute(CEILING_DERIVED_ATTR)).toBe('not-derived');
        expect(implantation.textContent).toContain('not derived');
        expect(implantation.textContent).not.toContain('0 m²');
        expect(host.querySelector(`[${CEILING_ROW_ATTR}="buildable"]`)!.textContent).not.toContain('0 m²');
        // The two the pack DID derive are unaffected — an absence never suppresses a real figure.
        expect(host.querySelector(`[${CEILING_ROW_ATTR}="levels"]`)!.getAttribute(CEILING_DERIVED_ATTR)).toBe('yes');
        expect(host.querySelector(`[${CEILING_ROW_ATTR}="height"]`)!.getAttribute(CEILING_DERIVED_ATTR)).toBe('yes');
    });

    it('⛔ the DEGENERATE and ALIGNMENT arms of the card are untouched by the lift', () => {
        const card = src('../../layout/GISAreaLayout.ts');
        // Setbacks that consume the parcel mean there IS no buildable envelope, so the four would
        // print a footprint and a buildable area for land that has neither. The refusal is the
        // answer on that arm, not a placeholder for one.
        expect(card).toContain('Setbacks consume the whole parcel — no buildable envelope.');
        // An alignment zone (Barcelona 13a) has NULL setbacks/height/FAR BY DESIGN, so it keeps
        // depth + offset IN ADDITION to the four — the four alone would restore the founder's
        // original "empty / not filled in" complaint (§L-518c).
        expect(card).toContain('siteData.headline');
        expect(card).toContain('Buildable depth');
        expect(card).toContain('Alignment offset');
        expect(card).toContain('Alignment zone — setbacks/height/FAR set by');
    });
});
