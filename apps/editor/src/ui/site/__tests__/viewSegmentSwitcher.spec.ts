/**
 * §PARCEL-LAW-TAB (L-12915 · STR §24.1 item 2) — the four-view switcher is a HOST of
 * declared GIS actions, and it never paints a dead click.
 *
 * ⛔ The registry is NOT stubbed. The subject is the real `VIEW_SEGMENTS` table against the
 * real `GIS_ACTIONS`; the only fake is the HOST (the `window`-shaped object carrying the entry
 * points), which is the environment, not the subject. A fake built from the header cannot
 * falsify the header — so the host fakes here record CALLS, and the assertions are about which
 * registered function a click reached, not about what the button says.
 *
 * ⭐ UPDATED 2026-09-06 (§PARCEL-LAW-BIM3D). "BIM 3D" used to dispatch `site.bim-split`, the
 * BIM DUAL PANE. From this control's own host — the Parcel Law tab, which lives on
 * `#anl-surface` (`position: fixed; right: 0; width: 50%; z-index: 50`) — that opened
 * `.svp-pane` (`position: fixed; right: 0; width: 40%; z-index: 1`) ENTIRELY BEHIND the panel,
 * and `SplitViewManager._buildDOM` additionally wrote `#container.style.width = '60%'` over the
 * 50% the shell had set. The segment now points at the declared `site.bim-3d`, which dispatches
 * the already-registered `pryzmActivateBimView('3D')` entry point and opens no pane at all.
 */

import { describe, it, expect } from 'vitest';
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
} from '../viewSegmentSwitcher';
import { GIS_ACTIONS, type GisCapabilityHost, type GisSiteViewState } from '../../gis/gisActionRegistry';

/** A host where the four site-view entry points exist and record their calls. */
function makeHost(state: GisSiteViewState | null): { host: GisCapabilityHost; calls: string[] } {
    const calls: string[] = [];
    const host: GisCapabilityHost = {
        pryzmEnterSiteView: (initial) => { calls.push(`pryzmEnterSiteView(${initial ?? ''})`); },
        pryzmShowSiteResultView: (initial) => { calls.push(`pryzmShowSiteResultView(${initial ?? ''})`); },
        pryzmActivateBimView: (mode) => { calls.push(`pryzmActivateBimView(${mode ?? ''})`); },
        ...(state ? { pryzmGetSiteViewState: () => state } : {}),
    };
    return { host, calls };
}

const btn = (root: HTMLElement, id: string): HTMLButtonElement =>
    root.querySelector<HTMLButtonElement>(`button[${VIEW_SEGMENT_ATTR}="${id}"]`)!;

describe('§PARCEL-LAW-TAB — the table is DERIVED from the registry', () => {
    it('has the founder\'s four views, in his order', () => {
        expect(VIEW_SEGMENTS.map((s) => s.id)).toEqual(['plan', 'bim-3d', 'site-3d', 'globe']);
        expect(VIEW_SEGMENTS.map((s) => s.label)).toEqual(['Plan', 'BIM 3D', '3D Site', '3D Globe']);
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

    it('the four actions are four DIFFERENT actions (no two words for one view)', () => {
        const ids = VIEW_SEGMENTS.map((s) => s.actionId);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.every((id) => GIS_ACTIONS.some((a) => a.id === id))).toBe(true);
    });

    it('⛔ "BIM 3D" is a LEFT-PANE view, not the right-edge dual pane', () => {
        // The regression ratchet for §PARCEL-LAW-BIM3D. `site.bim-split` opens
        // `splitViewManager`, whose pane is drawn behind whatever right-hand surface hosts
        // this control. Re-pointing the segment back at it restores an invisible click.
        const decl = viewSegmentAction(VIEW_SEGMENTS[1])!;
        expect(VIEW_SEGMENTS[1].actionId).toBe('site.bim-3d');
        expect(decl.entryPoints).toEqual(['pryzmActivateBimView']);
        expect(decl.entryPoints).not.toContain('pryzmShowSiteResultView');
    });

    it('does NOT remove site.bim-split from the registry — a route is added, never removed', () => {
        // C19 §5.6 clause 4. The dual pane is still correct in a full-canvas mode, and the
        // GIS bar still offers it; this lane changed which action ONE host dispatches.
        expect(GIS_ACTIONS.some((a) => a.id === 'site.bim-split')).toBe(true);
    });
});

describe('§PARCEL-LAW-TAB — a click reaches the SAME registered function the GIS bar drives', () => {
    it('Plan → pryzmEnterSiteView(plan) · BIM 3D → pryzmActivateBimView(3D) · 3D Site → pryzmEnterSiteView(3d) · 3D Globe → pryzmShowSiteResultView(3D)', () => {
        const { host, calls } = makeHost({ segment: '2D', formaMode: 'plan', buildingFidelity: 'real' });
        const h = mountViewSegmentSwitcher(host);
        document.body.appendChild(h.element);

        btn(h.element, 'plan').click();
        btn(h.element, 'bim-3d').click();
        btn(h.element, 'site-3d').click();
        btn(h.element, 'globe').click();

        expect(calls).toEqual([
            'pryzmEnterSiteView(plan)',
            'pryzmActivateBimView(3D)',
            'pryzmEnterSiteView(3d)',
            'pryzmShowSiteResultView(3D)',
        ]);
        // ⛔ Nothing on this control opens the split-view dual pane any more.
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

describe('§PARCEL-LAW-TAB — no dead clicks: every unavailable state prints its reason', () => {
    it('an unresolved segment is DISABLED, marked, and its title names the missing entry point', () => {
        // Only the result-view + BIM entry points exist → Plan / 3D Site cannot resolve.
        const host: GisCapabilityHost = {
            pryzmShowSiteResultView: () => { /* recorded elsewhere */ },
            pryzmActivateBimView: () => { /* recorded elsewhere */ },
        };
        const h = mountViewSegmentSwitcher(host);
        const plan = btn(h.element, 'plan');
        expect(plan.disabled).toBe(true);
        expect(plan.getAttribute('aria-disabled')).toBe('true');
        expect(plan.title).toContain('pryzmEnterSiteView');
        expect(plan.textContent).toContain('unavailable');
        // …and the two that CAN resolve are live.
        expect(btn(h.element, 'bim-3d').disabled).toBe(false);
        expect(btn(h.element, 'globe').disabled).toBe(false);
        h.dispose();
    });

    it('BIM 3D goes DISABLED when its own entry point is the missing one', () => {
        // The seam this segment now depends on, named on the control rather than silent.
        const host: GisCapabilityHost = {
            pryzmEnterSiteView: () => { /* live */ },
            pryzmShowSiteResultView: () => { /* live */ },
        };
        const h = mountViewSegmentSwitcher(host);
        const bim = btn(h.element, 'bim-3d');
        expect(bim.disabled).toBe(true);
        expect(bim.title).toContain('pryzmActivateBimView');
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

describe('§PARCEL-LAW-TAB — the active segment is DERIVED from the snapshot, never mirrored', () => {
    it('paints exactly the segment the snapshot reports, and moves it on repaint()', () => {
        let state: GisSiteViewState = { segment: '3D', formaMode: '3d', buildingFidelity: 'real' };
        const host: GisCapabilityHost = {
            pryzmEnterSiteView: () => { /* noop */ },
            pryzmShowSiteResultView: () => { /* noop */ },
            pryzmActivateBimView: () => { /* noop */ },
            pryzmGetSiteViewState: () => state,
        };
        const h = mountViewSegmentSwitcher(host);
        const active = (): string[] =>
            [...h.element.querySelectorAll(`[${VIEW_SEGMENT_ACTIVE_ATTR}]`)].map((b) => b.getAttribute(VIEW_SEGMENT_ATTR)!);
        expect(active()).toEqual(['globe']);
        expect(btn(h.element, 'globe').getAttribute('aria-pressed')).toBe('true');
        expect(btn(h.element, 'plan').getAttribute('aria-pressed')).toBe('false');

        // The authority moved (from the GIS bar, say). The control does not know until asked.
        state = { segment: 'forma', formaMode: 'plan', buildingFidelity: 'massing' };
        expect(active()).toEqual(['globe']); // snapshot — stated, not hidden
        h.repaint();
        expect(active()).toEqual(['plan']);

        state = { segment: 'forma', formaMode: '3d', buildingFidelity: 'massing' };
        h.repaint();
        expect(active()).toEqual(['site-3d']);
        h.dispose();
    });

    it('a snapshot the four do not cover (the Forma 2D draw map) highlights nothing', () => {
        const { host } = makeHost({ segment: 'forma', formaMode: 'map2d', buildingFidelity: 'massing' });
        const h = mountViewSegmentSwitcher(host);
        expect(h.element.querySelector(`[${VIEW_SEGMENT_ACTIVE_ATTR}]`)).toBeNull();
        h.dispose();
    });
});

describe('§PARCEL-LAW-TAB — UNREPORTED ≠ NOT CURRENT (C84 EI-1b)', () => {
    // `GisSiteViewState` has no field for which BIM view ViewController activated, so
    // `site.bim-3d` declares no `activeWhen`. The control must say "I cannot tell you",
    // never paint "off" — failure and emptiness collapsing into one value is the defect
    // this repo pays for most often.

    it('the BIM 3D action deliberately declares NO activeWhen', () => {
        expect(viewSegmentAction(VIEW_SEGMENTS[1])!.activeWhen).toBeUndefined();
        // …while the other three DO, so this is a stated gap and not a general omission.
        for (const id of ['plan', 'site-3d', 'globe']) {
            const seg = VIEW_SEGMENTS.find((s) => s.id === id)!;
            expect(viewSegmentAction(seg)!.activeWhen, `${id} lost its activeWhen`).toBeTypeOf('function');
        }
    });

    it('marks the unreportable segment as UNREPORTED — live, never highlighted, aria-pressed="mixed"', () => {
        const { host } = makeHost({ segment: 'forma', formaMode: 'plan', buildingFidelity: 'real' });
        const h = mountViewSegmentSwitcher(host);
        const bim = btn(h.element, 'bim-3d');
        expect(bim.disabled).toBe(false);                                   // it WORKS
        expect(bim.getAttribute(VIEW_SEGMENT_UNREPORTED_ATTR)).toBe('true'); // …but is unreadable
        expect(bim.getAttribute(VIEW_SEGMENT_ACTIVE_ATTR)).toBeNull();
        expect(bim.getAttribute('aria-pressed')).toBe('mixed');
        expect(bim.title).toContain('pryzmGetSiteViewState');
        // The three that CAN be reported keep the binary reading.
        expect(btn(h.element, 'plan').getAttribute('aria-pressed')).toBe('true');
        expect(btn(h.element, 'site-3d').getAttribute(VIEW_SEGMENT_UNREPORTED_ATTR)).toBeNull();
        h.dispose();
    });

    it('names the unreported view in the status line when nothing is highlighted', () => {
        const { host } = makeHost({ segment: 'forma', formaMode: 'map2d', buildingFidelity: 'massing' });
        const h = mountViewSegmentSwitcher(host);
        const status = h.element.querySelector(`[data-testid="${VIEW_SEGMENT_STATUS_TESTID}"]`)!;
        expect(status.textContent).toContain('BIM 3D');
        expect(status.textContent).toContain('not reported');
        // The snapshot it COULD read is still quoted — a missing reading, not a blank.
        expect(status.textContent).toContain('map2d');
        h.dispose();
    });

    it('an UNAVAILABLE segment is not marked unreported — they are different facts', () => {
        const h = mountViewSegmentSwitcher({});
        expect(btn(h.element, 'bim-3d').getAttribute(VIEW_SEGMENT_UNREPORTED_ATTR)).toBeNull();
        h.dispose();
    });
});
