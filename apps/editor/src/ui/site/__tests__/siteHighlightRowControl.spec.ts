/**
 * §RESI-ORCH-HIGHLIGHT-DOM (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §3) — CLICK IT.
 *
 * ⭐ WHAT THIS SUITE IS FOR. `siteGeometryHighlight.spec.ts` proves the vocabulary, the
 * availability rule, the emphasis table and the store — 30 tests, all pure. None of them
 * clicks anything. The hop a USER actually experiences — a label rendered as a button, a click
 * that writes the store, a pressed state that repaints — lived inside `GISAreaLayout.ts` where no
 * test could reach it. That is [[committed-is-not-reachable]] at the exact seam the founder
 * touches, and this suite exists to close it: it mounts the REAL markup, calls the REAL wire, and
 * clicks with happy-dom. The store it reads afterwards is the one `ParcelBoundarySceneRenderer`
 * subscribes to.
 *
 * ⛔ What it deliberately does NOT do: build its own button and assert the button it just
 * inserted is there. L-10930 shipped exactly that spec, and it certified a dead button as wired.
 * Every button here comes out of `buildSiteHighlightLabelHtml`, and the GISAreaLayout source pin
 * at the end proves the card calls the same two functions.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    buildSiteHighlightLabelHtml,
    wireSiteHighlightRows,
    paintSiteHighlightRows,
    SITE_HIGHLIGHT_UNAVAILABLE_ATTR,
} from '../siteHighlightRowControl';
import {
    describeSiteHighlightAvailability,
    getSiteHighlight,
    subscribeSiteHighlight,
    SITE_HIGHLIGHT_ATTR,
    __resetSiteHighlightForTests,
    type SiteHighlightInputs,
} from '../siteGeometryHighlight';

afterEach(() => {
    __resetSiteHighlightForTests();
    document.body.innerHTML = '';
});

const COMPLETE: SiteHighlightInputs = {
    parcelRingLength: 4,
    edgeClassifications: ['front', 'side', 'back', 'side'],
    footprintRingLength: 4,
    maxHeightM: 16,
    gfaM2: 420,
};

/** The six rows exactly as the card's `row()` emits their label cell, wrapped in a fold. */
function mountCard(inputs: SiteHighlightInputs): HTMLElement {
    const avail = describeSiteHighlightAvailability(inputs);
    const on = getSiteHighlight();
    const rows = [
        ['Area', 'parcel'],
        ['Perimeter', 'boundary'],
        ['Street frontage', 'frontage'],
        ['Buildable footprint', 'footprint'],
        ['Max height', 'height'],
        ['Max floor area', 'gfa'],
    ] as const;
    const host = document.createElement('div');
    host.innerHTML =
        `<details data-testid="envelope-section-site-data"><summary>Full site data</summary>`
        + rows.map(([label, subject]) =>
            `<div data-row="${subject}">${buildSiteHighlightLabelHtml(label, subject, avail[subject], on === subject)}<span>—</span></div>`,
        ).join('')
        + `</details>`;
    document.body.appendChild(host);
    return host;
}

describe('§RESI-ORCH-HIGHLIGHT-DOM — three visual states, never two', () => {
    it('an AVAILABLE row is a real <button> carrying the subject attribute', () => {
        const host = mountCard(COMPLETE);
        const btn = host.querySelector(`button[${SITE_HIGHLIGHT_ATTR}="footprint"]`);
        expect(btn).not.toBeNull();
        expect(btn!.getAttribute('aria-pressed')).toBe('false');
        expect(btn!.getAttribute('title')).toContain('Click again to clear');
    });

    it('an UNAVAILABLE row is TEXT with its reason in a title — not a control that swallows a click', () => {
        const host = mountCard({ ...COMPLETE, maxHeightM: null });
        expect(host.querySelector(`button[${SITE_HIGHLIGHT_ATTR}="height"]`)).toBeNull();
        const marker = host.querySelector(`[${SITE_HIGHLIGHT_UNAVAILABLE_ATTR}="height"]`);
        expect(marker).not.toBeNull();
        expect(marker!.getAttribute('title')).toContain('derived no maximum height');
        // The other five are still live: one missing measurement does not dim the card.
        expect(host.querySelectorAll(`button[${SITE_HIGHLIGHT_ATTR}]`).length).toBe(5);
    });

    it('a row with NO parcel at all renders zero buttons — nothing to point at, nothing clickable', () => {
        const host = mountCard({ ...COMPLETE, parcelRingLength: 0, footprintRingLength: 0 });
        expect(wireSiteHighlightRows(host)).toBe(0);
        expect(host.querySelectorAll(`button[${SITE_HIGHLIGHT_ATTR}]`).length).toBe(0);
        expect(host.querySelectorAll(`[${SITE_HIGHLIGHT_UNAVAILABLE_ATTR}]`).length).toBe(6);
    });
});

describe('§RESI-ORCH-HIGHLIGHT-DOM — CLICK IT', () => {
    it('wires exactly the available buttons and reports how many', () => {
        const host = mountCard(COMPLETE);
        expect(wireSiteHighlightRows(host)).toBe(6);
    });

    it('clicking "Buildable footprint" writes the store the scene subscribes to, and paints ◉', () => {
        const host = mountCard(COMPLETE);
        wireSiteHighlightRows(host);
        const btn = host.querySelector<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}="footprint"]`)!;
        expect(getSiteHighlight()).toBeNull();

        btn.click();

        expect(getSiteHighlight()).toBe('footprint');
        expect(btn.getAttribute('aria-pressed')).toBe('true');
        expect(btn.querySelector('[data-hl-glyph]')!.textContent).toContain('◉');
    });

    it('clicking the same row again CLEARS it — click-to-toggle, no residue', () => {
        const host = mountCard(COMPLETE);
        wireSiteHighlightRows(host);
        const btn = host.querySelector<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}="height"]`)!;
        btn.click();
        expect(getSiteHighlight()).toBe('height');
        btn.click();
        expect(getSiteHighlight()).toBeNull();
        expect(btn.getAttribute('aria-pressed')).toBe('false');
        expect(btn.querySelector('[data-hl-glyph]')!.textContent).toContain('◎');
    });

    it('clicking a DIFFERENT row switches the subject and un-presses the previous one', () => {
        const host = mountCard(COMPLETE);
        wireSiteHighlightRows(host);
        const area = host.querySelector<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}="parcel"]`)!;
        const gfa = host.querySelector<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}="gfa"]`)!;
        area.click();
        gfa.click();
        expect(getSiteHighlight()).toBe('gfa');
        expect(area.getAttribute('aria-pressed')).toBe('false');
        expect(gfa.getAttribute('aria-pressed')).toBe('true');
    });

    it('the click NOTIFIES a subscriber — this is the seam ParcelBoundarySceneRenderer sits on', () => {
        const host = mountCard(COMPLETE);
        wireSiteHighlightRows(host);
        const heard = vi.fn();
        subscribeSiteHighlight(heard);
        host.querySelector<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}="frontage"]`)!.click();
        expect(heard).toHaveBeenCalledTimes(1);
        expect(getSiteHighlight()).toBe('frontage');
    });

    it('the click does NOT bubble to the enclosing fold — the section must not snap shut', () => {
        const host = mountCard(COMPLETE);
        wireSiteHighlightRows(host);
        const details = host.querySelector('details')!;
        const bubbled = vi.fn();
        details.addEventListener('click', bubbled);
        host.querySelector<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}="boundary"]`)!.click();
        expect(bubbled).not.toHaveBeenCalled();
    });

    it('paint is idempotent and store-driven — a re-render from the store agrees with the click', () => {
        const host = mountCard(COMPLETE);
        wireSiteHighlightRows(host);
        host.querySelector<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}="footprint"]`)!.click();
        // A fresh mount (as the card does on refresh) reads the store and paints the same state.
        const again = mountCard(COMPLETE);
        const btn = again.querySelector<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}="footprint"]`)!;
        expect(btn.getAttribute('aria-pressed')).toBe('true');
        paintSiteHighlightRows(again);
        expect(btn.getAttribute('aria-pressed')).toBe('true');
    });
});

describe('§RESI-ORCH-HIGHLIGHT-DOM — the card and the scene use THIS module (source pins)', () => {
    // `__dirname` is the house pattern for source pins under this config (panelDefaults.spec).
    const card = readFileSync(resolve(__dirname, '../../layout/GISAreaLayout.ts'), 'utf8');
    const scene = readFileSync(resolve(__dirname, '../ParcelBoundarySceneRenderer.ts'), 'utf8');

    it('GISAreaLayout renders the label through buildSiteHighlightLabelHtml and wires through wireSiteHighlightRows', () => {
        // ⚠ REPOINTED 2026-09-07 (§26.6.7, L-13085) — ONE HOP LONGER, SAME INVARIANT. The card's
        // read-out row moved to `ceilingHeadlineSection.ts`'s `buildEnvelopeCardRowHtml` so the
        // four lifted ceilings could be mounted and clicked in a spec (`ceilingHeadline.spec.ts`);
        // the card now calls THAT, and that calls THIS module's builder. The invariant was never
        // "the card names this function" — it is that the card renders the label through the ONE
        // builder and keeps no copy of the markup, which the next test pins directly.
        expect(card).toContain('buildEnvelopeCardRowHtml({');
        expect(card).toContain("from '../site/ceilingHeadlineSection'");
        expect(card).toContain("from '../site/siteHighlightRowControl'");
        const rowProducer = readFileSync(resolve(__dirname, '../ceilingHeadlineSection.ts'), 'utf8');
        expect(rowProducer).toContain("from './siteHighlightRowControl'");
        expect(rowProducer).toContain('buildSiteHighlightLabelHtml(');
        expect(card).toContain('wireSiteHighlightRows(panel)');
    });

    it('GISAreaLayout keeps NO private copy of the button markup or the click wire', () => {
        expect(card).not.toMatch(/const wireSiteHighlightRows\s*=/);
        expect(card).not.toContain('data-hl-glyph="1"');
    });

    it('ParcelBoundarySceneRenderer subscribes to the SAME store the click writes', () => {
        expect(scene).toContain('subscribeSiteHighlight(() => this.refresh())');
        expect(scene).toContain('siteHighlightEmphasis(subject, role)');
    });
});
