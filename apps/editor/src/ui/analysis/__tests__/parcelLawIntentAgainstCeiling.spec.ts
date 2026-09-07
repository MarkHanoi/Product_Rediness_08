/**
 * §26.6 rule 3 (L-13046) — the control: intent BESIDE ceiling, live on the store's dirty channel,
 * every ceiling a hyperlink to its owner, every refusal with both numbers and no clamp.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import {
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
