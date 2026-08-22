/**
 * §PARCEL-OWN-PANEL (L-5130..L-5136) — the founder's dedicated PARCEL panel.
 *
 * *"the GIS panel has great data, but we should have another panel only for parcel
 * data: with all the relevant parcel data — also on the left-hand side rail toolbar."*
 *
 * ⭐ WHAT THESE ARMS ARE FOR. The brief's instruction was **re-surfacing, not
 * re-derivation**, so the assertions that matter are not "does a card render" — they
 * are "is it the SAME card, from the SAME reader, with the trust facts intact". A
 * suite that only proved a panel appears would pass just as happily over a
 * hand-written second card, which is the one outcome that must fail.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import {
    buildParcelRailPanel,
    PARCEL_RAIL_PANEL_TESTID,
    PARCEL_RAIL_SLOT_TESTID,
    PARCEL_PANEL_INTRO,
    // §PARCEL-ALL-INFO (L-6905) — the envelope half the founder asked to be re-surfaced.
    PARCEL_RAIL_ENVELOPE_SLOT_TESTID,
    PARCEL_RAIL_ENVELOPE_STATE_TESTID,
} from '../parcelRailPanel.js';
import { PARCEL_NO_BOUNDARY_TEXT } from '../parcelCard.js';

const REPO = resolve(__dirname, '../../../../../../..');
const read = (p: string): string => readFileSync(join(REPO, p), 'utf8');

/** The founder's own parcel, as his screenshot reports it. */
const CORDOBA_SITE = {
    parcel: {
        // A real ring — 4 points is enough for `polygon.length >= 3`.
        boundary: { polygon: [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 21 }, { x: 0, z: 21 }] },
        area: 424,
        provenance: {
            kind: 'cadastral',
            source: 'catastro',
            label: 'Catastro (Spain)',
            refcat: '3634515DF3833D',
            address: 'CALLE EJEMPLO 1, CORDOBA',
            jurisdictionId: 'es-cordoba',
            sourceCrs: 'EPSG:25830',
            license: 'CC BY 4.0 · Dirección General del Catastro',
            ingestTimestamp: '2026-08-21T09:14:00Z',
            // ⚠ MEASURED, not guessed. The area/match facts live under `confidence`,
            // NOT at the top of the provenance record — `parcelProvenanceToCardModel`
            // (parcelCard.ts:251-255) reads `prov.confidence?.areaOfficialM2` etc.
            // This fixture first flattened them and the 423 m² registry row silently
            // did not render, which is the fixture being MORE forgiving than the real
            // adapter — the shape that makes a suite unable to falsify its subject.
            confidence: {
                areaOfficialM2: 423,
                areaSigM2: 424,
                areaSource: 'registry-declared',
                match: 'high',
                geometryComplete: true,
            },
        },
    },
};

/** Source with `//`, `*` and `/* … *​/` comment lines removed. */
function codeOnly(src: string): string {
    return src
        .split(String.fromCharCode(10))
        .filter((l) => {
            const t = l.trimStart();
            return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
        })
        .join(String.fromCharCode(10));
}

function runtimeWith(site: unknown): unknown {
    return { siteModelStore: { getSite: () => site, subscribe: (_l: () => void) => () => { /* noop */ } } };
}

describe('§PARCEL-OWN-PANEL — the panel renders the committed parcel', () => {
    it('carries the SOURCE and the RETRIEVAL TIMESTAMP — the two trust facts', () => {
        // The founder named these two explicitly. They come from the shared producer,
        // which is the point: this arm fails if the panel ever stops using it.
        const h = buildParcelRailPanel(runtimeWith(CORDOBA_SITE) as never);
        const text = h.element.textContent ?? '';
        expect(text).toContain('Catastro (Spain)');
        expect(text).toContain('2026-08-21T09:14:00Z');
        expect(h.element.querySelector('[data-testid="parcel-source-attribution"]')).not.toBeNull();
        h.dispose();
    });

    it('⭐ shows BOTH areas when registry and ring disagree — 423 vs 424', () => {
        // "that disagreement is information, not noise." C57 §2.4 — two different
        // facts, never merged. His screenshot is the 1 m² case.
        const h = buildParcelRailPanel(runtimeWith(CORDOBA_SITE) as never);
        const text = h.element.textContent ?? '';
        expect(text).toContain('423');
        expect(text).toContain('424');
        expect(text).toContain('Area (registry)');
        expect(text).toContain('Area (from ring)');
        h.dispose();
    });

    it('carries the reference and address', () => {
        const h = buildParcelRailPanel(runtimeWith(CORDOBA_SITE) as never);
        expect(h.element.textContent).toContain('3634515DF3833D');
        expect(h.element.textContent).toContain('CALLE EJEMPLO 1, CORDOBA');
        h.dispose();
    });

    it('the panel and its slot are addressable, and the intro can WRAP', () => {
        const h = buildParcelRailPanel(runtimeWith(CORDOBA_SITE) as never);
        expect(h.element.getAttribute('data-testid')).toBe(PARCEL_RAIL_PANEL_TESTID);
        expect(h.element.querySelector(`[data-testid="${PARCEL_RAIL_SLOT_TESTID}"]`)).not.toBeNull();
        expect(h.element.textContent).toContain(PARCEL_PANEL_INTRO);
        // ⚠ A `text-overflow: ellipsis` destroyed a user-facing disclosure today. The
        // intro is a full sentence and must never be truncated.
        // ⚠ COMMENTS STRIPPED — this arm's FIRST version read the raw rule and
        // failed on the word 'ellipsis' inside the rule's own '/* NO ellipsis */'
        // warning comment. Third time this trap fired in this lane today.
        const css = codeOnly(read('apps/editor/src/ui/styles/panels/projectBrowser.ts'));
        const rule = css.slice(css.indexOf('.pb-parcel-intro {'));
        const body = rule.slice(0, rule.indexOf('}'));
        expect(body).not.toContain('ellipsis');
        expect(body).not.toContain('nowrap');
        expect(body).toContain('white-space: normal');
        h.dispose();
    });
});

describe('§PARCEL-OWN-PANEL — honest states, and never a second reader', () => {
    it('says "nothing selected yet" rather than rendering zeros', () => {
        // C84 EI-1b — an empty state that renders as 0 m² asserts a fact about real
        // land. The three states are inherited from `buildParcelSectionBody`.
        const h = buildParcelRailPanel(runtimeWith(null) as never);
        expect(h.element.textContent).toContain(PARCEL_NO_BOUNDARY_TEXT);
        expect(h.element.textContent).not.toContain('0 m²');
        h.dispose();
    });

    it('distinguishes "boundary committed, provenance never recorded" from "no boundary"', () => {
        const noProv = { parcel: { boundary: CORDOBA_SITE.parcel.boundary, area: 424, provenance: null } };
        const h = buildParcelRailPanel(runtimeWith(noProv) as never);
        const text = h.element.textContent ?? '';
        expect(text).not.toContain(PARCEL_NO_BOUNDARY_TEXT);
        // The ring's area is still a fact we hold, and is still shown.
        expect(text).toContain('424');
        h.dispose();
    });

    it('⛔ REUSES the shared reader — no second fetch, no second card producer', () => {
        // THE ARM THAT MATTERS. The brief: "Reuse the existing reader — do not add a
        // second parcel fetch." A hand-written card would satisfy every arm above.
        // ⚠ COMMENTS STRIPPED: the module's header EXPLAINS that it does not call
        // `buildParcelCard`, and a comment naming the forbidden call is not the call.
        const src = codeOnly(read('apps/editor/src/ui/site/parcel/parcelRailPanel.ts'));
        expect(src).toContain('mountParcelSection');
        // It must not reach a provider, a proxy endpoint or the network itself.
        expect(src).not.toMatch(/defaultParcelProvider|catastroParcelProvider|registryParcelProvider/);
        expect(src).not.toMatch(/\bfetch\s*\(/);
        // …nor rebuild the card from parts.
        expect(src).not.toMatch(/buildParcelCard|parcelProvenanceToCardModel/);
    });

    it('never throws into the rail, even with a hostile runtime', () => {
        // A section that cannot build is a section the founder cannot open, and
        // reachability is the entire point of this change.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* quiet */ });
        try {
            for (const rt of [null, undefined, {}, { siteModelStore: null }, { siteModelStore: { getSite: () => { throw new Error('boom'); } } }]) {
                const h = buildParcelRailPanel(rt as never);
                expect(h.element).toBeTruthy();
                expect(() => h.dispose()).not.toThrow();
            }
        } finally {
            warn.mockRestore();
        }
    });
});

describe('§PARCEL-OWN-PANEL — the left-rail entry the founder asked for', () => {
    const PANEL = 'apps/editor/src/ui/ViewBrowser/ProjectBrowserPanel.ts';

    it('PARCEL is a registered rail section with an icon', () => {
        const src = read(PANEL);
        expect(src).toMatch(/id: 'PARCEL',\s*label: 'Parcel'/);
        expect(src).toContain('_buildParcelPanel()');
        // An icon-less section renders a blank button — reachable but unreadable.
        const icons = src.slice(src.indexOf('SECTION_ICONS'), src.indexOf('SECTION_ICONS') + 6000);
        expect(icons).toMatch(/\bPARCEL: `/);
    });

    it('⛔ the icon is inline SVG, not an <img> that could 404 into a dead-looking rail', () => {
        const src = read(PANEL);
        const at = src.indexOf('PARCEL: `');
        const decl = src.slice(at, at + 600);
        expect(decl).toContain('<svg');
        expect(decl).not.toContain('<img');
    });

    it('⛔ the GIS section KEEPS its own parcel block — this adds a route, never removes one', () => {
        // §GIS-PARCEL-REHOST (L-1582) restored that block ONE DAY before this request.
        // Moving it here instead of adding would re-break what was just fixed.
        const src = read(PANEL);
        expect(src).toContain('GIS_PARCEL_SLOT_TESTID');
        expect(src).toMatch(/id: 'GIS',\s*label: 'GIS'/);
    });

    it('⛔ the two hosts hold SEPARATE handles, so closing one cannot deafen the other', () => {
        const src = read(PANEL);
        expect(src).toContain('_parcelSection');
        expect(src).toContain('_parcelPanel');
        // Each has its own teardown branch keyed on its own active id.
        expect(src).toMatch(/activeId !== 'GIS' && this\._parcelSection !== null/);
        expect(src).toMatch(/activeId !== 'PARCEL' && this\._parcelPanel !== null/);
    });
});

// ════════════════════════════════════════════════════════════════════════════════════
// §PARCEL-ALL-INFO (L-6905..L-6909) — "all information directly showing up"
// ════════════════════════════════════════════════════════════════════════════════════
//
// Founder 2026-08-22: *"On parcel selection I want to have all information directly
// showing up: it is still on GIS — check second image and third."*
//
// ⭐ WHAT THESE ARMS ARE FOR. The one outcome that must fail is a SECOND renderer of the
// envelope figures: they are cited to PGM articles, and two surfaces that can disagree
// about a setback is the C06 §13.3 breach with a legal consequence attached. So the arms
// assert the panel CLAIMS the singleton card rather than drawing one — and that in the
// measured 6–11 s window where it cannot, it says which of four things is true.

/** Let the panel's `queueMicrotask(renderEnvelope)` run. */
const flush = (): Promise<void> => new Promise<void>((r) => { queueMicrotask(() => r()); });

/** Install a fake for the §GIS-ENVELOPE-REHOST seam; returns a restore fn. */
function withEnvelopeSeam(present: boolean): { calls: HTMLElement[]; restore: () => void } {
    const calls: HTMLElement[] = [];
    const w = window as unknown as {
        pryzmMountEnvelopeCard?: (h: HTMLElement | null) => boolean;
        pryzmRecomputeEnvelopeCard?: () => boolean;
    };
    const priorMount = w.pryzmMountEnvelopeCard;
    const priorRecompute = w.pryzmRecomputeEnvelopeCard;
    w.pryzmMountEnvelopeCard = (host: HTMLElement | null): boolean => {
        if (host) {
            calls.push(host);
            if (present) {
                const card = document.createElement('div');
                card.setAttribute('data-testid', 'buildable-envelope-card');
                card.textContent = 'Buildable envelope';
                host.appendChild(card);
            }
        }
        return present;
    };
    w.pryzmRecomputeEnvelopeCard = () => false;
    return {
        calls,
        restore: () => { w.pryzmMountEnvelopeCard = priorMount; w.pryzmRecomputeEnvelopeCard = priorRecompute; },
    };
}

describe('§PARCEL-ALL-INFO — the panel CLAIMS the one card, it does not draw a second', () => {
    it('mounts the singleton buildable-envelope card into its own slot', async () => {
        const seam = withEnvelopeSeam(true);
        try {
            const h = buildParcelRailPanel(runtimeWith(CORDOBA_SITE) as never);
            document.body.appendChild(h.element);
            await flush();
            const slot = h.element.querySelector(`[data-testid="${PARCEL_RAIL_ENVELOPE_SLOT_TESTID}"]`);
            expect(slot).not.toBeNull();
            // ⭐ The seam was asked for THIS slot — the §GIS-ENVELOPE-REHOST (L-1362) route.
            expect(seam.calls).toContain(slot);
            expect(slot!.querySelector('[data-testid="buildable-envelope-card"]')).not.toBeNull();
            h.element.remove();
            h.dispose();
        } finally { seam.restore(); }
    });

    it('⛔ NEVER re-derives: no capacity/measurement/envelope producer is imported here', () => {
        // THE ARM THAT MATTERS, and the one a hand-written section would fail. Every fold
        // the founder listed (designed vs permitted · how these were measured · full site &
        // massing) belongs to the card's ONE template in GISAreaLayout. This panel hosts.
        const src = codeOnly(read('apps/editor/src/ui/site/parcel/parcelRailPanel.ts'));
        expect(src).toContain('pryzmMountEnvelopeCard');
        expect(src).not.toMatch(/buildCapacitySectionHtml|buildDesignedVsPermittedFold|buildHowMeasuredFold/);
        expect(src).not.toMatch(/buildCapacityComparison|measureAuthoredDesign|collectAuthoredModelSnapshot/);
        expect(src).not.toMatch(/getLastBuildableEnvelope|resolveStoredBuildableDetermination|solveEstimatedEnvelope/);
        expect(src).not.toMatch(/\bfetch\s*\(/);
    });

    it('⛔ dispose does NOT release the shared host — that would evict the card from GIS too', () => {
        // The card is a SINGLETON that `ensureEnvelopePanel` MOVES rather than clones.
        // `getForma3dHostEl` already falls back the moment this slot leaves the document
        // (`document.contains`), so self-healing beats explicit release for a shared resource.
        const src = codeOnly(read('apps/editor/src/ui/site/parcel/parcelRailPanel.ts'));
        expect(src).not.toMatch(/pryzmMountEnvelopeCard\?\.\(null\)/);
    });

    it('⛔ never clears the slot wholesale — that would detach the shared card', () => {
        const src = codeOnly(read('apps/editor/src/ui/site/parcel/parcelRailPanel.ts'));
        // It removes only its own chrome, keyed on the card's testid.
        expect(src).toContain("getAttribute('data-testid') !== 'buildable-envelope-card'");
        expect(src).not.toMatch(/envSlot\.replaceChildren\(\)/);
    });
});

describe('§PARCEL-ALL-INFO — the 6–11 s window says which of four things is true', () => {
    it('with a committed parcel and no card, it names a state rather than showing nothing', async () => {
        const seam = withEnvelopeSeam(false);
        try {
            const h = buildParcelRailPanel(runtimeWith(CORDOBA_SITE) as never);
            document.body.appendChild(h.element);
            await flush();
            const msg = h.element.querySelector(`[data-testid="${PARCEL_RAIL_ENVELOPE_STATE_TESTID}"]`);
            expect(msg).not.toBeNull();
            expect((msg!.textContent ?? '').length).toBeGreaterThan(40);
            // ⛔ A blank slot reads as a crash (L-553); zeros read as "nothing is buildable"
            // (C84 EI-1b). Neither is permitted.
            expect(msg!.textContent).not.toMatch(/\b0(\.0+)?\s*(m|m²|%)\b/);
            h.element.remove();
            h.dispose();
        } finally { seam.restore(); }
    });

    it('with NO boundary it says so, and does not claim a determination is running', async () => {
        const seam = withEnvelopeSeam(false);
        try {
            const h = buildParcelRailPanel(runtimeWith(null) as never);
            document.body.appendChild(h.element);
            await flush();
            const msg = h.element.querySelector(`[data-testid="${PARCEL_RAIL_ENVELOPE_STATE_TESTID}"]`);
            expect(msg?.getAttribute('data-state')).toBe('no-boundary');
            expect(msg?.textContent).toMatch(/No parcel boundary is committed/i);
            h.element.remove();
            h.dispose();
        } finally { seam.restore(); }
    });

    it('a PRESENT card renders no replacement sentence', async () => {
        const seam = withEnvelopeSeam(true);
        try {
            const h = buildParcelRailPanel(runtimeWith(CORDOBA_SITE) as never);
            document.body.appendChild(h.element);
            await flush();
            expect(h.element.querySelector(`[data-testid="${PARCEL_RAIL_ENVELOPE_STATE_TESTID}"]`)).toBeNull();
            h.element.remove();
            h.dispose();
        } finally { seam.restore(); }
    });

    it('⭐ LIVE — a store notification re-asks the seam, so the window ENDS on screen', async () => {
        // `dispatchEnvelope` → `siteUpdateZoning` → the site store notifies. Without this the
        // panel would print "resolving" until the user closed and re-opened it, which is the
        // §GIS-PARCEL-REHOST defect (a section that silently stopped updating).
        const seam = withEnvelopeSeam(false);
        try {
            let notify: (() => void) | null = null;
            const rt = {
                siteModelStore: {
                    getSite: () => CORDOBA_SITE,
                    subscribe: (l: () => void) => { notify = l; return () => { notify = null; }; },
                },
            };
            const h = buildParcelRailPanel(rt as never);
            document.body.appendChild(h.element);
            await flush();
            const before = seam.calls.length;
            expect(notify).not.toBeNull();
            (notify as unknown as () => void)();
            expect(seam.calls.length).toBeGreaterThan(before);
            h.element.remove();
            h.dispose();
        } finally { seam.restore(); }
    });

    it('dispose drops the store subscription — no re-render into a detached tree', async () => {
        const seam = withEnvelopeSeam(false);
        try {
            let unsubbed = false;
            let notify: (() => void) | null = null;
            const rt = {
                siteModelStore: {
                    getSite: () => CORDOBA_SITE,
                    subscribe: (l: () => void) => { notify = l; return () => { unsubbed = true; }; },
                },
            };
            const h = buildParcelRailPanel(rt as never);
            document.body.appendChild(h.element);
            await flush();
            h.element.remove();
            h.dispose();
            expect(unsubbed).toBe(true);
            const after = seam.calls.length;
            (notify as unknown as (() => void) | null)?.();
            expect(seam.calls.length).toBe(after);
        } finally { seam.restore(); }
    });

    it('never throws when the seam is absent entirely', async () => {
        const w = window as unknown as { pryzmMountEnvelopeCard?: unknown };
        const prior = w.pryzmMountEnvelopeCard;
        delete w.pryzmMountEnvelopeCard;
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* quiet */ });
        try {
            const h = buildParcelRailPanel(runtimeWith(CORDOBA_SITE) as never);
            document.body.appendChild(h.element);
            await flush();
            // GISAreaLayout registers the seam at boot; a panel opened before that must still
            // build. It reports the honest state rather than an empty slot.
            expect(h.element.querySelector(`[data-testid="${PARCEL_RAIL_ENVELOPE_STATE_TESTID}"]`)).not.toBeNull();
            h.element.remove();
            expect(() => h.dispose()).not.toThrow();
        } finally { w.pryzmMountEnvelopeCard = prior; warn.mockRestore(); }
    });
});
