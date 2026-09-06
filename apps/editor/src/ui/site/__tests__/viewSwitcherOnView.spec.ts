/**
 * §VIEW-SWITCHER-ON-THE-VIEW (L-12985) — the view choice leaves the panel, lands centred on
 * the view, and gains the founder's SPLIT.
 *
 * Founder 2026-09-06, boxing the four stacked full-width buttons inside the right-hand
 * Parcel Law panel in blue: *"we DON'T need the plan view / 3D view etc. on the panel — that
 * can be in the panel with buttons and SHOULD BE CENTRED ON THE VIEW — and the user can
 * decide to have only the 2D Site Plan view, 2D Satellite, 3D Site, 3D PRYZM, or 3D Globe —
 * OR SPLIT — in this case THE SPLIT SHALL BE HORIZONTAL, keeping the split views on the LEFT
 * and the panel on the RIGHT."*
 *
 * ⛔ WHAT THIS SUITE REFUSES TO ASSERT, and the refusal is the point. It does NOT assert the
 * six labels: those rows belong to `viewPanelOptions()` (lane VIEW-PANEL-PER-PANE) and are
 * pinned by that lane's own spec. Re-asserting them here would mint a second authority for
 * the panel definition — the exact rival this control exists NOT to be. What is asserted here
 * is what THIS file owns: placement, the split-layout choice, honest refusal, and teardown.
 *
 * A fake built from the header cannot falsify the header, so the host fakes RECORD CALLS and
 * the assertions read which registered entry point a click reached — never a flag this file set.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
    mountViewSwitcherOnView,
    SITE_AUTHORING_PANES_ROOT_ID,
    SPLIT_UNAVAILABLE_TEXT,
    VIEW_SWITCHER_ON_VIEW_TESTID,
    VIEW_SWITCHER_SPLIT_TESTID,
    type ViewSwitcherOnViewHandle,
    type ViewSwitcherOnViewHost,
} from '../viewSwitcherOnView';
import { VIEW_SEGMENTS, VIEW_SEGMENT_SWITCHER_TESTID, VIEW_SEGMENT_ATTR } from '../viewSegmentSwitcher';

let handle: ViewSwitcherOnViewHandle | null = null;

/** A host where both split entry points exist and record their calls. */
function makeHost(over: Partial<ViewSwitcherOnViewHost> = {}): {
    host: ViewSwitcherOnViewHost;
    calls: string[];
} {
    const calls: string[] = [];
    const host: ViewSwitcherOnViewHost = {
        pryzmEnterSiteView: () => { calls.push('pryzmEnterSiteView'); },
        pryzmShowSiteResultView: () => { calls.push('pryzmShowSiteResultView'); },
        pryzmActivateBimView: () => { calls.push('pryzmActivateBimView'); },
        pryzmMountSiteAuthoringPanes: () => { calls.push('mountPanes'); },
        pryzmUnmountSiteAuthoringPanes: () => { calls.push('unmountPanes'); },
        ...over,
    };
    return { host, calls };
}

const splitBtn = (h: ViewSwitcherOnViewHandle): HTMLButtonElement =>
    h.element.querySelector<HTMLButtonElement>(`[data-testid="${VIEW_SWITCHER_SPLIT_TESTID}"]`)!;

afterEach(() => {
    handle?.dispose();
    handle = null;
    document.body.innerHTML = '';
});

describe('§VIEW-SWITCHER-ON-THE-VIEW — placement', () => {
    it('is body-level chrome, NOT a descendant of any panel', () => {
        const { host } = makeHost();
        const h = (handle = mountViewSwitcherOnView({ host }));
        expect(h.element.parentElement).toBe(document.body);
        expect(h.element.className).toBe('vsw-onview');
        // ⛔ The centring itself lives in `styles/panels/analysisSurface.ts` as
        // `left: var(--shell-canvas-cx)` and is pinned by `shellFloatBudget.spec.ts` ARM B.
        // Writing a `left` here would silently leave that budget, which is why this file
        // sets no horizontal position at all.
        expect(h.element.style.left).toBe('');
    });

    it('hosts the ONE switcher — it does not re-render the six options itself', () => {
        const { host } = makeHost();
        const h = (handle = mountViewSwitcherOnView({ host }));
        const row = h.element.querySelector(`[data-testid="${VIEW_SEGMENT_SWITCHER_TESTID}"]`);
        expect(row, 'the shipped switcher was not hosted').not.toBeNull();
        expect(
            h.element.querySelectorAll(`button[${VIEW_SEGMENT_ATTR}]`),
        ).toHaveLength(VIEW_SEGMENTS.length);
    });

    it('is idempotent — a re-mount never leaves two bars centred on the same pixels', () => {
        const { host } = makeHost();
        handle = mountViewSwitcherOnView({ host });
        const second = mountViewSwitcherOnView({ host });
        expect(
            document.querySelectorAll(`[data-testid="${VIEW_SWITCHER_ON_VIEW_TESTID}"]`),
        ).toHaveLength(1);
        second.dispose();
    });
});

describe('§VIEW-SWITCHER-ON-THE-VIEW — SPLIT is a LAYOUT choice, not a seventh view', () => {
    it('is not one of the view segments', () => {
        // `viewPanelOptions()` answers "WHICH view"; the founder's split answer is "BOTH".
        // There is no `ViewType` for it and there must not be (C59 owns pane layout).
        const { host } = makeHost();
        const h = (handle = mountViewSwitcherOnView({ host }));
        expect(splitBtn(h).hasAttribute(VIEW_SEGMENT_ATTR)).toBe(false);
        expect(VIEW_SEGMENTS.some((s) => s.id === ('split' as never))).toBe(false);
    });

    it('opens the split through the DECLARED entry point, not a local implementation', () => {
        const { host, calls } = makeHost();
        const h = (handle = mountViewSwitcherOnView({ host, isSplitOpen: () => false }));
        splitBtn(h).click();
        // `pryzmMountSiteAuthoringPanes` is the same entry point onboarding drives; the
        // two-pane geometry (flex row, inside `#container`) is `SiteAuthoringPaneShell`'s.
        expect(calls).toEqual(['mountPanes']);
    });

    it('closes it again when it is already open', () => {
        const { host, calls } = makeHost();
        const h = (handle = mountViewSwitcherOnView({ host, isSplitOpen: () => true }));
        expect(splitBtn(h).getAttribute('aria-pressed')).toBe('true');
        splitBtn(h).click();
        expect(calls).toEqual(['unmountPanes']);
    });

    it('reads the split from the DOCUMENT, because no snapshot field reports it', () => {
        // ⚠ `pryzmGetSiteViewState` carries segment / formaMode / buildingFidelity (+ basemap)
        // and none of them says whether the panes are up. Inventing a predicate over the
        // fields that DO exist would paint a layout from a fact the authority never stated
        // (C84 EI-1b). So the control observes the shell's own root id — a fact about the
        // document, stated as one.
        const { host } = makeHost();
        const h = (handle = mountViewSwitcherOnView({ host }));
        expect(splitBtn(h).getAttribute('aria-pressed')).toBe('false');

        const shellRoot = document.createElement('div');
        shellRoot.id = SITE_AUTHORING_PANES_ROOT_ID;
        document.body.appendChild(shellRoot);
        h.repaint();
        expect(splitBtn(h).getAttribute('aria-pressed')).toBe('true');
        expect(splitBtn(h).hasAttribute('data-split-open')).toBe(true);

        shellRoot.remove();
        h.repaint();
        expect(splitBtn(h).getAttribute('aria-pressed')).toBe('false');
    });
});

describe('§VIEW-SWITCHER-ON-THE-VIEW — no dead clicks (L-1187)', () => {
    it('refuses SPLIT with a printed reason when the entry point is not registered', () => {
        const { host } = makeHost({ pryzmMountSiteAuthoringPanes: undefined });
        const h = (handle = mountViewSwitcherOnView({ host, isSplitOpen: () => false }));
        const b = splitBtn(h);
        expect(b.disabled).toBe(true);
        expect(b.getAttribute('data-view-segment-unavailable')).toBe('true');
        // The reason is ON the control, not in the console. "Nothing happened and I do not
        // know why" is the state this rule exists to prevent.
        expect(b.title).toBe(SPLIT_UNAVAILABLE_TEXT);
        expect(b.title).toContain('pryzmMountSiteAuthoringPanes');
    });

    it('a refused SPLIT dispatches nothing when clicked anyway', () => {
        const { host, calls } = makeHost({ pryzmMountSiteAuthoringPanes: undefined });
        const h = (handle = mountViewSwitcherOnView({ host, isSplitOpen: () => false }));
        splitBtn(h).click();
        expect(calls).toEqual([]);
    });

    it('an OPEN split with no way out is refused too — the outbound gate', () => {
        // Symmetry matters: offering "close" against a missing unmount entry point would
        // strand the founder in a split he cannot leave.
        const { host } = makeHost({ pryzmUnmountSiteAuthoringPanes: undefined });
        const h = (handle = mountViewSwitcherOnView({ host, isSplitOpen: () => true }));
        expect(splitBtn(h).disabled).toBe(true);
    });

    it('a throwing entry point does not take the bar down', () => {
        const { host } = makeHost({
            pryzmMountSiteAuthoringPanes: () => { throw new Error('cesium is not ready'); },
        });
        const h = (handle = mountViewSwitcherOnView({ host, isSplitOpen: () => false }));
        expect(() => splitBtn(h).click()).not.toThrow();
        expect(h.element.isConnected).toBe(true);
    });
});

describe('§VIEW-SWITCHER-ON-THE-VIEW — two centred bars cannot stack', () => {
    it('sits UNDER the split shell\'s own top-centre bar when one is on screen', () => {
        // `SiteAuthoringPaneShell` mounts `.svq-bar` at the SAME `left: var(--shell-canvas-cx)`.
        // Hiding either one is wrong — that one is PER-PANE, this one is whole-screen AND
        // carries the way out of split — so this bar measures the other and drops below it.
        const other = document.createElement('div');
        other.className = 'svq-bar';
        Object.defineProperty(other, 'getBoundingClientRect', {
            value: () => ({ bottom: 92, height: 34, top: 58, left: 0, right: 0, width: 200 }),
        });
        document.body.appendChild(other);

        const { host } = makeHost();
        const h = (handle = mountViewSwitcherOnView({ host }));
        expect(h.element.style.top).toBe('100px'); // 92 + 8

        other.remove();
        h.repaint();
        // Back to the sheet's own derived value — this file writes no number of its own.
        expect(h.element.style.top).toBe('');
    });
});

describe('§VIEW-SWITCHER-ON-THE-VIEW — teardown', () => {
    it('dispose removes the bar and the switcher it hosts', () => {
        const { host } = makeHost();
        let switcherDisposed = 0;
        const h = mountViewSwitcherOnView({
            host,
            mountSwitcher: () => ({
                element: document.createElement('div'),
                repaint: () => { /* noop */ },
                dispose: () => { switcherDisposed++; },
            }),
        });
        h.dispose();
        expect(switcherDisposed).toBe(1);
        expect(document.querySelector(`[data-testid="${VIEW_SWITCHER_ON_VIEW_TESTID}"]`)).toBeNull();
        expect(() => h.dispose()).not.toThrow();
    });
});
