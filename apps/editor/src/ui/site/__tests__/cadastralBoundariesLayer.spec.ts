// §CADASTRAL-BOUNDARIES-ONE-OWNER (C57 §5.5, C59 §2.10) — the arms that BIND.
//
// ⛔ WHAT THIS SPEC IS FOR, AND WHAT IT DELIBERATELY DOES NOT TEST. It does not test that a line
// appears on a map — no viewport is constructed here. It tests the two properties that, if they
// broke, would break the feature INVISIBLY:
//   1. ONE flip notifies EVERY surface (the C59 §2.10 property — the whole reason this store
//      exists instead of a boolean on each viewport);
//   2. the five verdicts produce five DIFFERENT sentences (§CONTEXT-DATA-HONESTY — four of them
//      draw the same nothing on screen, so the sentence is the only thing that tells them apart).
// A spec that only checked "setEnabled(true) then getEnabled() is true" would pass forever while
// the 2D chip quietly read a local boolean, which is the exact defect being guarded.

import { describe, it, expect, beforeEach } from 'vitest';
import {
    getCadastralBoundariesEnabled,
    setCadastralBoundariesEnabled,
    toggleCadastralBoundaries,
    subscribeCadastralBoundaries,
    getCadastralBoundariesVerdict,
    setCadastralBoundariesVerdict,
    cadastralBoundariesSentence,
    cadastralBoundariesChipEnabled,
    registerCadastralBoundarySurface,
    describeCadastralBoundaryReach,
    getCadastralBoundarySurfaces,
    __resetCadastralBoundariesForTests,
    __resetCadastralBoundarySurfacesForTests,
    type CadastralBoundariesVerdict,
} from '../cadastralBoundariesLayer.js';

beforeEach(() => {
    __resetCadastralBoundariesForTests();
    __resetCadastralBoundarySurfacesForTests();
});

describe('§CADASTRAL-BOUNDARIES — one owner, read by every surface', () => {
    it('is OFF at rest: an overlay that costs a government round-trip is never on by default', () => {
        expect(getCadastralBoundariesEnabled()).toBe(false);
        expect(getCadastralBoundariesVerdict().kind).toBe('idle');
    });

    it('⭐ THE BINDING ARM — ONE flip notifies BOTH registered surfaces', () => {
        // The two surfaces the founder named: the 2D MapLibre map and the Forma Cesium panel.
        // They are mounted in mutually exclusive view modes, so this is the property that a
        // per-viewport boolean could not have.
        const seen: string[] = [];
        subscribeCadastralBoundaries(() => seen.push('map2d'));
        subscribeCadastralBoundaries(() => seen.push('forma3d'));

        setCadastralBoundariesEnabled(true);

        expect(seen).toEqual(['map2d', 'forma3d']);
        // …and BOTH read the same value from the same place.
        expect(getCadastralBoundariesEnabled()).toBe(true);
    });

    it('does not notify when the value is unchanged (an idempotent re-assert costs no repaint)', () => {
        setCadastralBoundariesEnabled(true);
        let n = 0;
        subscribeCadastralBoundaries(() => { n += 1; });
        setCadastralBoundariesEnabled(true);
        expect(n).toBe(0);
        setCadastralBoundariesEnabled(false);
        expect(n).toBe(1);
    });

    it('toggling twice returns to OFF and reports the value now in force', () => {
        expect(toggleCadastralBoundaries()).toBe(true);
        expect(toggleCadastralBoundaries()).toBe(false);
        expect(getCadastralBoundariesEnabled()).toBe(false);
    });

    it('turning OFF clears the verdict — a stale "showing 43" under an OFF chip is a false claim', () => {
        setCadastralBoundariesEnabled(true);
        setCadastralBoundariesVerdict({ kind: 'ok', count: 43, truncated: false, sourceLabel: 'catastro' });
        setCadastralBoundariesEnabled(false);
        expect(getCadastralBoundariesVerdict().kind).toBe('idle');
    });

    it('a listener that throws does not stop the others (one bad surface cannot freeze the layer)', () => {
        let reached = false;
        subscribeCadastralBoundaries(() => { throw new Error('surface exploded'); });
        subscribeCadastralBoundaries(() => { reached = true; });
        expect(() => setCadastralBoundariesEnabled(true)).not.toThrow();
        expect(reached).toBe(true);
    });

    it('unsubscribe actually detaches', () => {
        let n = 0;
        const off = subscribeCadastralBoundaries(() => { n += 1; });
        setCadastralBoundariesEnabled(true);
        off();
        setCadastralBoundariesEnabled(false);
        expect(n).toBe(1);
    });
});

describe('§CONTEXT-DATA-HONESTY — the five verdicts must not print the same sentence', () => {
    const verdicts: CadastralBoundariesVerdict[] = [
        { kind: 'idle' },
        { kind: 'loading' },
        { kind: 'ok', count: 0, truncated: false, sourceLabel: null },
        { kind: 'unsupported', reason: 'Swisstopo answers one point at a time.' },
        { kind: 'unreachable', reason: 'Catastro did not answer.' },
    ];

    it('⭐ THE BINDING ARM — all five sentences are DISTINCT and non-empty', () => {
        // On screen, `ok`-with-0, `unsupported` and `unreachable` all draw exactly the same
        // nothing. If any two of these collapse, the user cannot tell "there is nothing here"
        // from "this register cannot be asked" — L-581 / L-616, at overlay scale.
        const sentences = verdicts.map(cadastralBoundariesSentence);
        for (const s of sentences) expect(s.length).toBeGreaterThan(20);
        expect(new Set(sentences).size).toBe(verdicts.length);
    });

    it('an ANSWERED-EMPTY area is the only arm that makes a claim about the land', () => {
        const empty = cadastralBoundariesSentence(
            { kind: 'ok', count: 0, truncated: false, sourceLabel: null },
        );
        // It says the cadastre ANSWERED. The other two blank-drawing arms must not.
        expect(empty).toMatch(/answered/i);
        expect(cadastralBoundariesSentence({ kind: 'unsupported', reason: 'X publishes no area query.' }))
            .not.toMatch(/no parcels (in|here)/i);
    });

    it('truncated and complete are different sentences (C57 §1.14.3)', () => {
        const complete = cadastralBoundariesSentence(
            { kind: 'ok', count: 12, truncated: false, sourceLabel: 'pdok-nl' },
        );
        const partial = cadastralBoundariesSentence(
            { kind: 'ok', count: 12, truncated: true, sourceLabel: 'pdok-nl' },
        );
        expect(complete).not.toBe(partial);
        expect(complete).toMatch(/all 12/);
        expect(partial).toMatch(/partial/i);
        // Both attribute the register that answered (C57 §1.9).
        expect(complete).toContain('pdok-nl');
        expect(partial).toContain('pdok-nl');
    });

    it('only `unsupported` disables the chip — an outage must stay retryable', () => {
        expect(cadastralBoundariesChipEnabled({ kind: 'unsupported', reason: 'r' })).toBe(false);
        expect(cadastralBoundariesChipEnabled({ kind: 'unreachable', reason: 'r' })).toBe(true);
        expect(cadastralBoundariesChipEnabled({ kind: 'idle' })).toBe(true);
        expect(cadastralBoundariesChipEnabled({ kind: 'ok', count: 0, truncated: false, sourceLabel: null }))
            .toBe(true);
    });

    it('no arm blames the plot for a source or reach limitation', () => {
        for (const v of [
            { kind: 'unsupported', reason: 'Swisstopo answers one point at a time.' } as const,
            { kind: 'unreachable', reason: 'Catastro did not answer.' } as const,
        ]) {
            expect(cadastralBoundariesSentence(v)).not.toMatch(/your plot (has|is) no/i);
        }
    });
});

describe('§CADASTRAL-BOUNDARY-REACH — unreported ≠ none (C84 EI-1b)', () => {
    it('⭐ an EMPTY registry is `unreported`, and does NOT claim nothing draws it', () => {
        const reach = describeCadastralBoundaryReach();
        expect(reach.status).toBe('unreported');
        expect(reach.surfaces).toEqual([]);
        // It must blame PRYZM's reporting, not the plot, and must not assert "nothing will happen".
        expect(reach.sentence).toMatch(/reporting/i);
        expect(reach.sentence).not.toMatch(/nothing will happen/i);
    });

    it('names ONE surface in the user’s own words', () => {
        registerCadastralBoundarySurface('site-boundary-map-2d', '2D site map');
        const reach = describeCadastralBoundaryReach();
        expect(reach.status).toBe('named');
        expect(reach.sentence).toContain('2D site map');
        expect(reach.sentence).not.toMatch(/views/);
    });

    it('⭐ names BOTH surfaces once both declare — the two-view claim is MEASURED, not asserted', () => {
        registerCadastralBoundarySurface('site-boundary-map-2d', '2D site map');
        registerCadastralBoundarySurface('cesium-forma', '3D site');
        const reach = describeCadastralBoundaryReach();
        expect(reach.status).toBe('named');
        expect(reach.surfaces).toEqual(['2D site map', '3D site']);
        expect(reach.sentence).toContain('2D site map and 3D site');
        expect(reach.sentence).toMatch(/views/);
    });

    it('a re-registered id REPLACES its row rather than duplicating it (hot reload)', () => {
        registerCadastralBoundarySurface('cesium-forma', '3D site');
        registerCadastralBoundarySurface('cesium-forma', '3D site');
        expect(getCadastralBoundarySurfaces()).toEqual(['3D site']);
    });

    it('disposing a registration drops the view from the sentence', () => {
        const off = registerCadastralBoundarySurface('site-boundary-map-2d', '2D site map');
        registerCadastralBoundarySurface('cesium-forma', '3D site');
        off();
        expect(getCadastralBoundarySurfaces()).toEqual(['3D site']);
    });

    it('⛔ the reach registry is NOT the listener list — a chip that subscribes is not a surface', () => {
        // A card repainting its own pressed state subscribes too. Counting listeners to answer
        // "where will this show?" would report the panel as a viewport ([[fake-more-capable-than-real]]).
        subscribeCadastralBoundaries(() => { /* a chip, not a renderer */ });
        subscribeCadastralBoundaries(() => { /* another chip */ });
        expect(describeCadastralBoundaryReach().status).toBe('unreported');
    });
});
