/**
 * §PARCEL-LAW-TAB (L-12915 · C19 §5.6 / §5.7) — the tab body is a HOST of producers.
 *
 * Two layers of fake, deliberately:
 *   · ARM A fakes the SEAMS (`buildParcelPanel`, `mountSwitcher`, `wireStrip`) and asserts
 *     the body calls each exactly as the contract says — with the runtime it was given, with
 *     the capability host it was given, after the claim has landed;
 *   · ARM B uses the REAL `buildParcelRailPanel` over a fake site store and a fake
 *     `pryzmMountEnvelopeCard` that behaves like the real seam (ONE element, MOVED between
 *     hosts), and pins the singleton discipline: claimed while mounted, handed back on dispose
 *     ONLY when still held, never evicted from a host that claimed it since.
 *
 * A fake built from the header cannot falsify the header — so the fake seam in ARM B moves a
 * real DOM node, and the assertions read `parentElement`, not a flag.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    mountParcelLawTab,
    defaultParcelLawTabDeps,
    PARCEL_LAW_TAB_TESTID,
    PARCEL_LAW_SWITCHER_SLOT_TESTID,
    PARCEL_LAW_PANEL_SLOT_TESTID,
    PARCEL_LAW_FACTS_LAW_SLOT_TESTID,
    PARCEL_LAW_NOTE,
    PARCEL_LAW_PLOT_ROUTE_NOTE,
    PARCEL_LAW_PLOT_ROUTE_TESTID,
    PARCEL_LAW_PLOT_DISPLAY_TESTID,
    PARCEL_LAW_DETAIL_FOLD_TESTID,
    PARCEL_LAW_DETAIL_FOLD_SUMMARY,
    PARCEL_LAW_STRIP_WIRED_ATTR,
    PARCEL_LAW_HIGHLIGHT_WIRED_ATTR,
    PARCEL_LAW_AUTHORING_HOST_TESTID,
    PARCEL_LAW_AUTHORING_MOVED_TESTID,
    PARCEL_LAW_RELOCATED_TO_ATTR,
    PARCEL_LAW_INTENT_HOST_TESTID,
    ENVELOPE_CARD_TESTID,
    type ParcelLawTabDeps,
    type ParcelLawCapabilityHost,
} from '../parcelLawTab';
import { buildParcelRailPanel, PARCEL_RAIL_ENVELOPE_SLOT_TESTID } from '../../site/parcel/parcelRailPanel';
import { QUESTION_GROUP_TESTID_PREFIX, resetQuestionGroupOpenState } from '../parcelLawQuestionGroup';
// §ENVELOPE-CREATION-IS-A-STAGE-02-VERB (L-13202) — the create block's OWN root, asserted inside
// question 2's host so 'the slot moved' cannot pass while the section inside it is gone.
import { AUTHORING_SLOT_TESTID } from '../parcelLawEnvelopeAuthoring';
import {
    ENVELOPE_VOLUME_TOGGLE_TESTID,
    ENVELOPE_FOOTPRINT_TOGGLE_TESTID,
    ENVELOPE_AXES_CAPTION_TESTID,
} from '../../site/envelopeVisibilityControl';
import {
    getBuildableEnvelopeAxes,
    __resetBuildableEnvelopeVisibilityForTests,
} from '../../site/envelopeVisibility';
import {
    plotDisplayControlsClaimed,
    __resetPlotDisplayControlsHostForTests,
} from '../../site/plotDisplayControlsHost';
import { VIEW_SEGMENT_SWITCHER_TESTID, VIEW_SEGMENT_ATTR, VIEW_SEGMENTS } from '../../site/viewSegmentSwitcher';
import { VIEW_SWITCHER_ON_VIEW_TESTID, VIEW_SWITCHER_SPLIT_TESTID } from '../../site/viewSwitcherOnView';
import { buildParcelLawModel } from '../../site/parcel/parcelLawModel';
import {
    SITE_HIGHLIGHT_ATTR,
    __resetSiteHighlightForTests,
    getSiteHighlight,
    setSiteHighlight,
    subscribeSiteHighlight,
} from '../../site/siteGeometryHighlight';
import { SITE_HIGHLIGHT_UNAVAILABLE_ATTR } from '../../site/siteHighlightRowControl';
// §26.6.7 (L-13085) — the four ceilings' subject table, at its ONE owner. The headline's own
// mounted-DOM suite is `site/__tests__/ceilingHeadline.spec.ts`.
import { CEILING_SUBJECT } from '../../site/ceilingHeadlineSection';
import { ANALYSIS_SURFACE_STYLES } from '../../styles/panels/analysisSurface';
import {
    SETBACK_REGISTER_ARM_ATTR,
    SETBACK_REGISTER_CLASS_ATTR,
    SETBACK_REGISTER_ROW_PREFIX,
    SETBACK_REGISTER_TESTID,
} from '../../site/setbackRegisterSection';
import { INTENT_CEILING_TESTID, INTENT_CEILING_UNREADABLE_TESTID } from '../parcelLawIntentAgainstCeiling';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const SITE = {
    parcel: {
        boundary: { polygon: [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 21 }, { x: 0, z: 21 }] },
        area: 424,
        provenance: {
            kind: 'cadastral', source: 'catastro', label: 'Catastro (Spain)', refcat: '3634515DF3833D',
            address: 'CALLE EJEMPLO 1, CORDOBA', jurisdictionId: 'es-cordoba', sourceCrs: 'EPSG:25830',
            license: 'CC BY 4.0 · Dirección General del Catastro', ingestTimestamp: '2026-08-21T09:14:00Z',
            confidence: { areaOfficialM2: 423, areaSigM2: 424, areaSource: 'registry-declared', match: 'high', geometryComplete: true },
        },
    },
};

function fakeRuntime(site: unknown): PryzmRuntime {
    const listeners = new Set<() => void>();
    return {
        siteModelStore: {
            getSite: () => site,
            subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); },
            _notify: () => { for (const l of listeners) l(); },
        },
    } as unknown as PryzmRuntime;
}

/**
 * The seam, faked FAITHFULLY: one card element, moved to whichever host claims it, returned
 * to a "viewport" node on `null`. Records every call.
 *
 * ⚠ INSTALLED ON `window` AS WELL AS RETURNED. `buildParcelRailPanel` (the real producer host
 * ARM B mounts) reads `window.pryzmMountEnvelopeCard` — the production capability host — not
 * a parameter; so a seam handed only to the tab's deps would never be reached by the claim.
 * `restore()` puts the previous value back.
 */
function fakeEnvelopeSeam(): { host: ParcelLawCapabilityHost; card: HTMLElement; viewport: HTMLElement; calls: Array<HTMLElement | null>; restore: () => void } {
    const card = document.createElement('div');
    card.setAttribute('data-testid', ENVELOPE_CARD_TESTID);
    card.textContent = 'ENVELOPE CARD (singleton)';
    const viewport = document.createElement('div');
    viewport.id = 'fake-viewport';
    document.body.appendChild(viewport);
    viewport.appendChild(card);
    const calls: Array<HTMLElement | null> = [];
    const mount = (h: HTMLElement | null): boolean => {
        calls.push(h);
        (h ?? viewport).appendChild(card); // MOVED, never cloned — the real seam's shape
        return true;
    };
    const host: ParcelLawCapabilityHost = {
        pryzmMountEnvelopeCard: mount,
        pryzmEnterSiteView: () => { /* noop */ },
        pryzmShowSiteResultView: () => { /* noop */ },
        pryzmGetSiteViewState: () => ({ segment: '2D', formaMode: 'plan', buildingFidelity: 'real' }),
    };
    const previous = window.pryzmMountEnvelopeCard;
    window.pryzmMountEnvelopeCard = mount;
    const restore = (): void => {
        if (previous) window.pryzmMountEnvelopeCard = previous;
        else delete window.pryzmMountEnvelopeCard;
        viewport.remove();
    };
    return { host, card, viewport, calls, restore };
}

describe('ARM A — the body calls each producer seam exactly as the contract says', () => {
    it('mounts the switcher with the capability host, the panel with the runtime, and wires the strip after the claim', async () => {
        const runtime = fakeRuntime(SITE);
        const capabilityHost: ParcelLawCapabilityHost = { pryzmGetSiteViewState: () => ({ segment: '2D', formaMode: 'plan', buildingFidelity: 'real' }) };
        const seen: string[] = [];
        let panelDisposed = 0;
        let switcherDisposed = 0;
        const deps: ParcelLawTabDeps = {
            capabilityHost,
            runtime,
            buildParcelPanel: (rt) => {
                seen.push(`buildParcelPanel(${rt === runtime ? 'THE runtime' : 'another runtime'})`);
                const el = document.createElement('div');
                el.textContent = 'FAKE PARCEL PANEL';
                return { element: el, dispose: () => { panelDisposed++; } };
            },
            mountSwitcher: (h) => {
                seen.push(`mountSwitcher(${h === capabilityHost ? 'THE host' : 'another host'})`);
                const el = document.createElement('div');
                el.textContent = 'FAKE SWITCHER';
                return { element: el, repaint: () => { seen.push('switcher.repaint'); }, activeLabel: () => null, dispose: () => { switcherDisposed++; } };
            },
            wireStrip: (root) => {
                seen.push(`wireStrip(${(root as HTMLElement).getAttribute?.('data-testid') ?? '?'})`);
                return 3;
            },
        };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const h = mountParcelLawTab(hostEl, deps);
        // Synchronous: both producers were asked for, in order, with what they were owed.
        expect(seen).toEqual(['mountSwitcher(THE host)', 'buildParcelPanel(THE runtime)']);
        expect(hostEl.querySelector(`[data-testid="${PARCEL_LAW_TAB_TESTID}"]`)).toBe(h.element);
        // ⭐ §VIEW-SWITCHER-ON-THE-VIEW (L-12985) — the switcher is BUILT by this body and
        // PLACED on the view, not in the panel. Both halves are asserted, because the founder's
        // instruction was a MOVE: a switcher that vanished would satisfy "not on the panel" and
        // fail him completely.
        expect(h.element.querySelector(`[data-testid="${PARCEL_LAW_SWITCHER_SLOT_TESTID}"]`)).toBeNull();
        const bar = document.querySelector<HTMLElement>(`[data-testid="${VIEW_SWITCHER_ON_VIEW_TESTID}"]`);
        expect(bar, 'the on-view bar was not mounted').not.toBeNull();
        expect(bar!.textContent).toContain('FAKE SWITCHER');
        expect(h.element.contains(bar!)).toBe(false);
        expect(h.element.querySelector(`[data-testid="${PARCEL_LAW_PANEL_SLOT_TESTID}"]`)!.textContent).toBe('FAKE PARCEL PANEL');
        expect(h.element.textContent).toContain(PARCEL_LAW_NOTE);
        // The strip is wired on a MICROTASK — after the rail panel's own microtask claim.
        expect(seen.filter((s) => s.startsWith('wireStrip'))).toHaveLength(0);
        await tick();
        expect(seen).toContain(`wireStrip(${PARCEL_LAW_TAB_TESTID})`);
        expect(h.element.getAttribute(PARCEL_LAW_STRIP_WIRED_ATTR)).toBe('3');

        // A store notification re-wires (the card re-renders on a determination).
        const before = seen.filter((s) => s.startsWith('wireStrip')).length;
        (runtime as unknown as { siteModelStore: { _notify: () => void } }).siteModelStore._notify();
        await tick();
        expect(seen.filter((s) => s.startsWith('wireStrip')).length).toBe(before + 1);

        h.repaint();
        expect(seen).toContain('switcher.repaint');

        h.dispose();
        expect(panelDisposed).toBe(1);
        expect(switcherDisposed).toBe(1);
        expect(hostEl.querySelector(`[data-testid="${PARCEL_LAW_TAB_TESTID}"]`)).toBeNull();
        // After dispose a notification must NOT re-wire into a dead body.
        const after = seen.length;
        (runtime as unknown as { siteModelStore: { _notify: () => void } }).siteModelStore._notify();
        await tick();
        expect(seen.length).toBe(after);
        hostEl.remove();
    });

    it('the production deps resolve to the real producers and read window.runtime at CALL time', () => {
        const d = defaultParcelLawTabDeps();
        expect(d.buildParcelPanel).toBe(buildParcelRailPanel);
        expect(typeof d.mountSwitcher).toBe('function');
        expect(typeof d.wireStrip).toBe('function');
        expect(d.capabilityHost).toBe(window);
    });
});

describe('ARM B — the REAL rail-panel builder inside the tab, over a faithful singleton seam', () => {
    it('⭐ hosts the real cadastral card AND claims the envelope card into this body', async () => {
        const seam = fakeEnvelopeSeam();
        const runtime = fakeRuntime(SITE);
        const deps: ParcelLawTabDeps = { ...defaultParcelLawTabDeps(), capabilityHost: seam.host, runtime };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const h = mountParcelLawTab(hostEl, deps);
        await tick();

        // The cadastral half is the ONE producer's output — source + timestamp + both areas.
        const text = h.element.textContent ?? '';
        expect(text).toContain('Catastro (Spain)');
        expect(text).toContain('2026-08-21T09:14:00Z');
        expect(text).toContain('423');
        expect(text).toContain('424');
        // The switcher is on the VIEW, carrying every row `viewPanelOptions()` declares —
        // counted from the definition rather than hard-coded, so adding a row is one edit.
        const onViewBar = document.querySelector<HTMLElement>(`[data-testid="${VIEW_SWITCHER_ON_VIEW_TESTID}"]`)!;
        expect(onViewBar).not.toBeNull();
        expect(
            onViewBar.querySelectorAll(`[data-testid="${VIEW_SEGMENT_SWITCHER_TESTID}"] button[${VIEW_SEGMENT_ATTR}]`),
        ).toHaveLength(VIEW_SEGMENTS.length);
        // …plus the SPLIT choice, which is a layout and not a seventh view.
        expect(onViewBar.querySelector(`[data-testid="${VIEW_SWITCHER_SPLIT_TESTID}"]`)).not.toBeNull();
        expect(h.element.querySelector(`[data-testid="${VIEW_SEGMENT_SWITCHER_TESTID}"]`)).toBeNull();
        // The singleton was CLAIMED — into the rail panel's envelope slot, inside this body.
        expect(seam.calls.length).toBeGreaterThanOrEqual(1);
        expect(seam.calls[0]!.getAttribute('data-testid')).toBe(PARCEL_RAIL_ENVELOPE_SLOT_TESTID);
        expect(h.holdsEnvelopeCard()).toBe(true);
        expect(h.element.contains(seam.card)).toBe(true);

        // ⭐ Dispose while STILL HOLDING it → handed back to the viewport (the null call).
        h.dispose();
        expect(seam.calls[seam.calls.length - 1]).toBeNull();
        expect(seam.card.parentElement).toBe(seam.viewport);
        expect(hostEl.querySelector(`[data-testid="${PARCEL_LAW_TAB_TESTID}"]`)).toBeNull();
        // ⛔ The on-view bar is BODY-LEVEL chrome. A tab that vanished while leaving its bar
        // floating over the canvas is the stranded-chrome failure, so its removal is pinned.
        expect(document.querySelector(`[data-testid="${VIEW_SWITCHER_ON_VIEW_TESTID}"]`)).toBeNull();
        hostEl.remove();
        seam.restore();
    });

    it('⛔ NEVER evicts a host that claimed the card since — dispose makes NO null call then', async () => {
        const seam = fakeEnvelopeSeam();
        const runtime = fakeRuntime(SITE);
        const deps: ParcelLawTabDeps = { ...defaultParcelLawTabDeps(), capabilityHost: seam.host, runtime };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const h = mountParcelLawTab(hostEl, deps);
        await tick();
        expect(h.holdsEnvelopeCard()).toBe(true);

        // Another host (the rail PARCEL panel, say) claims it.
        const other = document.createElement('div');
        other.id = 'other-host';
        document.body.appendChild(other);
        seam.host.pryzmMountEnvelopeCard!(other);
        expect(h.holdsEnvelopeCard()).toBe(false);
        const callsBefore = seam.calls.length;

        h.dispose();
        // No further call — not null, not anything. The card stays with the other host.
        expect(seam.calls.length).toBe(callsBefore);
        expect(seam.card.parentElement).toBe(other);
        other.remove();
        hostEl.remove();
        seam.restore();
    });

    it('with no boundary the cadastral half says so in words and the envelope half prints a NAMED state', async () => {
        const seam = fakeEnvelopeSeam();
        // A seam that returns false (nothing determinable) — the real seam's `false` contract.
        const refusing = (hostEl: HTMLElement | null): boolean => { seam.calls.push(hostEl); return false; };
        seam.host.pryzmMountEnvelopeCard = refusing;
        window.pryzmMountEnvelopeCard = refusing; // the real rail-panel builder reads window
        const runtime = fakeRuntime(null);
        const deps: ParcelLawTabDeps = { ...defaultParcelLawTabDeps(), capabilityHost: seam.host, runtime };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const h = mountParcelLawTab(hostEl, deps);
        await tick();
        const text = h.element.textContent ?? '';
        expect(text).toContain('No parcel boundary is committed');
        // No card, no zeros: the sentence, and the route (the 2D map button from the ONE registry action).
        expect(h.element.querySelector(`[data-testid="${ENVELOPE_CARD_TESTID}"]`)).toBeNull();
        expect(h.element.querySelector('[data-testid="parcel-open-map-btn"]')).not.toBeNull();
        expect(h.holdsEnvelopeCard()).toBe(false);
        h.dispose();
        // Not held → no hand-back call.
        expect(seam.calls.every((c) => c !== null)).toBe(true);
        hostEl.remove();
        seam.restore();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// §SELECT-PARCEL-IS-A-VIEW-ACTION (L-13004) — the action leaves the read-out panel, and the
// ROUTE does not leave with it
// ═══════════════════════════════════════════════════════════════════════════════════════
//
// Founder 2026-09-06, red arrow on the full-width purple button inside question 1: *"once i
// select a parcel — even if it has a real constructed envelope — WE DON'T NEED 'Select parcel
// on the 2D map' in the analysis parcel law tab. THIS SHOULD BE ON THE LEFT HAND SIDE."*
//
// ⭐ THE FIRST THREE WORDS ARE THE CONDITION AND THESE TWO TESTS ARE THE PAIR. Suppressing the
// button unconditionally would satisfy the quote and break C19 §5.6 clause 4 — on a project
// with no parcel it is the ONLY route to one, which is why §L-1585 built it and why L-942 is
// the rule that a refusal must carry its escape hatch. The second test is the one that would
// catch that regression.

describe('§SELECT-PARCEL-IS-A-VIEW-ACTION — question 1 drops the button ONLY once a plot is committed', () => {
    it('⭐ a COMMITTED parcel: no button in question 1, and a sentence naming where selection lives', async () => {
        const seam = fakeEnvelopeSeam();
        const runtime = fakeRuntime(SITE);
        const deps: ParcelLawTabDeps = { ...defaultParcelLawTabDeps(), capabilityHost: seam.host, runtime };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const h = mountParcelLawTab(hostEl, deps);
        await tick();

        const q1 = h.element.querySelector(`[data-testid="${QUESTION_GROUP_TESTID_PREFIX}plot"]`)!;
        expect(
            q1.querySelector('[data-testid="parcel-open-map-btn"]'),
            'a primary ACTION in a panel whose lede says nothing is computed here',
        ).toBeNull();

        // ⛔ AND IT SAYS SO. A panel that drops an affordance in silence has moved the user's
        // problem, not solved it — the pointer names the view, in the tab lede's own words.
        const note = q1.querySelector<HTMLElement>(`[data-testid="${PARCEL_LAW_PLOT_ROUTE_TESTID}"]`)!;
        expect(note).not.toBeNull();
        expect(note.hidden).toBe(false);
        expect(note.textContent).toBe(PARCEL_LAW_PLOT_ROUTE_NOTE);

        h.dispose();
        hostEl.remove();
        seam.restore();
    });

    it('⛔ NO parcel: the button SURVIVES — it is the only route, and a route is never removed', async () => {
        const seam = fakeEnvelopeSeam();
        const runtime = fakeRuntime(null);
        const deps: ParcelLawTabDeps = { ...defaultParcelLawTabDeps(), capabilityHost: seam.host, runtime };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const h = mountParcelLawTab(hostEl, deps);
        await tick();

        const q1 = h.element.querySelector(`[data-testid="${QUESTION_GROUP_TESTID_PREFIX}plot"]`)!;
        expect(
            q1.querySelector('[data-testid="parcel-open-map-btn"]'),
            'C19 §5.6 clause 4 · §L-1585 · L-942 — a refusal with no escape hatch',
        ).not.toBeNull();
        // …and the pointer stays hidden, so the panel never shows the button AND a sentence
        // saying selection happens somewhere else. Two halves of one fact cannot disagree.
        const note = q1.querySelector<HTMLElement>(`[data-testid="${PARCEL_LAW_PLOT_ROUTE_TESTID}"]`)!;
        expect(note.hidden).toBe(true);

        h.dispose();
        hostEl.remove();
        seam.restore();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// §26.6 — THE COMPLETE PARCEL LAW CARD SPEC (L-13046, founder 2026-09-07, seven screenshots).
// *"DO IT SOUND — ARCHITECTURALLY SOUND — NO SHORT CUTS."* The four cross-cutting rules are the
// architecture; these blocks pin the rules at the layer the founder experiences — the DOM of the
// mounted tab — never a flag on a handle.
// ═══════════════════════════════════════════════════════════════════════════════════════

afterEach(() => {
    // The tab subscribes to the highlight store at mount; a leaked subscriber would repaint the
    // PREVIOUS test's tree. The subject is cleared for the same reason.
    __resetSiteHighlightForTests();
});

/** A determined Barcelona-shaped envelope — enough for the model to produce the law triple. */
function determinedEnvelope(): never {
    return {
        insetPolygon: [{ x: 3, z: 3 }, { x: 17, z: 3 }, { x: 17, z: 18 }, { x: 3, z: 18 }],
        insetAreaM2: 210,
        maxHeight_m: 18,
        farLimitedHeight_m: null,
        maxFloors: 6,
        maxFAR: null,
        maxCoverage: null,
        maxVolumeM3: 3780,
        footprintIsUpperBound: false,
        confidence: 'structured',
        granularity: 'parcel',
        status: 'ok',
        refusal: null,
        zoneCode: '13a',
        derivation: [
            { constraint: 'alignment.depth', value: 15, source: 'bcn-pgm', ordinanceRef: 'PGM Art. 242.2', fieldProvenance: 'published-structured' },
        ],
        caveats: [],
        tiers: [],
        permittedUse: [],
    } as never;
}

/**
 * The singleton, faked the way the REAL card renders: with the *Full site & massing data* fold
 * carrying the ORDINANCE LIMITS · MASSING POTENTIAL · CAPACITY headings — so the test can count
 * how many times the triple is on the tab, which is the founder's exact complaint.
 */
function fakeEnvelopeSeamWithFold(): ReturnType<typeof fakeEnvelopeSeam> {
    const seam = fakeEnvelopeSeam();
    seam.card.textContent = '';
    const fold = document.createElement('details');
    fold.setAttribute('data-testid', 'envelope-section-site-data');
    fold.innerHTML =
        '<summary>Full site &amp; massing data</summary>'
        + '<div><div class="fake-group-title">Ordinance limits</div>'
        + '<div class="fake-group-title">Massing potential</div>'
        + '<div class="fake-group-title">Capacity</div></div>';
    seam.card.appendChild(fold);
    return seam;
}

describe('§26.6 rule 1 — NOTHING IS DUPLICATED: the ORDINANCE LIMITS / MASSING POTENTIAL / CAPACITY triple renders ONCE', () => {
    it('⭐ on a DETERMINED parcel the triple appears exactly once on the whole tab — the card fold, and no second block', async () => {
        const seam = fakeEnvelopeSeamWithFold();
        const runtime = fakeRuntime(SITE);
        const deps: ParcelLawTabDeps = {
            ...defaultParcelLawTabDeps(),
            capabilityHost: seam.host,
            runtime,
            // The ONE model, DETERMINED — the state in which the tab used to render the triple a
            // second time beneath the card. The production renderer runs.
            readParcelLawModel: () => buildParcelLawModel({
                parcelRing: SITE.parcel.boundary.polygon,
                edgeClassifications: undefined,
                identity: null,
                identityAbsence: 'none',
                envelope: determinedEnvelope(),
            }),
        };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const h = mountParcelLawTab(hostEl, deps);
        await tick();
        expect(h.holdsEnvelopeCard()).toBe(true);

        const text = h.element.textContent ?? '';
        for (const heading of ['Ordinance limits', 'Massing potential', 'Capacity']) {
            const count = text.split(heading).length - 1;
            expect(count, `"${heading}" renders ${count} times — the founder's image 6 was the second`).toBe(1);
        }
        // The one occurrence is INSIDE the card's fold, i.e. at its owner — not a tab copy.
        expect(h.element.querySelectorAll('.anl-plaw-group')).toHaveLength(0);
        const law = h.element.querySelector(`[data-testid="${PARCEL_LAW_FACTS_LAW_SLOT_TESTID}"]`)!;
        expect(law.querySelector('.anl-plaw-group')).toBeNull();
        expect(law.getAttribute('data-duplicate-removed')).toBe('envelope-card-site-data-fold');

        h.dispose();
        hostEl.remove();
        seam.restore();
    });
});

describe('§26.6 rule 2 — EVERY FIGURE IS A HYPERLINK, and following it writes the store every view paints from', () => {
    it('⭐ question 1: Area (both rows), Perimeter and Bounding box are highlight CONTROLS; unrecorded frontage is text-with-reason', async () => {
        const seam = fakeEnvelopeSeam();
        const runtime = fakeRuntime(SITE);
        const deps: ParcelLawTabDeps = { ...defaultParcelLawTabDeps(), capabilityHost: seam.host, runtime };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const h = mountParcelLawTab(hostEl, deps);
        await tick();

        const q1 = h.element.querySelector(`[data-testid="${QUESTION_GROUP_TESTID_PREFIX}plot"]`)!;
        const subjects = [...q1.querySelectorAll<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}]`)]
            .map((b) => b.getAttribute(SITE_HIGHLIGHT_ATTR));
        // Every AREA row points at the SAME plot — the registry area, the ring area and, because
        // SITE's 20 × 21 ring measures 420 m² in scene against the 424 m² the source published,
        // the labelled scene-area row too (§ONE-PARCEL-BLOCK: a disagreement is information).
        // Perimeter points at the ring; the bounding box at the box.
        expect(subjects.filter((s) => s === 'parcel')).toHaveLength(3);
        expect(subjects).toContain('boundary');
        expect(subjects).toContain('bbox');
        // SITE carries no edgeClassifications → "not recorded" → text with its reason, not a
        // control that swallows a click (the three-arm frontage rule, on the card).
        expect(q1.querySelector(`button[${SITE_HIGHLIGHT_ATTR}="frontage"]`)).toBeNull();
        const frontage = q1.querySelector<HTMLElement>(`[${SITE_HIGHLIGHT_UNAVAILABLE_ATTR}="frontage"]`)!;
        expect(frontage).not.toBeNull();
        expect(frontage.title).toContain('classified');
        // And the tab WIRED them — the count is stamped, so "wired nothing" is distinguishable.
        expect(Number(h.element.getAttribute(PARCEL_LAW_HIGHLIGHT_WIRED_ATTR))).toBeGreaterThanOrEqual(4);

        h.dispose();
        hostEl.remove();
        seam.restore();
    });

    it('⭐ FOLLOWING the link writes the ONE store the views subscribe to, and the tab keeps every row PAINTED from it', async () => {
        const seam = fakeEnvelopeSeam();
        const runtime = fakeRuntime(SITE);
        const deps: ParcelLawTabDeps = { ...defaultParcelLawTabDeps(), capabilityHost: seam.host, runtime };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const h = mountParcelLawTab(hostEl, deps);
        await tick();
        const q1 = h.element.querySelector(`[data-testid="${QUESTION_GROUP_TESTID_PREFIX}plot"]`)!;
        const perimeter = q1.querySelector<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}="boundary"]`)!;
        const areas = [...q1.querySelectorAll<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}="parcel"]`)];

        // A view — the seam CesiumViewport / SiteBoundaryMap2D / ParcelBoundarySceneRenderer sit on.
        const view = vi.fn();
        subscribeSiteHighlight(view);
        expect(getSiteHighlight()).toBeNull();
        perimeter.click();
        expect(getSiteHighlight()).toBe('boundary');
        expect(view).toHaveBeenCalledTimes(1);
        expect(perimeter.getAttribute('aria-pressed')).toBe('true');

        // ⭐ THE STORE MOVES FROM ELSEWHERE (the envelope card's own fold, wired on ITS root) and
        // the tab's rows follow — the ◉ never asserts an emphasis the scene has left.
        setSiteHighlight('parcel');
        expect(perimeter.getAttribute('aria-pressed')).toBe('false');
        for (const a of areas) expect(a.getAttribute('aria-pressed')).toBe('true');

        // Disposed → the tab no longer repaints a detached tree; the store is untouched by dispose.
        h.dispose();
        setSiteHighlight('bbox');
        expect(getSiteHighlight()).toBe('bbox');
        for (const a of areas) expect(a.getAttribute('aria-pressed')).toBe('true'); // detached: stale by design
        hostEl.remove();
        seam.restore();
    });
});

describe('§26.6.1 — "Area computed from the ring (shoelace)…" sits ON THE SAME LINE as the Area', () => {
    it('the derivation note is a cell of the area ROW, not a caption beneath it', async () => {
        const seam = fakeEnvelopeSeam();
        const site = {
            parcel: {
                ...SITE.parcel,
                provenance: {
                    ...SITE.parcel.provenance,
                    kind: 'footprint', source: 'footprint (OSM)', label: 'OpenStreetMap building footprint',
                    refcat: 'way/123', confidence: {
                        areaOfficialM2: null, areaSigM2: 424, areaSource: 'derived-from-ring', match: 'low', geometryComplete: true,
                    },
                },
            },
        };
        const runtime = fakeRuntime(site);
        const deps: ParcelLawTabDeps = { ...defaultParcelLawTabDeps(), capabilityHost: seam.host, runtime };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const h = mountParcelLawTab(hostEl, deps);
        await tick();
        const note = h.element.querySelector<HTMLElement>('[data-testid="parcel-area-derived-note"]')!;
        expect(note, 'the derivation note was deleted — §26.6.6 forbids removing a refusal to tidy').not.toBeNull();
        expect(note.textContent).toContain('Area computed from the ring (shoelace)');
        const row = note.parentElement!;
        expect(row.classList.contains('pryzm-parcel-card-row')).toBe(true);
        expect(row.textContent).toContain('Area (from ring)');
        expect(row.textContent).toContain('424 m²');
        // ⭐ What is already right and must not be lost (§26.6.1): the amber OSM warning, Match,
        // source and timestamp — C57 §1.5 / §1.9 attribution.
        const text = h.element.textContent ?? '';
        expect(text).toContain('Building footprint (OSM) — NOT a legal cadastral parcel');
        expect(text).toContain('low');
        expect(text).toContain('OpenStreetMap building footprint');
        expect(text).toContain('2026-08-21T09:14:00Z');
        h.dispose();
        hostEl.remove();
        seam.restore();
    });
});

describe('§26.6.6 — every refusal the spec quotes is STILL PRESENT: rendered where the tab renders it, pinned at its producer where the card does', () => {
    const src = (rel: string): string => readFileSync(resolve(__dirname, rel), 'utf8');

    it('the cost-rate refusal renders on a cold tab (question 5)', async () => {
        const seam = fakeEnvelopeSeam();
        const deps: ParcelLawTabDeps = { ...defaultParcelLawTabDeps(), capabilityHost: seam.host, runtime: null };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const h = mountParcelLawTab(hostEl, deps);
        await tick();
        const q5 = h.element.querySelector(`[data-testid="${QUESTION_GROUP_TESTID_PREFIX}cost"]`)!;
        expect(q5.textContent).toContain('PRYZM ships a published, cited rate for one place only, so outside it the honest answer is a refusal. Type what YOU assume');
        h.dispose();
        hostEl.remove();
        seam.restore();
    });

    it('⛔ the sentences the CARD and its producers own are pinned verbatim at their ONE producer', () => {
        // §26.6.2 — the not-derived refusal, on the card's fold.
        expect(src('../../layout/GISAreaLayout.ts')).toContain('Values marked <i>not derived</i> were not produced by the rule pack for this zone.');
        expect(src('../../layout/GISAreaLayout.ts')).toContain('PRYZM does not infer them');
        // §26.6.4 — the Designed vs permitted table's not-checked sentence.
        const capacity = src('../../site/capacityPanelSection.ts');
        expect(capacity).toContain('Designed figures are measured from the authored model');
        expect(capacity).toContain('it is not a building-code review');
        // §26.6.3 rule 3 — the model sentence, at its ONE producer.
        // Generalised (§26.6.0 rule 3: "generalise it, do not replace it") — the clause and the
        // consequence are the allocation arm's, the template is the ONE producer's.
        expect(src('../../site/brutAreaAllocation.ts')).toContain("ceilingClause: 'no storey may overhang the buildable footprint'");
        expect(src('../../site/brutAreaAllocation.ts')).toContain("consequence: 'Nothing was allocated here.'");
        expect(src('../../site/brutAreaAllocation.ts')).toContain('less than you asked for. ${i.consequence}');
        // §26.6.5 — the allowance refusal and the two-rival-envelopes refusals.
        expect(src('../../site/envelopeCardSections.ts')).toMatch(/PRYZM will not guess/);
        expect(src('../../room-programme/roomEnvelopePlan.ts')).toContain('PRYZM will not choose for you');
        expect(src('../../site/createHousePlan.ts')).toContain('sit at the same base height');
        // §26.6.3 — the three-line legend stays.
        expect(src('../../site/envelopeCardSections.ts')).toContain('buildEnvelopeLegendHtml');
    });
});

describe('§26.6.2 — question 2 is RENAMED, the × is withheld on this host, and the four figures are NAMED as he names them', () => {
    const src = (rel: string): string => readFileSync(resolve(__dirname, rel), 'utf8');

    it('the question reads "What can I build here?" — the founder\'s words', async () => {
        const seam = fakeEnvelopeSeam();
        const deps: ParcelLawTabDeps = { ...defaultParcelLawTabDeps(), capabilityHost: seam.host, runtime: fakeRuntime(SITE) };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const h = mountParcelLawTab(hostEl, deps);
        await tick();
        const q2 = h.element.querySelector(`[data-testid="${QUESTION_GROUP_TESTID_PREFIX}law"]`)!;
        expect(q2.querySelector('.anl-plaw-q-title')!.textContent).toBe('What can I build here?');
        h.dispose();
        hostEl.remove();
        seam.restore();
    });

    it('⛔ the card\'s ✕ is withheld INSIDE this tab by scope — the producer is untouched, so the GIS hosts keep theirs', () => {
        // The card is a re-homed singleton; a host-specific branch inside its renderer would be
        // the C19 §5.7 defect. The host decides its own chrome, in its own stylesheet.
        expect(ANALYSIS_SURFACE_STYLES).toContain('.anl-parcel-law [data-testid="envelope-close"] { display: none; }');
        // …and the producer still renders it for the hosts that have a launcher pill.
        expect(src('../../layout/GISAreaLayout.ts')).toContain('data-testid="envelope-close"');
    });

    it('the four figures are present as ROWS, named as he names them — and "not derived" is never inferred', () => {
        // ⚠ REWRITTEN 2026-09-07 (§26.6.7, L-13085). This asserted four LITERALS —
        // `row('Maximum height'` etc. — and went red the moment the founder's ruling lifted the
        // four figures to the card's HEADLINE, because the headline reads their names from
        // `CEILING_LABEL` instead of re-typing them. The invariant is that the four are RENDERED
        // AS ROWS with his names and with `not derived` intact; the literal spelling of the call
        // was never the invariant, and pinning it made a correct move look like a regression.
        //
        // ⚠ REPOINTED AGAIN 2026-09-07 (lane HEADLINE-VERIFY, L-13085). It asserted
        // `row(CEILING_LABEL.<key>` in `GISAreaLayout.ts`; the headline's PRODUCER has since moved
        // to `ceilingHeadlineSection.ts` so the four could be mounted, counted and CLICKED in a
        // real DOM (`ceilingHeadline.spec.ts`) instead of grepped for the shape of a call. The
        // invariant is unchanged and is now asserted where it can be seen.
        const producer = src('../../site/ceilingHeadlineSection.ts');
        for (const key of ['levels', 'height', 'implantation', 'buildable']) {
            expect(producer).toContain(`${key}:`);
        }
        // ⭐ The names come from the ONE owner, so the card and question 3 cannot drift apart.
        expect(producer).toContain("import { CEILING_LABEL } from './intentAgainstCeilingModel'");
        // The refusal that fills a missing one STAYS (§26.6.2: "that refusal is correct and stays").
        expect(producer).toContain('CARD_NOT_DERIVED_HTML');
        expect(producer).toContain('not derived');
    });

    it('⭐ §26.6.7 RULE 1 — each of the four renders in exactly ONE place, so the lift is a MOVE', () => {
        // FOUNDER RULING 2026-09-07, closing §26.6.7's *"decision pending"*: lift the four to the
        // headline AND DROP THEM FROM THE FOLD. ⛔ Lifting without removing is the defect, not the
        // fix — it re-creates the duplication rule 1 exists to end, one edit after applying it.
        //
        // ⭐ THE MOUNTED-DOM COUNT NOW EXISTS, and it is in `ceilingHeadline.spec.ts`. This test
        // used to carry a paragraph explaining that a DOM count was impossible — `buildSiteDataBlock`
        // is an arrow inside `mountGISArea`, a ~5,500-line closure no spec can render — and that
        // counting CALL SITES was the strongest available check. Lane HEADLINE-VERIFY (L-13085)
        // removed that constraint instead of restating it: the headline's producer moved to
        // `ceilingHeadlineSection.ts`, so the four are counted in a real DOM there. What remains
        // HERE is the other half of rule 1, which only a source read can answer — that the CARD
        // does not print them a second time.
        const card = src('../../layout/GISAreaLayout.ts');
        // ⛔ ONE PRODUCER, CALLED ONCE. Two calls would be two headlines from two store reads.
        expect((card.match(/buildCeilingHeadlineHtml\(/g) ?? []).length).toBe(1);
        // ⛔ AND THE CARD CANNOT NAME THE FOUR AT ALL — two ways, both of which a re-added fold row
        // would have to take. It no longer imports `CEILING_LABEL`, so it cannot render them from
        // their owner; and no `row()` call re-types one, so it cannot render them from a literal.
        // (Prose mentions of the labels in this file's comments are deliberately not matched — the
        // §26.6.7 record OF the lift is written in them.)
        expect(card).not.toMatch(/\bCEILING_LABEL\b\s*[.[]/);
        expect(card).not.toMatch(/row\(\s*['"`]Maximum/);
    });

    it('⛔ §26.6.7 — the lift keeps rule 2: three of the four are still CONTROLS, and levels still is not', () => {
        // A figure that became plain text in the headline would be a rule-2 REGRESSION wearing a
        // rule-1 fix. ⭐ VERIFIED 2026-09-07 (L-13085): rule 2 SURVIVED the lift, and the proof is
        // `ceilingHeadline.spec.ts`, which mounts the real headline, asserts three REAL buttons
        // carrying `height` / `footprint` / `gfa`, CLICKS them into the one store the three views
        // paint from, and asserts `Maximum levels` is not a control. This test keeps the half that
        // belongs to the tab: the subject table is the module's, not four literals at a call site.
        expect(CEILING_SUBJECT).toEqual({
            levels: null, height: 'height', implantation: 'footprint', buildable: 'gfa',
        });
        // ⛔ `Maximum levels` carries NO subject, here as before: there is no geometry for
        // "storeys" to light, and §3's rule is that a row whose geometry does not exist must not
        // render as a control — a dead click is indistinguishable from a broken product.
        expect(CEILING_SUBJECT.levels).toBeNull();
        // …and the card still wires the whole panel, so the headline's controls are wired with the
        // fold's rather than needing a second wire nobody would remember to call.
        expect(src('../../layout/GISAreaLayout.ts')).toContain('wireSiteHighlightRows(panel)');
    });

    it('⛔ §26.6.7 — the SETBACK TRIPLE was relocated, not deleted, and has ONE producer', () => {
        // It lived in the headline the four figures replaced and appears NOWHERE else on the card,
        // so dropping it with the rest of that headline would have deleted data. It moved into the
        // fold's ordinance block, where it belongs on the merits — it is an ordinance limit read
        // off the derivation trace, exactly like the two rows beside it.
        const card = src('../../layout/GISAreaLayout.ts');
        expect(card).toContain("row('Setbacks (F/S/R)', setbackTriple(env)");
        expect((card.match(/const setbackTriple = /g) ?? []).length).toBe(1);
        // The old per-call local is gone, so two surfaces cannot print different setbacks.
        expect(card).not.toContain("const setback = (c: 'setback.front'");
    });

    it('⛔ §26.6.7 — the DEGENERATE refusal survives the lift, verbatim', () => {
        // Setbacks that consume the parcel mean there IS no buildable envelope, so the four
        // ceilings would print a footprint and a buildable area for land that has neither. The
        // refusal is the answer on that arm, not a placeholder for one.
        const card = src('../../layout/GISAreaLayout.ts');
        expect(card).toContain('Setbacks consume the whole parcel — no buildable envelope.');
    });
});

describe('§26.6.2 — THE SETBACK REGISTER lands in question 2, per edge, each edge a link the tab wires', () => {
    it('one row per edge in question 2, its class stated per edge, and every edge link wired with the rest', async () => {
        const seam = fakeEnvelopeSeam();
        const runtime = fakeRuntime(SITE);
        const deps: ParcelLawTabDeps = { ...defaultParcelLawTabDeps(), capabilityHost: seam.host, runtime };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const h = mountParcelLawTab(hostEl, deps);
        await tick();
        const q2 = h.element.querySelector(`[data-testid="${QUESTION_GROUP_TESTID_PREFIX}law"]`)!;
        const register = q2.querySelector<HTMLDetailsElement>(`[data-testid="${SETBACK_REGISTER_TESTID}"]`)!;
        expect(register, 'the register is not in question 2').not.toBeNull();
        expect(register.tagName).toBe('DETAILS');
        const rows = register.querySelectorAll(`[data-testid^="${SETBACK_REGISTER_ROW_PREFIX}"]`);
        expect(rows).toHaveLength(SITE.parcel.boundary.polygon.length);
        // SITE has no classifications and no determination: each row says BOTH, per edge.
        for (const r of rows) {
            expect(r.getAttribute(SETBACK_REGISTER_CLASS_ATTR)).toBe('not-recorded');
            expect(r.getAttribute(SETBACK_REGISTER_ARM_ATTR)).toBe('no-determination');
        }
        const edges = [...register.querySelectorAll<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}]`)]
            .map((b) => b.getAttribute(SITE_HIGHLIGHT_ATTR));
        expect(edges).toEqual(['edge:0', 'edge:1', 'edge:2', 'edge:3']);
        // Wired by the tab together with question 1's rows: 3 areas + perimeter + bbox + 4 edges.
        expect(Number(h.element.getAttribute(PARCEL_LAW_HIGHLIGHT_WIRED_ATTR))).toBeGreaterThanOrEqual(9);
        register.querySelector<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}="edge:2"]`)!.click();
        expect(getSiteHighlight()).toBe('edge:2');
        h.dispose();
        hostEl.remove();
        seam.restore();
    });

    it('the reader\'s disclosure state survives a store notification — a dropdown that snaps shut is an obstacle', async () => {
        const seam = fakeEnvelopeSeam();
        const runtime = fakeRuntime(SITE);
        const deps: ParcelLawTabDeps = { ...defaultParcelLawTabDeps(), capabilityHost: seam.host, runtime };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const h = mountParcelLawTab(hostEl, deps);
        await tick();
        const before = h.element.querySelector<HTMLDetailsElement>(`[data-testid="${SETBACK_REGISTER_TESTID}"]`)!;
        expect(before.open).toBe(false);
        before.open = true;
        (runtime as unknown as { siteModelStore: { _notify: () => void } }).siteModelStore._notify();
        await tick();
        const after = h.element.querySelector<HTMLDetailsElement>(`[data-testid="${SETBACK_REGISTER_TESTID}"]`)!;
        expect(after).not.toBe(before); // re-rendered from the fresh model read
        expect(after.open).toBe(true);
        h.dispose();
        hostEl.remove();
        seam.restore();
    });
});

describe('§ENVELOPE-CREATION-IS-A-STAGE-02-VERB (L-13202) — question 3 is the LEDGER, question 2 is where you ACT', () => {
    it('question 3 holds the ledger and NOTHING that creates, and question 2 holds the create block', async () => {
        const seam = fakeEnvelopeSeam();
        const deps: ParcelLawTabDeps = { ...defaultParcelLawTabDeps(), capabilityHost: seam.host, runtime: fakeRuntime(SITE) };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const h = mountParcelLawTab(hostEl, deps);
        await tick();
        const q3 = h.element.querySelector(`[data-testid="${QUESTION_GROUP_TESTID_PREFIX}intent"]`)!;
        const slot = q3.querySelector(`[data-testid="${PARCEL_LAW_INTENT_HOST_TESTID}"]`)!;
        expect(slot).not.toBeNull();
        expect(slot.querySelector(`[data-testid="${INTENT_CEILING_TESTID}"]`)).not.toBeNull();
        expect(slot.querySelector(`[data-testid="${INTENT_CEILING_UNREADABLE_TESTID}"]`)).not.toBeNull();

        // ⭐ THE FOUNDER'S RULING, AS AN ASSERTION. *"SECTION 3 SHALL HAVE ONLY THIS SCOPE"* — the
        // intent-vs-ceiling ledger. ⛔ This is the arm that FAILS if a later lane puts a create
        // verb back into question 3, which is the regression the ruling exists to prevent.
        expect(
            q3.querySelector(`[data-testid="${PARCEL_LAW_AUTHORING_HOST_TESTID}"]`),
            'the create block is back inside question 3 — the founder ruled it into question 2 twice',
        ).toBeNull();

        // ⛔ AND IT IS IN QUESTION 2, NOT MERELY ABSENT FROM 3. An assertion that only proved the
        // absence would pass just as happily on a tab that DELETED the block, which is the exact
        // failure mode C115 §3 (`C115-18`) forbids: every register row stays reachable.
        const q2 = h.element.querySelector(`[data-testid="${QUESTION_GROUP_TESTID_PREFIX}law"]`)!;
        const authoringHost = q2.querySelector(`[data-testid="${PARCEL_LAW_AUTHORING_HOST_TESTID}"]`);
        expect(authoringHost, 'the create block is in neither question — it was LOST, not moved').not.toBeNull();
        expect(authoringHost!.querySelector(`[data-testid="${AUTHORING_SLOT_TESTID}"]`)).not.toBeNull();

        // §C115-17 — the relocation stamp AND its sentence. A machine-readable attribute alone
        // satisfies a spec and tells the founder nothing; a sentence alone cannot be asserted on.
        const moved = q3.querySelector(`[data-testid="${PARCEL_LAW_AUTHORING_MOVED_TESTID}"]`);
        expect(moved, 'question 3 lost a control and left no pointer').not.toBeNull();
        expect(moved!.getAttribute(PARCEL_LAW_RELOCATED_TO_ATTR)).toBe('law');
        expect(moved!.textContent).toContain('What can I build here?');

        // ⛔ `C115-130` — STAGE 02 MUST NOT GATE STAGE 03. The ledger renders its own state with
        // no envelope in the project; the note is additive, never a branch that skips the section.
        expect(slot.textContent!.length).toBeGreaterThan(0);

        h.dispose();
        hostEl.remove();
        seam.restore();
    });

    it('inside question 2 the create block sits AFTER the determination it is measured against', async () => {
        const seam = fakeEnvelopeSeam();
        const deps: ParcelLawTabDeps = { ...defaultParcelLawTabDeps(), capabilityHost: seam.host, runtime: fakeRuntime(SITE) };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const h = mountParcelLawTab(hostEl, deps);
        await tick();
        const q2 = h.element.querySelector(`[data-testid="${QUESTION_GROUP_TESTID_PREFIX}law"]`)!;
        const order = [...q2.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid'));
        // Read the ceiling and its setbacks, THEN act on them. The design-stage strip's massing
        // pill targets the card, so a create block placed above it would leave the pill jumping
        // past the control it is meant to lead to.
        expect(order.indexOf(PARCEL_LAW_FACTS_LAW_SLOT_TESTID))
            .toBeLessThan(order.indexOf(PARCEL_LAW_AUTHORING_HOST_TESTID));
        h.dispose();
        hostEl.remove();
        seam.restore();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// ⭐ §PLOT-DISPLAY-CONTROLS-HOST + §STAGE-01-DENSITY — C115 §1.4 `C115-151` … `C115-157`.
//
// Founder 2026-09-07, on the Parcel Law panel: the SHOW ON THE PLOT group belongs in section
// ① — *"What is this plot?"* — and section ① is too tall.
//
// ⛔ THESE ARMS DRIVE THE MOUNTED TAB, NOT A BUILDER. The whole failure this lane had to avoid
// is [[committed-is-not-reachable]]: a control that exists in a module and reaches no surface.
// So each arm mounts the real tab over the real rail panel and reads the DOM the reader gets.
// ═══════════════════════════════════════════════════════════════════════════════════════

describe('§PLOT-DISPLAY-CONTROLS-HOST — SHOW ON THE PLOT is in question 1', () => {
    afterEach(() => {
        __resetPlotDisplayControlsHostForTests();
        __resetBuildableEnvelopeVisibilityForTests();
        resetQuestionGroupOpenState();
    });

    it('⭐ question 1 carries BOTH switches and the caption — the founder\'s ask, at the layer he sees', async () => {
        const seam = fakeEnvelopeSeam();
        const deps: ParcelLawTabDeps = { ...defaultParcelLawTabDeps(), capabilityHost: seam.host, runtime: fakeRuntime(SITE) };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const h = mountParcelLawTab(hostEl, deps);
        await tick();

        const q1 = h.element.querySelector(`[data-testid="${QUESTION_GROUP_TESTID_PREFIX}plot"]`)!;
        const slot = q1.querySelector(`[data-testid="${PARCEL_LAW_PLOT_DISPLAY_TESTID}"]`);
        expect(slot, 'the group the founder asked for is not in section ①').not.toBeNull();
        expect(slot!.querySelector(`[data-testid="${ENVELOPE_VOLUME_TOGGLE_TESTID}"]`)).not.toBeNull();
        expect(slot!.querySelector(`[data-testid="${ENVELOPE_FOOTPRINT_TOGGLE_TESTID}"]`)).not.toBeNull();
        // C58 §1.2 / §L-616 — the confidence qualifier travels with the shade wherever it is drawn.
        expect(slot!.querySelector(`[data-testid="${ENVELOPE_AXES_CAPTION_TESTID}"]`)?.textContent ?? '')
            .toMatch(/buildable/i);

        h.dispose(); hostEl.remove(); seam.restore();
    });

    it('⭐ a click writes the ONE authority and the switch repaints from it — not from a local mirror', async () => {
        const seam = fakeEnvelopeSeam();
        const deps: ParcelLawTabDeps = { ...defaultParcelLawTabDeps(), capabilityHost: seam.host, runtime: fakeRuntime(SITE) };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const h = mountParcelLawTab(hostEl, deps);
        await tick();

        const q1 = h.element.querySelector(`[data-testid="${QUESTION_GROUP_TESTID_PREFIX}plot"]`)!;
        const vol = () => q1.querySelector<HTMLElement>(`[data-testid="${ENVELOPE_VOLUME_TOGGLE_TESTID}"]`)!;
        expect(getBuildableEnvelopeAxes().volume).toBe(true);
        expect(vol().getAttribute('aria-checked')).toBe('true');

        vol().click();

        // ⛔ THE AUTHORITY, NOT A FLAG THIS FILE OWNS. `envelopeVisibility.ts` is what every
        // viewport reads; a control that flipped its own label without writing here is the
        // L-1170 defect, and it is exactly what a screenshot cannot tell you apart from a fix.
        expect(getBuildableEnvelopeAxes().volume).toBe(false);
        expect(
            getBuildableEnvelopeAxes().footprint,
            'one click may never write BOTH axes — that would delete the L-1188 distinction',
        ).toBe(true);
        // …and the surface repainted from the subscription, so it cannot show a state the
        // viewports disagree with.
        expect(vol().getAttribute('aria-checked')).toBe('false');

        h.dispose(); hostEl.remove(); seam.restore();
    });

    it('⛔ the claim is LIVE by the time the envelope card first renders — no flash of a second control', async () => {
        // ⭐ WHAT THIS PINS, AND — HONESTLY — WHAT IT DOES NOT.
        //
        // It pins that the job is ALREADY taken at the moment the envelope card first asks, which
        // is the exact moment `envelopeToggleHtml()` asks in production. Move the claim after the
        // microtask the card's own claim lands on, or drop it, and this arm goes red — the reader
        // would otherwise see a second, un-subscribed pair of switches for one render.
        //
        // ⚠ IT DID NOT FIND THE ORDERING BUG THIS FIX ALSO CORRECTS, and saying so is the point.
        // The first draft claimed while this body was still DETACHED, and a claim held by an
        // element that is not in the document is — by the arbiter's own self-healing rule — not a
        // claim. That was found by READING, not by this arm: by the time any test can observe the
        // claim the body is attached, so the arm passes either way. What would falsify it is a
        // read of `plotDisplayControlsClaimed()` taken between the claim and the attach, and no
        // surface in this harness makes one. Recorded rather than dressed up.
        __resetPlotDisplayControlsHostForTests();
        const seam = fakeEnvelopeSeam();
        const seen: boolean[] = [];
        const inner = window.pryzmMountEnvelopeCard!;
        window.pryzmMountEnvelopeCard = (h: HTMLElement | null): boolean => {
            seen.push(plotDisplayControlsClaimed());
            return inner(h);
        };
        const deps: ParcelLawTabDeps = { ...defaultParcelLawTabDeps(), capabilityHost: seam.host, runtime: fakeRuntime(SITE) };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const h = mountParcelLawTab(hostEl, deps);
        await tick();

        expect(seen.length, 'the rail panel must have claimed the card at least once').toBeGreaterThan(0);
        expect(
            seen[0],
            'the card asked before question 1 owned the switches — it would render a second, un-subscribed pair',
        ).toBe(true);

        h.dispose(); hostEl.remove(); seam.restore();
    });

    it('⭐ while the panel is mounted the job is CLAIMED, and dispose hands it back', async () => {
        // The claim is what stops the envelope card — re-parented into question 2 by this very
        // tab — from drawing a second, un-subscribed pair of switches one screen further down.
        __resetPlotDisplayControlsHostForTests();
        expect(plotDisplayControlsClaimed()).toBe(false);
        const seam = fakeEnvelopeSeam();
        const deps: ParcelLawTabDeps = { ...defaultParcelLawTabDeps(), capabilityHost: seam.host, runtime: fakeRuntime(SITE) };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const h = mountParcelLawTab(hostEl, deps);
        await tick();
        expect(plotDisplayControlsClaimed(), 'question 1 must own the switches while it is on screen').toBe(true);

        h.dispose();
        // ⛔ AND IT MUST COME BACK. A tab that kept the claim after teardown would leave the
        // viewport card with no way to hide the envelope — a lost capability, which is strictly
        // worse than the placement complaint this lane started from.
        expect(plotDisplayControlsClaimed()).toBe(false);
        hostEl.remove(); seam.restore();
    });
});

describe('§STAGE-01-DENSITY — "View full parcel data" (C115 §1.4 `C115-111`/`C115-155`)', () => {
    afterEach(() => {
        __resetPlotDisplayControlsHostForTests();
        resetQuestionGroupOpenState();
    });

    it('⭐ the technical rows are BEHIND the disclosure, and the disclosure is IN question 1', async () => {
        const seam = fakeEnvelopeSeam();
        const deps: ParcelLawTabDeps = { ...defaultParcelLawTabDeps(), capabilityHost: seam.host, runtime: fakeRuntime(SITE) };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const h = mountParcelLawTab(hostEl, deps);
        await tick();

        const q1 = h.element.querySelector(`[data-testid="${QUESTION_GROUP_TESTID_PREFIX}plot"]`)!;
        const fold = q1.querySelector<HTMLDetailsElement>(`[data-testid="${PARCEL_LAW_DETAIL_FOLD_TESTID}"]`);
        expect(fold, 'C115-111 names this control by these words').not.toBeNull();
        expect(fold!.open, 'collapsed by default — that is what makes the section shorter').toBe(false);
        expect(fold!.textContent).toContain(PARCEL_LAW_DETAIL_FOLD_SUMMARY);

        // ⛔ SMALLER IS NOT FEWER. Each row is still in the DOM, still carries the testid it had,
        // and is one click away — `C115-155`'s mapping, asserted rather than asserted-in-prose.
        for (const id of ['parcel-law-fact-parcel-perimeter', 'parcel-law-fact-parcel-bbox', 'parcel-law-fact-parcel-edges']) {
            const row = q1.querySelector(`[data-testid="${id}"]`);
            expect(row, `${id} must survive the densification`).not.toBeNull();
            expect(fold!.contains(row!), `${id} belongs behind the disclosure`).toBe(true);
        }
        // …and the route sentence went with them, still one element, still the same words.
        const note = q1.querySelector<HTMLElement>(`[data-testid="${PARCEL_LAW_PLOT_ROUTE_TESTID}"]`)!;
        expect(note).not.toBeNull();
        expect(note.textContent).toBe(PARCEL_LAW_PLOT_ROUTE_NOTE);
        expect(fold!.contains(note)).toBe(true);
        expect(
            q1.querySelectorAll(`[data-testid="${PARCEL_LAW_PLOT_ROUTE_TESTID}"]`).length,
            'the node is MOVED, never copied — two sentences could drift',
        ).toBe(1);

        h.dispose(); hostEl.remove(); seam.restore();
    });

    it('⛔ the FACE keeps every honesty string and the attribution — C115-152', async () => {
        const seam = fakeEnvelopeSeam();
        const deps: ParcelLawTabDeps = { ...defaultParcelLawTabDeps(), capabilityHost: seam.host, runtime: fakeRuntime(SITE) };
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const h = mountParcelLawTab(hostEl, deps);
        await tick();

        const q1 = h.element.querySelector(`[data-testid="${QUESTION_GROUP_TESTID_PREFIX}plot"]`)!;
        const fold = q1.querySelector<HTMLDetailsElement>(`[data-testid="${PARCEL_LAW_DETAIL_FOLD_TESTID}"]`)!;
        // C57 §1.9 — attribution is a licence obligation, and a licence line one click away was
        // not displayed. The area rows and the match tier are the reader's confidence signals.
        const attribution = q1.querySelector('[data-testid="parcel-source-attribution"]');
        expect(attribution).not.toBeNull();
        expect(fold.contains(attribution!), 'Source: may never go behind a fold').toBe(false);
        const area = q1.querySelector('[data-testid="parcel-card-area"]');
        expect(area, 'the plot area is the answer to question 1').not.toBeNull();
        expect(fold.contains(area!)).toBe(false);
        expect(q1.textContent).toContain('Licence:');
        expect(q1.textContent).toContain('Match');

        h.dispose(); hostEl.remove(); seam.restore();
    });
});
