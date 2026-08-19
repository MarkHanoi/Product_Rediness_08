/**
 * §FIX-BOUNDARY-MISSING-FROM-MAIN-VIEW (L-1108) — every plan pane must be fed the
 * SAME site-context reader.
 *
 * THE DEFECT
 * ──────────
 * The founder's dashed violet parcel boundary rendered in the RIGHT split pane and
 * NOT in the LEFT main pane — same project, same level, both on screen at once.
 *
 * `PlanViewCanvas` draws the C19 parcel ring and the C58 buildable-envelope setback
 * line ONLY when it was constructed with a `siteContextProvider`. §L-431 wired that
 * into `SplitViewManager`'s canvas and never into `PlanViewManager`'s, so the main
 * pane's provider was null and `_renderSiteContext` drew nothing. The boundary was
 * not hidden and not mis-styled — it was never asked for.
 *
 * WHY A SOURCE-PARITY TEST
 * ────────────────────────
 * The bug is not in any function's return value; it is in a CONSTRUCTOR ARGUMENT that
 * one of two call sites forgot to pass. A behavioural test of `PlanViewCanvas` would
 * pass with the provider supplied and prove nothing about the pane that omits it —
 * that is precisely the "stubs the thing under test" trap. What must be pinned is the
 * PARITY of the two wiring sites, which is what this reads.
 *
 * This mirrors the established precedent in
 * `packages/core-app-model/src/views/__tests__/northArrowProjectContext.test.ts`,
 * which pins the same class of canvas-wiring invariant by reading source.
 *
 * SECOND CONSEQUENCE, worth its own assertion: the north arrow resolves
 * `projectNorthRad` from this SAME provider (C34 §1.4). With the provider absent, the
 * main pane's arrow silently defaulted to θ=0 — pointing at PROJECT north while
 * labelling itself TRUE north on any rotated project. One missing argument, two wrong
 * drawings, neither of which throws.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const PRIMARY_SRC = readFileSync(resolve(HERE, '../views/PlanViewManager.ts'), 'utf8');
const SECONDARY_SRC = readFileSync(resolve(HERE, '../views/SplitViewManager.ts'), 'utf8');

/** The ONE shared site-context reader named by §L-432. */
const SHARED_READER = 'readSiteContextRings';

describe('§L-1108 — both plan panes are fed the same site-context reader', () => {
    it('the MAIN pane constructs its PlanViewCanvas with a siteContextProvider', () => {
        // This is the assertion that was false and produced the founder's screenshot.
        expect(PRIMARY_SRC).toMatch(/siteContextProvider:\s*readSiteContextRings/);
    });

    it('the SPLIT pane still constructs its PlanViewCanvas with a siteContextProvider', () => {
        expect(SECONDARY_SRC).toMatch(/siteContextProvider:\s*readSiteContextRings/);
    });

    it('both panes read the SAME reader, so the two panes cannot disagree', () => {
        // §L-432 already established one shared reader precisely so the pane that DRAWS
        // the setback line and the snap that FIRES on it cannot drift. A second reader
        // here would reintroduce exactly that drift (C84 EI-1).
        for (const src of [PRIMARY_SRC, SECONDARY_SRC]) {
            expect(src).toContain(SHARED_READER);
            expect(src).toMatch(/from '.*siteSnapContext'/);
        }
    });

    it('neither pane passes a bespoke inline site provider instead of the shared reader', () => {
        // A hand-rolled `siteContextProvider: () => ({ parcelRing: ... })` at either site
        // would satisfy "draws a boundary" while being a rival authority.
        for (const src of [PRIMARY_SRC, SECONDARY_SRC]) {
            expect(src).not.toMatch(/siteContextProvider:\s*\(\)\s*=>/);
        }
    });

    it('every PlanViewCanvas construction in the pane managers supplies the provider', () => {
        // Guards the NEXT pane. If a third plan pane is added without the provider it will
        // reproduce this defect verbatim, and this test is what says so.
        for (const [name, src] of [['PlanViewManager', PRIMARY_SRC], ['SplitViewManager', SECONDARY_SRC]] as const) {
            const constructions = src.match(/new PlanViewCanvas\(/g) ?? [];
            const providers = src.match(/siteContextProvider:/g) ?? [];
            expect(constructions.length, `${name}: expected at least one PlanViewCanvas`).toBeGreaterThan(0);
            expect(
                providers.length,
                `${name}: ${constructions.length} PlanViewCanvas construction(s) but ${providers.length} siteContextProvider(s)`,
            ).toBe(constructions.length);
        }
    });
});
