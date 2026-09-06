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

import { describe, it, expect } from 'vitest';
import {
    mountParcelLawTab,
    defaultParcelLawTabDeps,
    PARCEL_LAW_TAB_TESTID,
    PARCEL_LAW_SWITCHER_SLOT_TESTID,
    PARCEL_LAW_PANEL_SLOT_TESTID,
    PARCEL_LAW_NOTE,
    PARCEL_LAW_STRIP_WIRED_ATTR,
    ENVELOPE_CARD_TESTID,
    type ParcelLawTabDeps,
    type ParcelLawCapabilityHost,
} from '../parcelLawTab';
import { buildParcelRailPanel, PARCEL_RAIL_ENVELOPE_SLOT_TESTID } from '../../site/parcel/parcelRailPanel';
import { VIEW_SEGMENT_SWITCHER_TESTID, VIEW_SEGMENT_ATTR, VIEW_SEGMENTS } from '../../site/viewSegmentSwitcher';
import { VIEW_SWITCHER_ON_VIEW_TESTID, VIEW_SWITCHER_SPLIT_TESTID } from '../../site/viewSwitcherOnView';
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
                return { element: el, repaint: () => { seen.push('switcher.repaint'); }, dispose: () => { switcherDisposed++; } };
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
