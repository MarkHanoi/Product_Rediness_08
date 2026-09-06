// §SITE-HIGHLIGHT-REACH (STR §25.1 · RESI-ORCHESTRATOR-PLAN Stage C)
//
// The Parcel Law tab offers FOUR views and exactly ONE subscribes to the highlight store. Before
// this slice a founder in "3D Site" clicked *Area*, the button repainted its ◉, and nothing lit
// up — the row ASSERTED an effect it did not have, which reads as a broken product rather than as
// "not drawn in this view".
//
// These tests pin the two halves that make the sentence trustworthy: it is DERIVED from who
// actually registered (so it cannot out-run the wiring), and it INFORMS without gating (so a card
// that renders before the scene exists is not left with permanently dead text).

import { describe, it, expect, beforeEach } from 'vitest';
import {
    __resetSiteHighlightForTests,
    __resetSiteHighlightSurfacesForTests,
    describeSiteHighlightReach,
    getSiteHighlightSurfaces,
    registerSiteHighlightSurface,
    subscribeSiteHighlight,
} from '../siteGeometryHighlight';
import {
    buildSiteHighlightLabelHtml,
    paintSiteHighlightRows,
    wireSiteHighlightRows,
    SITE_HIGHLIGHT_REACH_ATTR,
} from '../siteHighlightRowControl';

const AVAILABLE = { available: true, reason: 'Lights the parcel — the whole plot.' } as const;

beforeEach(() => {
    __resetSiteHighlightForTests();
    __resetSiteHighlightSurfacesForTests();
});

describe('§SITE-HIGHLIGHT-REACH — the sentence is measured, never asserted', () => {
    it('with NOTHING registered it reports UNREPORTED — it never asserts that the click is dead', () => {
        // ⛔ THE ARM THIS TEST EXISTS FOR. A renderer can subscribe WITHOUT registering, so an
        // empty registry is a gap in PRYZM's REPORTING, not a finding that nothing draws the
        // emphasis. Printing "nothing will happen" here would assert a fact the registry cannot
        // support, and it would be wrong exactly when it matters most: on a card rendered a few
        // frames before `initScene` runs. `viewSegmentSwitcher.ts` states the same rule for its
        // own snapshot (C84 EI-1b) and this copies it rather than re-deriving it.
        const r = describeSiteHighlightReach();
        expect(r.status).toBe('unreported');
        expect(r.surfaces).toEqual([]);
        expect(r.sentence).toContain('cannot tell you which one to look at');
        expect(r.sentence).toContain('gap in PRYZM’s own reporting');
        // ⚠ The clause that stops the sentence reading as a finding about the land (L-616).
        expect(r.sentence).toContain('not a finding about this parcel');
        // ...and it still gives the founder something to do.
        expect(r.sentence).toContain('try another view');
        // ⛔ It must NOT claim the click does nothing.
        expect(r.sentence).not.toMatch(/nothing on screen|will change nothing/);
    });

    it('one registered surface names it in the user’s own word for the view', () => {
        registerSiteHighlightSurface('parcelBoundaryScene', 'BIM 3D');
        const r = describeSiteHighlightReach();
        expect(r.status).toBe('named');
        expect(r.surfaces).toEqual(['BIM 3D']);
        expect(r.sentence).toContain('Shown in the BIM 3D view.');
        // ...and it still tells the founder what to do when nothing appears.
        expect(r.sentence).toContain('switch views if nothing changes');
    });

    it('a SECOND surface updates the sentence with no second edit — the point of the registry', () => {
        registerSiteHighlightSurface('parcelBoundaryScene', 'BIM 3D');
        registerSiteHighlightSurface('cesium', '3D Site');
        const r = describeSiteHighlightReach();
        expect(r.surfaces).toEqual(['BIM 3D', '3D Site']);
        expect(r.sentence).toContain('Shown in the BIM 3D and 3D Site views.');
    });

    it('disposing a registration retracts the claim — a stale row would name a dead view', () => {
        const off = registerSiteHighlightSurface('parcelBoundaryScene', 'BIM 3D');
        expect(describeSiteHighlightReach().status).toBe('named');
        off();
        expect(describeSiteHighlightReach().status).toBe('unreported');
        expect(getSiteHighlightSurfaces()).toEqual([]);
    });

    it('re-registering the same id replaces its row rather than duplicating it (hot reload)', () => {
        registerSiteHighlightSurface('parcelBoundaryScene', 'BIM 3D');
        registerSiteHighlightSurface('parcelBoundaryScene', 'BIM 3D');
        expect(getSiteHighlightSurfaces()).toEqual(['BIM 3D']);
    });
});

describe('§SITE-HIGHLIGHT-REACH — the row carries it as INFORMATION, never as a gate', () => {
    const mount = (): HTMLElement => {
        const host = document.createElement('div');
        host.innerHTML = buildSiteHighlightLabelHtml('Area', 'parcel', AVAILABLE, false);
        document.body.appendChild(host);
        return host;
    };

    it('an available row is STILL a clickable button when nothing can draw it', () => {
        // ⛔ The regression this guards: demoting the row to text on an empty registry would
        // permanently disable it whenever the card renders before `initScene` runs.
        const host = mount();
        const btn = host.querySelector('button');
        expect(btn).not.toBeNull();
        expect(btn!.getAttribute(SITE_HIGHLIGHT_REACH_ATTR)).toBe('0');
        expect(wireSiteHighlightRows(host)).toBe(1);
    });

    it('the tooltip carries BOTH the geometry reason and the where-it-shows sentence', () => {
        registerSiteHighlightSurface('parcelBoundaryScene', 'BIM 3D');
        const host = mount();
        const title = host.querySelector('button')!.getAttribute('title')!;
        expect(title).toContain('Lights the parcel');
        expect(title).toContain('Shown in the BIM 3D view.');
        expect(title).toContain('Click again to clear.');
    });

    it('a row rendered BEFORE the scene registered corrects itself on the next paint', () => {
        // The exact timing race the "inform, do not gate" decision was made for.
        const host = mount();
        expect(host.querySelector('button')!.getAttribute(SITE_HIGHLIGHT_REACH_ATTR)).toBe('0');
        expect(host.querySelector('button')!.getAttribute('title')).toContain('cannot tell you which one');

        registerSiteHighlightSurface('parcelBoundaryScene', 'BIM 3D');
        paintSiteHighlightRows(host);

        const btn = host.querySelector('button')!;
        expect(btn.getAttribute(SITE_HIGHLIGHT_REACH_ATTR)).toBe('1');
        // ⚠ BOTH halves move together. A repaint that fixed the number and left the sentence
        // would put two disagreeing statements of one fact on the same element.
        expect(btn.getAttribute('title')).toContain('Shown in the BIM 3D view.');
        expect(btn.getAttribute('title')).not.toContain('cannot tell you which one');
        // ...and the geometry reason survives the recomposition.
        expect(btn.getAttribute('title')).toContain('Lights the parcel');
    });

    it('an UNAVAILABLE row is unchanged — no geometry anywhere means reach is not the story', () => {
        const host = document.createElement('div');
        host.innerHTML = buildSiteHighlightLabelHtml(
            'Boundary edges', 'frontage',
            { available: false, reason: 'Nobody has classified this parcel’s edges.' },
            false,
        );
        expect(host.querySelector('button')).toBeNull();
        expect(host.querySelector(`[${SITE_HIGHLIGHT_REACH_ATTR}]`)).toBeNull();
        expect(host.innerHTML).toContain('Nobody has classified');
    });
});

describe('§SITE-HIGHLIGHT-REACH — the registry is NOT the subscriber list', () => {
    it('subscribing without registering does not claim a surface', () => {
        // A card repainting its own pressed state subscribes too, and it is not a viewport.
        // Counting `listeners` to answer "where will this show?" would report the panel as one.
        subscribeSiteHighlight(() => {});
        expect(describeSiteHighlightReach().status).toBe('unreported');
        expect(getSiteHighlightSurfaces()).toEqual([]);
    });
});
