/**
 * §26.6 rule 3 (L-13046) — the control: intent BESIDE ceiling, live on the store's dirty channel,
 * every ceiling a hyperlink to its owner, every refusal with both numbers and no clamp.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import {
    INTENT_CEILING_CEILING_FIGURE_ATTR,
    INTENT_CEILING_INTENT_FIGURE_ATTR,
    INTENT_CEILING_LIVE_ATTR,
    INTENT_CEILING_ROW_PREFIX,
    INTENT_CEILING_TESTID,
    INTENT_CEILING_UNREADABLE_TESTID,
    INTENT_CEILING_VERDICT_ATTR,
    mountParcelLawIntentAgainstCeiling,
    type ParcelLawIntentDeps,
} from '../parcelLawIntentAgainstCeiling';
import { buildParcelLawModel } from '../../site/parcel/parcelLawModel';
import { __resetSiteHighlightForTests, getSiteHighlight, SITE_HIGHLIGHT_ATTR } from '../../site/siteGeometryHighlight';
import { wireSiteHighlightRows } from '../../site/siteHighlightRowControl';

afterEach(() => {
    __resetSiteHighlightForTests();
    document.body.replaceChildren();
});

const RECT = [{ x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: 30 }, { x: 0, z: 30 }];

function envelope(over: Record<string, unknown> = {}): never {
    return {
        insetPolygon: [{ x: 3, z: 3 }, { x: 37, z: 3 }, { x: 37, z: 27 }, { x: 3, z: 27 }],
        insetAreaM2: 431, maxHeight_m: 9, farLimitedHeight_m: null, maxFloors: 3, maxFAR: null,
        maxCoverage: null, maxVolumeM3: 3879, footprintIsUpperBound: false, confidence: 'structured',
        granularity: 'parcel', status: 'ok', refusal: null, zoneCode: 'R1',
        derivation: [], caveats: [], tiers: [], permittedUse: [], ...over,
    } as never;
}

/** A space-envelope store with the read + dirty channel the control needs. */
function fakeStore(records: Record<string, unknown>[]): {
    runtime: PryzmRuntime;
    dirty: () => void;
    set: (recs: Record<string, unknown>[]) => void;
} {
    let state = new Map(records.map((r, i) => [String(r.id ?? i), r]));
    const listeners = new Set<() => void>();
    const store = {
        getState: () => state,
        subscribeDirty: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); },
    };
    return {
        runtime: { stores: { spaceEnvelope: store } } as unknown as PryzmRuntime,
        dirty: () => { for (const l of listeners) l(); },
        set: (recs) => { state = new Map(recs.map((r, i) => [String(r.id ?? i), r])); },
    };
}

const level = (id: string, levelId: string, area: number, height: number): Record<string, unknown> =>
    ({ id, role: 'level', levelId, footprintAreaM2: area, height, baseOffset: 0 });

function deps(runtime: PryzmRuntime | null, over: Record<string, unknown> = {}): ParcelLawIntentDeps {
    return {
        runtime: () => runtime,
        readLevels: () => [{ id: 'L0', name: 'Ground', elevation: 0 }, { id: 'L1', name: 'First', elevation: 3 }],
        readModel: () => buildParcelLawModel({ parcelRing: RECT, edgeClassifications: undefined, identity: null, envelope: envelope(over) }),
    };
}

describe('§26.6 rule 3 — mounted: every intent beside its ceiling, refusal with both numbers', () => {
    it('renders the pairs from the REAL producers over a fake store, and a ground overhang is REFUSED', () => {
        const s = fakeStore([level('e0', 'L0', 875, 3)]);
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountParcelLawIntentAgainstCeiling(host, deps(s.runtime));
        const root = host.querySelector(`[data-testid="${INTENT_CEILING_TESTID}"]`)!;
        expect(root).not.toBeNull();
        const ground = root.querySelector(`[data-testid="${INTENT_CEILING_ROW_PREFIX}ground-area"]`)!;
        expect(ground.getAttribute(INTENT_CEILING_VERDICT_ATTR)).toBe('exceeds');
        expect(ground.textContent).toContain('875 m²');
        expect(ground.textContent).toContain('Maximum implantation area (ground, plan)');
        expect(ground.textContent).toContain('431 m²');
        expect(ground.textContent).toContain('444 m² less than you asked for');
        expect(ground.textContent).toContain('PRYZM will not clamp');
        // 3.1 — the height pair is within (3 m of 9 m), the level count within (1 of 3).
        expect(root.querySelector(`[data-testid="${INTENT_CEILING_ROW_PREFIX}total-height"]`)!.getAttribute(INTENT_CEILING_VERDICT_ATTR)).toBe('within');
        expect(root.querySelector(`[data-testid="${INTENT_CEILING_ROW_PREFIX}levels"]`)!.getAttribute(INTENT_CEILING_VERDICT_ATTR)).toBe('within');
        h.dispose();
    });

    it('⭐ every CEILING is a hyperlink to its owner — Maximum height lights the limit plane, the implantation area the inset ring', () => {
        const s = fakeStore([level('e0', 'L0', 300, 3)]);
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountParcelLawIntentAgainstCeiling(host, deps(s.runtime));
        const subjects = [...host.querySelectorAll<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}]`)].map((b) => b.getAttribute(SITE_HIGHLIGHT_ATTR));
        expect(subjects).toContain('height');
        expect(subjects).toContain('footprint');
        expect(subjects).toContain('gfa');
        expect(wireSiteHighlightRows(host)).toBeGreaterThanOrEqual(3);
        host.querySelector<HTMLButtonElement>(`button[${SITE_HIGHLIGHT_ATTR}="height"]`)!.click();
        expect(getSiteHighlight()).toBe('height');
        h.dispose();
    });

    it('a ceiling the pack did not derive is text-with-reason, and its pair reads NOT CHECKABLE', () => {
        const s = fakeStore([level('e0', 'L0', 300, 3)]);
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountParcelLawIntentAgainstCeiling(host, deps(s.runtime, { maxHeight_m: null }));
        const height = host.querySelector(`[data-testid="${INTENT_CEILING_ROW_PREFIX}total-height"]`)!;
        expect(height.getAttribute(INTENT_CEILING_VERDICT_ATTR)).toBe('ceiling-not-derived');
        expect(height.textContent).toContain('not derived');
        expect(height.querySelector(`button[${SITE_HIGHLIGHT_ATTR}="height"]`)).toBeNull();
        h.dispose();
    });

    it('⭐ LIVE — a store dirty notification repaints, and the verdict follows the envelope', () => {
        const s = fakeStore([level('e0', 'L0', 300, 3)]);
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountParcelLawIntentAgainstCeiling(host, deps(s.runtime));
        expect(host.querySelector(`[data-testid="${INTENT_CEILING_ROW_PREFIX}ground-area"]`)!.getAttribute(INTENT_CEILING_VERDICT_ATTR)).toBe('within');
        s.set([level('e0', 'L0', 600, 3)]);
        s.dirty();
        expect(h.liveRepaintCount()).toBe(1);
        expect(h.element.getAttribute(INTENT_CEILING_LIVE_ATTR)).toBe('1');
        expect(host.querySelector(`[data-testid="${INTENT_CEILING_ROW_PREFIX}ground-area"]`)!.getAttribute(INTENT_CEILING_VERDICT_ATTR)).toBe('exceeds');
        h.dispose();
        s.dirty();
        expect(h.liveRepaintCount()).toBe(1);
    });

    it('no store → an ADMISSION about PRYZM, never zeros or a pass', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountParcelLawIntentAgainstCeiling(host, deps(null));
        const miss = host.querySelector(`[data-testid="${INTENT_CEILING_UNREADABLE_TESTID}"]`)!;
        expect(miss).not.toBeNull();
        expect(miss.getAttribute('data-reason')).toBe('no-store');
        expect(host.querySelectorAll(`[${INTENT_CEILING_VERDICT_ATTR}]`)).toHaveLength(0);
        h.dispose();
    });
});

describe('§PAIR-IS-ALIGNMENT-NOT-A-WORD (L-13077) — the relationship is the LAYOUT, never a printed word', () => {
    /** Mount over a store with one over-ceiling ground plate and one within-ceiling height. */
    function mounted(): { host: HTMLElement; dispose: () => void } {
        const s = fakeStore([level('e0', 'L0', 875, 3), level('e1', 'L1', 300, 3)]);
        const host = document.createElement('div');
        document.body.appendChild(host);
        const h = mountParcelLawIntentAgainstCeiling(host, deps(s.runtime));
        return { host, dispose: () => h.dispose() };
    }

    it('⛔ the literal word is GONE from every pair row — no separator element, no stray "beside"', () => {
        const { host, dispose } = mounted();
        // The element that carried it no longer exists anywhere in the section.
        expect(host.querySelectorAll('.anl-plaw-intent-beside')).toHaveLength(0);
        const rows = [...host.querySelectorAll(`[${INTENT_CEILING_VERDICT_ATTR}]`)];
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            // ⛔ Scoped to the ROW, not the section: the section TITLE and LEDE are sentences that
            // legitimately use the word, and they are load-bearing prose (§26.6.6). What must not
            // exist is the word printed BETWEEN the two figures as if it were data.
            const head = row.querySelector('.anl-plaw-intent-head')!;
            expect(head).not.toBeNull();
            expect(head.textContent!.toLowerCase()).not.toContain('beside');
        }
        dispose();
    });

    it('⭐ the row still exposes BOTH figures, and the pair is two lines sharing one numeric column', () => {
        const { host, dispose } = mounted();
        const ground = host.querySelector(`[data-testid="${INTENT_CEILING_ROW_PREFIX}ground-area"]`)!;
        const intentFig = ground.querySelector(`[${INTENT_CEILING_INTENT_FIGURE_ATTR}]`)!;
        const ceilingFig = ground.querySelector(`[${INTENT_CEILING_CEILING_FIGURE_ATTR}]`)!;
        expect(intentFig.textContent).toContain('875 m²');
        expect(ceilingFig.textContent).toContain('431 m²');
        expect(intentFig.getAttribute(INTENT_CEILING_INTENT_FIGURE_ATTR)).toBe('present');
        expect(ceilingFig.getAttribute(INTENT_CEILING_CEILING_FIGURE_ATTR)).toBe('present');
        // Exactly one of each per row — a second copy of either would be the duplication rule 1 bans.
        expect(ground.querySelectorAll(`[${INTENT_CEILING_INTENT_FIGURE_ATTR}]`)).toHaveLength(1);
        expect(ground.querySelectorAll(`[${INTENT_CEILING_CEILING_FIGURE_ATTR}]`)).toHaveLength(1);
        // Two lines, each the SAME grid, so the two figures share one right edge at every width.
        const lines = ground.querySelectorAll('.anl-plaw-intent-line');
        expect(lines).toHaveLength(2);
        for (const l of lines) {
            expect((l as HTMLElement).style.gridTemplateColumns).toBe('minmax(0,1fr) auto');
        }
        // ⛔ The figures must never wrap, and must be tabular so the digits stack.
        for (const f of [intentFig, ceilingFig] as HTMLElement[]) {
            expect(f.style.whiteSpace).toBe('nowrap');
            expect(f.style.fontVariantNumeric).toBe('tabular-nums');
        }
        dispose();
    });

    it('⛔ the CEILING figure is never de-weighted below the intent it is compared against', () => {
        const { host, dispose } = mounted();
        for (const row of host.querySelectorAll(`[${INTENT_CEILING_VERDICT_ATTR}="within"], [${INTENT_CEILING_VERDICT_ATTR}="exceeds"]`)) {
            const i = row.querySelector<HTMLElement>(`[${INTENT_CEILING_INTENT_FIGURE_ATTR}="present"]`);
            const c = row.querySelector<HTMLElement>(`[${INTENT_CEILING_CEILING_FIGURE_ATTR}="present"]`);
            if (!i || !c) continue;
            expect(c.style.fontWeight).toBe(i.style.fontWeight);
            // Neither figure carries its own font-size — both inherit the section's ONE base, so
            // they cannot render at different sizes however the base moves.
            expect(i.style.fontSize).toBe('');
            expect(c.style.fontSize).toBe('');
        }
        dispose();
    });

    it('⭐ every refusal sentence survives the re-layout, verbatim (§26.6.6 — the restructure MOVES, never removes)', () => {
        const { host, dispose } = mounted();
        const ground = host.querySelector(`[data-testid="${INTENT_CEILING_ROW_PREFIX}ground-area"]`)!;
        expect(ground.getAttribute(INTENT_CEILING_VERDICT_ATTR)).toBe('exceeds');
        expect(ground.textContent).toContain('444 m² less than you asked for');
        expect(ground.textContent).toContain('PRYZM will not clamp');
        dispose();
    });

    it('the section declares ONE type base, and no inline size lands under the 10px legibility floor', () => {
        const { host, dispose } = mounted();
        const root = host.querySelector<HTMLElement>(`[data-testid="${INTENT_CEILING_TESTID}"]`)!;
        // ⭐ The base exists — without it the two figures fall through to the document default
        // (16px) while every label around them is pinned, which is the defect the founder read as
        // "values much larger than labels".
        expect(root.style.fontSize).toMatch(/^\d+(\.\d+)?px$/);
        expect(Number.parseFloat(root.style.fontSize)).toBeGreaterThanOrEqual(10);
        // ⛔ NO DESCENDANT CARRIES A FRESH px LITERAL. A size here is either a ratio of the base
        // (`em`) or `inherit` — the highlight control declares `font:inherit` so a linked ceiling
        // label renders at exactly the size of the plain one beside it. Either way the section
        // moves as ONE, and no child can drift under §UI-DENSITY-SCALE's MIN_FONT_PX floor while
        // the base clears it. This is the pin that keeps the six scattered literals from coming
        // back one edit at a time.
        for (const n of root.querySelectorAll<HTMLElement>('*')) {
            const fs = n.style.fontSize;
            if (fs.length > 0) expect(fs).not.toMatch(/px$/);
        }
        dispose();
    });
});

describe('§26.6 rule 3 — the control computes nothing and clamps nothing (source pins)', () => {
    const src = readFileSync(resolve(__dirname, '../parcelLawIntentAgainstCeiling.ts'), 'utf8');
    it('reads the ONE producers, and never writes the store or a clamp', () => {
        expect(src).toContain('collectIntendedAreas(');
        expect(src).toContain('buildIntentAgainstCeiling(');
        expect(src).toContain('resolveEnvelopeStore(');
        // No dispatch, no `Math.min(intent, ceiling)` — the word "clamp" appears only in the header
        // that forbids it, so the pin is on the OPERATION, not the word.
        expect(src).not.toMatch(/executeCommand|Math\.min\(\s*(intent|asked|p\.intent)/);
        expect(src).not.toMatch(/innerHTML|insertAdjacentHTML/);
    });
});
