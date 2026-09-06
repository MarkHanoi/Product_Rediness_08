/**
 * §PARCEL-LAW-TAB (L-12915 · STR §24.1 item 2) / §VIEW-PANEL-PER-PANE (founder 2026-09-06) —
 * the view switcher is a HOST of declared GIS actions, and it never paints a dead click.
 *
 * ⛔ The registry is NOT stubbed. The subject is the real table — now DERIVED from
 * `viewPanelOptions()`, the ONE panel definition — against the real `GIS_ACTIONS`; the only
 * fake is the HOST (the `window`-shaped object carrying the entry points), which is the
 * environment, not the subject. A fake built from the header cannot falsify the header — so
 * the host fakes here record CALLS, and the assertions are about which registered function a
 * click reached, not about what the button says.
 *
 * ⭐ UPDATED 2026-09-06 (§VIEW-PANEL-PER-PANE). The founder specified the panel's contents
 * himself: *"2D SITE MAP / 2D SATELLITE / 3D SITE / 3D GLOBE / 3D PRYZM / 2D PRYZM"*. Three
 * things follow, and each has an arm below:
 *   · The table is SIX rows and comes from `viewPanelOptions()`, not from four literals here.
 *   · `2D Satellite` dispatches the basemap swap that ALREADY EXISTED (`swapBasemap`,
 *     A.8.c.f.4) — his *"MASKED FOR ANOTHER PANEL"* was a reachability complaint.
 *   · `Plan (oblique)` left THIS host and is still reachable elsewhere — a route is added,
 *     never removed (C19 §5.6 clause 4).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    VIEW_SEGMENTS,
    VIEW_SEGMENT_ATTR,
    VIEW_SEGMENT_ACTIVE_ATTR,
    VIEW_SEGMENT_UNAVAILABLE_ATTR,
    VIEW_SEGMENT_UNREPORTED_ATTR,
    VIEW_SEGMENT_STATUS_TESTID,
    VIEW_SEGMENT_NO_SNAPSHOT_TEXT,
    mountViewSegmentSwitcher,
    viewSegmentAction,
    type ViewSegmentDef,
} from '../viewSegmentSwitcher';
import { viewPanelOptions } from '../../../engine/views/viewPanelOptions';
import { GIS_ACTIONS, type GisCapabilityHost, type GisSiteViewState } from '../../gis/gisActionRegistry';

/** A host where every entry point the six rows need exists and records its calls. */
function makeHost(state: GisSiteViewState | null): { host: GisCapabilityHost; calls: string[] } {
    const calls: string[] = [];
    const host: GisCapabilityHost = {
        pryzmEnterSiteView: (initial) => { calls.push(`pryzmEnterSiteView(${initial ?? ''})`); },
        pryzmShowSiteResultView: (initial) => { calls.push(`pryzmShowSiteResultView(${initial ?? ''})`); },
        pryzmActivateBimView: (mode) => { calls.push(`pryzmActivateBimView(${mode ?? ''})`); },
        pryzmSetSiteBasemap: (next) => { calls.push(`pryzmSetSiteBasemap(${next})`); },
        ...(state ? { pryzmGetSiteViewState: () => state } : {}),
    };
    return { host, calls };
}

const btn = (root: HTMLElement, id: string): HTMLButtonElement =>
    root.querySelector<HTMLButtonElement>(`button[${VIEW_SEGMENT_ATTR}="${id}"]`)!;

const segFor = (id: string): ViewSegmentDef => VIEW_SEGMENTS.find((s) => s.id === id)!;

describe('§VIEW-PANEL-PER-PANE — the table is DERIVED from the ONE panel definition', () => {
    it('⭐ has the founder\'s SIX rows, in his order, under his words', () => {
        expect(VIEW_SEGMENTS.map((s) => s.id)).toEqual([
            'site-map', 'site-satellite', 'site-3d', 'site-globe', 'pryzm-3d', 'pryzm-2d',
        ]);
        expect(VIEW_SEGMENTS.map((s) => s.label)).toEqual([
            '2D Site Map', '2D Satellite', '3D Site', '3D Globe', '3D PRYZM', '2D PRYZM',
        ]);
    });

    it('⛔ it is not a second census — the rows ARE `viewPanelOptions()`', () => {
        // Two hosts render this definition (this one against `GIS_ACTIONS`, the pane panel
        // against `PaneLayoutStore`). A hand-copied list here is how the founder would come
        // to see two different "main panels" — which is the complaint that started the lane.
        expect(VIEW_SEGMENTS.map((s) => s.id)).toEqual(viewPanelOptions().map((o) => o.id));
        expect(VIEW_SEGMENTS.map((s) => s.actionId)).toEqual(viewPanelOptions().map((o) => o.actionId));
    });

    it('⛔ every segment points at a DECLARED GIS action with a registered entry point', () => {
        for (const seg of VIEW_SEGMENTS) {
            const decl = viewSegmentAction(seg);
            expect(decl, `${seg.id} → "${seg.actionId}" is not in GIS_ACTIONS`).not.toBeNull();
            expect(decl!.group).toBe('siteViews');
            // A segment bound to an action with NO entry point would be permanently disabled
            // — declared, but a dead segment on a control whose whole point is switching.
            expect(decl!.entryPoints.length, `${seg.actionId} has no entry point`).toBeGreaterThan(0);
        }
    });

    it('the six rows are six DIFFERENT actions (no two words for one route)', () => {
        const ids = VIEW_SEGMENTS.map((s) => s.actionId);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.every((id) => GIS_ACTIONS.some((a) => a.id === id))).toBe(true);
    });

    it('⛔ the label on the button IS the registry\'s label — one spelling per action', () => {
        // C84 EI-8. The founder saw "3D Site" mean two different things once already.
        for (const seg of VIEW_SEGMENTS) {
            expect(viewSegmentAction(seg)!.label, `${seg.id} is spelled twice`).toBe(seg.label);
        }
    });

    it('⛔ "3D PRYZM" is a FULL-CANVAS view, not the right-edge dual pane', () => {
        // The regression ratchet for §PARCEL-LAW-BIM3D. `site.bim-split` opens
        // `splitViewManager`, whose pane is drawn behind whatever right-hand surface hosts
        // this control. Re-pointing the row back at it restores an invisible click.
        const decl = viewSegmentAction(segFor('pryzm-3d'))!;
        expect(segFor('pryzm-3d').actionId).toBe('site.bim-3d');
        expect(decl.entryPoints).toEqual(['pryzmActivateBimView']);
        expect(decl.entryPoints).not.toContain('pryzmShowSiteResultView');
        // …and "2D PRYZM" is its plan sibling through the SAME already-registered entry
        // point, which had never been named by an action.
        expect(viewSegmentAction(segFor('pryzm-2d'))!.entryPoints).toEqual(['pryzmActivateBimView']);
    });

    it('does NOT remove site.bim-split or site.plan-oblique — a route is added, never removed', () => {
        // C19 §5.6 clause 4. The dual pane is still correct in a full-canvas mode, and the
        // GIS bar still offers it. `site.plan-oblique` is not one of the founder's six and
        // left THIS host — but `renderGisActions` renders EVERY declared action and refuses
        // a caller-supplied id list, so the Project Browser's GIS panel still carries it.
        // That is the founder's own escape hatch: "they can do it in the browser".
        for (const id of ['site.bim-split', 'site.plan-oblique', 'site.plan-gis']) {
            expect(GIS_ACTIONS.some((a) => a.id === id), `${id} was deleted`).toBe(true);
        }
        const renderer = readFileSync(
            resolve(__dirname, '../../gis/renderGisActions.ts'), 'utf8',
        );
        expect(renderer).toContain('for (const a of GIS_ACTIONS)');
    });
});

describe('§VIEW-PANEL-PER-PANE — a click reaches the SAME registered function the GIS bar drives', () => {
    it('all six rows dispatch their declared entry points, in the founder\'s order', () => {
        const { host, calls } = makeHost({ segment: '2D', formaMode: 'plan', buildingFidelity: 'real' });
        const h = mountViewSegmentSwitcher(host);
        document.body.appendChild(h.element);

        for (const seg of VIEW_SEGMENTS) btn(h.element, seg.id).click();

        expect(calls).toEqual([
            // 2D Site Map — the view AND the basemap, because pressing it from satellite
            // must actually change what is on screen.
            'pryzmEnterSiteView(map2d)', 'pryzmSetSiteBasemap(map)',
            // ⭐ 2D Satellite — the promotion of `swapBasemap`, reached from the panel.
            'pryzmEnterSiteView(map2d)', 'pryzmSetSiteBasemap(satellite)',
            'pryzmEnterSiteView(3d)',
            'pryzmShowSiteResultView(3D)',
            'pryzmActivateBimView(3D)',
            'pryzmActivateBimView(Top)',
        ]);
        // ⛔ Nothing on this control opens the split-view dual pane.
        expect(calls.some((c) => c.startsWith('pryzmShowSiteResultView(2D'))).toBe(false);
        h.dispose();
        h.element.remove();
    });

    it('contributes NO handler of its own — with no entry points registered, no call is ever made', () => {
        const host: GisCapabilityHost = {};
        const h = mountViewSegmentSwitcher(host);
        for (const seg of VIEW_SEGMENTS) {
            const b = btn(h.element, seg.id);
            expect(b.disabled).toBe(true);
            expect(b.getAttribute(VIEW_SEGMENT_UNAVAILABLE_ATTR)).toBe('true');
            b.click(); // must be inert
        }
        h.dispose();
    });
});

describe('§VIEW-PANEL-PER-PANE — no dead clicks: every unavailable state prints its reason', () => {
    it('an unresolved segment is DISABLED, marked, and its title names the missing entry point', () => {
        // Only the result-view + BIM entry points exist → the site/2D rows cannot resolve.
        const host: GisCapabilityHost = {
            pryzmShowSiteResultView: () => { /* recorded elsewhere */ },
            pryzmActivateBimView: () => { /* recorded elsewhere */ },
        };
        const h = mountViewSegmentSwitcher(host);
        const site = btn(h.element, 'site-3d');
        expect(site.disabled).toBe(true);
        expect(site.getAttribute('aria-disabled')).toBe('true');
        expect(site.title).toContain('pryzmEnterSiteView');
        expect(site.textContent).toContain('unavailable');
        // …and the two that CAN resolve are live.
        expect(btn(h.element, 'pryzm-3d').disabled).toBe(false);
        expect(btn(h.element, 'site-globe').disabled).toBe(false);
        h.dispose();
    });

    it('⭐ 2D Satellite goes DISABLED when the BASEMAP entry point is the missing one', () => {
        // The seam it depends on, named on the control rather than silent. A satellite
        // button that opened the cream map and changed nothing is the exact defect the
        // founder reported one layer up.
        const host: GisCapabilityHost = {
            pryzmEnterSiteView: () => { /* live */ },
            pryzmShowSiteResultView: () => { /* live */ },
            pryzmActivateBimView: () => { /* live */ },
        };
        const h = mountViewSegmentSwitcher(host);
        for (const id of ['site-satellite', 'site-map']) {
            const b = btn(h.element, id);
            expect(b.disabled).toBe(true);
            expect(b.title).toContain('pryzmSetSiteBasemap');
        }
        expect(btn(h.element, 'site-3d').disabled).toBe(false);
        h.dispose();
    });

    it('3D PRYZM goes DISABLED when its own entry point is the missing one', () => {
        const host: GisCapabilityHost = {
            pryzmEnterSiteView: () => { /* live */ },
            pryzmShowSiteResultView: () => { /* live */ },
            pryzmSetSiteBasemap: () => { /* live */ },
        };
        const h = mountViewSegmentSwitcher(host);
        for (const id of ['pryzm-3d', 'pryzm-2d']) {
            const b = btn(h.element, id);
            expect(b.disabled).toBe(true);
            expect(b.title).toContain('pryzmActivateBimView');
        }
        h.dispose();
    });

    it('with NOTHING registered the status line says so, in words', () => {
        const h = mountViewSegmentSwitcher({});
        const status = h.element.querySelector(`[data-testid="${VIEW_SEGMENT_STATUS_TESTID}"]`)!;
        expect(status.textContent).toContain('No view can be switched from here');
        h.dispose();
    });

    it('with entry points but NO snapshot, nothing is highlighted and the status says why', () => {
        const { host } = makeHost(null);
        const h = mountViewSegmentSwitcher(host);
        expect(h.element.querySelector(`[${VIEW_SEGMENT_ACTIVE_ATTR}]`)).toBeNull();
        const status = h.element.querySelector(`[data-testid="${VIEW_SEGMENT_STATUS_TESTID}"]`)!;
        expect(status.textContent).toBe(VIEW_SEGMENT_NO_SNAPSHOT_TEXT);
        h.dispose();
    });
});

describe('§VIEW-PANEL-PER-PANE — the active segment is DERIVED from the snapshot, never mirrored', () => {
    it('paints exactly the segment the snapshot reports, and moves it on repaint()', () => {
        let state: GisSiteViewState = { segment: '3D', formaMode: '3d', buildingFidelity: 'real' };
        const { host } = makeHost(null);
        (host as { pryzmGetSiteViewState?: () => GisSiteViewState }).pryzmGetSiteViewState = () => state;
        const h = mountViewSegmentSwitcher(host);
        const active = (): string[] =>
            [...h.element.querySelectorAll(`[${VIEW_SEGMENT_ACTIVE_ATTR}]`)]
                .map((b) => b.getAttribute(VIEW_SEGMENT_ATTR)!);
        expect(active()).toEqual(['site-globe']);
        expect(btn(h.element, 'site-globe').getAttribute('aria-pressed')).toBe('true');
        expect(btn(h.element, 'site-3d').getAttribute('aria-pressed')).toBe('false');

        // The authority moved (from the GIS bar, say). The control does not know until asked.
        state = { segment: 'forma', formaMode: '3d', buildingFidelity: 'massing' };
        expect(active()).toEqual(['site-globe']); // snapshot — stated, not hidden
        h.repaint();
        expect(active()).toEqual(['site-3d']);
        h.dispose();
    });

    it('⭐ THE BASEMAP DECIDES which 2D row is lit — never both, never the wrong one', () => {
        let state: GisSiteViewState = {
            segment: 'forma', formaMode: 'map2d', buildingFidelity: 'massing', basemap: 'map',
        };
        const { host } = makeHost(null);
        (host as { pryzmGetSiteViewState?: () => GisSiteViewState }).pryzmGetSiteViewState = () => state;
        const h = mountViewSegmentSwitcher(host);
        const active = (): string[] =>
            [...h.element.querySelectorAll(`[${VIEW_SEGMENT_ACTIVE_ATTR}]`)]
                .map((b) => b.getAttribute(VIEW_SEGMENT_ATTR)!);
        expect(active()).toEqual(['site-map']);
        state = { ...state, basemap: 'satellite' };
        h.repaint();
        expect(active()).toEqual(['site-satellite']);
        h.dispose();
    });

    it('⛔ an UNREPORTED basemap lights NEITHER 2D row — it is a missing reading, not "cream"', () => {
        // C84 EI-1b. A host registered before `basemap` existed returns a snapshot without
        // it; defaulting to `'map'` would light "2D Site Map" over satellite imagery.
        const { host } = makeHost({ segment: 'forma', formaMode: 'map2d', buildingFidelity: 'massing' });
        const h = mountViewSegmentSwitcher(host);
        expect(h.element.querySelector(`[${VIEW_SEGMENT_ACTIVE_ATTR}]`)).toBeNull();
        h.dispose();
    });

    it('a snapshot the six do not cover (the plan-oblique site view) highlights nothing', () => {
        const { host } = makeHost({ segment: 'forma', formaMode: 'plan', buildingFidelity: 'massing' });
        const h = mountViewSegmentSwitcher(host);
        expect(h.element.querySelector(`[${VIEW_SEGMENT_ACTIVE_ATTR}]`)).toBeNull();
        h.dispose();
    });
});

describe('§PARCEL-LAW-TAB — UNREPORTED ≠ NOT CURRENT (C84 EI-1b)', () => {
    // `GisSiteViewState` has no field for which model view ViewController activated, so
    // `site.bim-3d` and `site.bim-plan` declare no `activeWhen`. The control must say
    // "I cannot tell you", never paint "off" — failure and emptiness collapsing into one
    // value is the defect this repo pays for most often.

    it('the two PRYZM actions deliberately declare NO activeWhen', () => {
        for (const id of ['pryzm-3d', 'pryzm-2d']) {
            expect(viewSegmentAction(segFor(id))!.activeWhen).toBeUndefined();
        }
        // …while the other four DO, so this is a stated gap and not a general omission.
        for (const id of ['site-map', 'site-satellite', 'site-3d', 'site-globe']) {
            expect(viewSegmentAction(segFor(id))!.activeWhen, `${id} lost its activeWhen`)
                .toBeTypeOf('function');
        }
    });

    it('marks the unreportable segments as UNREPORTED — live, never highlighted, aria-pressed="mixed"', () => {
        const { host } = makeHost({
            segment: 'forma', formaMode: 'map2d', buildingFidelity: 'real', basemap: 'map',
        });
        const h = mountViewSegmentSwitcher(host);
        const bim = btn(h.element, 'pryzm-3d');
        expect(bim.disabled).toBe(false);                                   // it WORKS
        expect(bim.getAttribute(VIEW_SEGMENT_UNREPORTED_ATTR)).toBe('true'); // …but is unreadable
        expect(bim.getAttribute(VIEW_SEGMENT_ACTIVE_ATTR)).toBeNull();
        expect(bim.getAttribute('aria-pressed')).toBe('mixed');
        expect(bim.title).toContain('pryzmGetSiteViewState');
        // The four that CAN be reported keep the binary reading.
        expect(btn(h.element, 'site-map').getAttribute('aria-pressed')).toBe('true');
        expect(btn(h.element, 'site-3d').getAttribute(VIEW_SEGMENT_UNREPORTED_ATTR)).toBeNull();
        h.dispose();
    });

    it('names the unreported views in the status line when nothing is highlighted', () => {
        const { host } = makeHost({ segment: 'forma', formaMode: 'plan', buildingFidelity: 'massing' });
        const h = mountViewSegmentSwitcher(host);
        const status = h.element.querySelector(`[data-testid="${VIEW_SEGMENT_STATUS_TESTID}"]`)!;
        expect(status.textContent).toContain('3D PRYZM');
        expect(status.textContent).toContain('not reported');
        // The snapshot it COULD read is still quoted — a missing reading, not a blank.
        expect(status.textContent).toContain('plan');
        h.dispose();
    });

    it('an UNAVAILABLE segment is not marked unreported — they are different facts', () => {
        const h = mountViewSegmentSwitcher({});
        expect(btn(h.element, 'pryzm-3d').getAttribute(VIEW_SEGMENT_UNREPORTED_ATTR)).toBeNull();
        h.dispose();
    });
});
