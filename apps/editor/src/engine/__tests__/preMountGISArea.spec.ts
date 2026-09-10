// §STARTUP-HOIST-THE-GLOBE-SURFACE (lane PERF-OPEN, L-13278) — reachability + re-convergence pins.
//
// These read SOURCE TEXT on purpose. The two facts they guard are ORDER facts inside two large
// functions (`bootstrap()` at ~1 600 lines, `createSite()`'s caller graph), and order between
// two statements in one function is a text fact that no unit of behaviour exercises without a
// full engine boot:
//
//   1. REACHABILITY — `preMountGISArea(` is called in `engineLauncher.bootstrap()` BEFORE
//      `await initBuilders(`. If a refactor moves it after, the globe surface goes live ~2.8 s
//      later again and NOTHING fails: the location step still opens, just late, and the only
//      symptom is a stopwatch. That is `committed-is-not-reachable`, and it is the failure this
//      repo collects most.
//
//   2. RE-CONVERGENCE — `OnboardingStepController.createSite()` awaits
//      `whenEngineReadyForSite()` BEFORE it reaches `createSiteFromRect(`. Opening the location
//      step early is only safe because this await exists; a refactor that reorders or drops it
//      would let a fast parcel pick author into a model whose stores are not yet registered,
//      and again nothing would fail loudly — the model would simply be wrong.
//
// Plus the seam's own contract, which IS behavioural: the pre-mount is adopted, never doubled.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(join(HERE, rel), 'utf8');

describe('§STARTUP-HOIST-THE-GLOBE-SURFACE — reachability', () => {
    it('engineLauncher calls preMountGISArea BEFORE it awaits initBuilders', () => {
        const src = read('../engineLauncher.ts');
        const hoist = src.indexOf('preMountGISArea({');
        const builders = src.indexOf('= await initBuilders({');
        expect(hoist, 'preMountGISArea( call is missing from bootstrap()').toBeGreaterThan(-1);
        expect(builders).toBeGreaterThan(-1);
        expect(hoist, 'preMountGISArea( must precede `await initBuilders(` in bootstrap()')
            .toBeLessThan(builders);
    });

    it('engineLauncher calls preMountGISArea AFTER initViewSetup (its inputs exist only then)', () => {
        const src = read('../engineLauncher.ts');
        const viewSetup = src.indexOf('= initViewSetup({');
        const hoist = src.indexOf('preMountGISArea({');
        expect(viewSetup).toBeGreaterThan(-1);
        expect(hoist).toBeGreaterThan(viewSetup);
    });

    it('createMainLayout still goes through mountGISArea (the adopter), not the impl', () => {
        const layout = read('../../ui/Layout.ts');
        expect(layout).toContain('mountGISArea(props, runtime)');
        expect(layout).not.toContain('mountGISAreaImpl');
    });
});

describe('§STARTUP-HOIST-THE-GLOBE-SURFACE — re-convergence (the load-bearing half)', () => {
    it('createSite() awaits whenEngineReadyForSite() before createSiteFromRect(', () => {
        const src = read('../../ui/onboarding/OnboardingStepController.ts');
        const fnStart = src.indexOf('private async createSite(');
        expect(fnStart, 'createSite must be async — it awaits the engine').toBeGreaterThan(-1);
        const body = src.slice(fnStart);
        const awaitIdx = body.indexOf('await whenEngineReadyForSite()');
        const dispatchIdx = body.indexOf('createSiteFromRect(');
        expect(awaitIdx, 'createSite() no longer awaits the engine — a fast parcel pick can author into a half-built model')
            .toBeGreaterThan(-1);
        expect(dispatchIdx).toBeGreaterThan(-1);
        expect(awaitIdx).toBeLessThan(dispatchIdx);
    });

    it('every createSite call site awaits it (no caller runs the sync-era shape)', () => {
        const src = read('../../ui/onboarding/OnboardingStepController.ts');
        const calls = src.match(/this\.createSite\(/g) ?? [];
        const awaited = src.match(/await this\.createSite\(/g) ?? [];
        expect(calls.length).toBeGreaterThan(0);
        expect(awaited.length, 'a createSite() caller is not awaiting it').toBe(calls.length);
    });
});
