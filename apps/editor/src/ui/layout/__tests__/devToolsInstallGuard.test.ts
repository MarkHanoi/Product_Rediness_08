/**
 * devToolsInstallGuard.test.ts — the unguarded dev-tools install (C74-class).
 *
 * DEFECT (found 2026-08-14): `mountAIArea` (AIAreaLayout.ts) called
 * `installPryzmTestFunctions()` UNCONDITIONALLY — no `import.meta.env.DEV`
 * guard — so a module that declares itself dev-only (`src/dev/`, `__pryzm*`
 * globals) executed in the shipped editor.
 *
 * The fix is a SPLIT, not a blanket guard, because a production capability
 * rode on the dev installer: `provideLiveGraphSources({ constraint: aiService })`
 * is what powers the UBG `violates` projection, and the Building-Graph /
 * Living-Graph overlays are user-facing graph UI. Post-split:
 *
 *   • installLiveGraphWiring.ts (ui/layout)  — PRODUCTION half, called
 *     unconditionally from mountAIArea.
 *   • installDevTestFunctions.ts (ui/layout) — guard seam; installs the
 *     `__pryzm*` DevTools helpers only when dev-mode (parameterised so this
 *     suite can exercise BOTH modes under vitest, where import.meta.env.DEV
 *     is fixed).
 *   • src/dev/installPryzmTestFunctions.ts   — dev half only (window.__pryzm*
 *     helpers); no longer performs graph wiring.
 *
 * Two arms:
 *   A. BEHAVIOUR — production mode must NOT install `__pryzm*` globals;
 *      dev mode MUST.
 *   B. SOURCE    — the AIAreaLayout call site must be `import.meta.env.DEV`-
 *      gated (the repo's canonical dev-check, per engineLauncher.ts /
 *      window-shim.ts Pattern D), and the production graph wiring must
 *      survive OUTSIDE the guard.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The guard seam under test (created by the fix — its absence is the RED).
import { installDevTestFunctions } from '../installDevTestFunctions';

const LAYOUT_DIR = resolve(__dirname, '..');
const AI_AREA_SRC = readFileSync(resolve(LAYOUT_DIR, 'AIAreaLayout.ts'), 'utf8');
const DEV_INSTALLER_SRC = readFileSync(
    resolve(LAYOUT_DIR, '../../dev/installPryzmTestFunctions.ts'),
    'utf8',
);
const GRAPH_WIRING_SRC = readFileSync(
    resolve(LAYOUT_DIR, 'installLiveGraphWiring.ts'),
    'utf8',
);

const PRYZM_GLOBALS = [
    '__pryzmFamilyPipeline',
    '__pryzmValidateLayout',
    '__pryzmListTestFunctions',
    '__pryzmSampleFamilyRequest',
    '__pryzmSampleLayoutDto',
] as const;

describe('C74-class guard — dev-tools install is dev-mode-only', () => {
    // node env: no window. Stub a bare object so the installer has a target.
    beforeEach(() => {
        (globalThis as Record<string, unknown>).window = {};
    });
    afterEach(() => {
        delete (globalThis as Record<string, unknown>).window;
    });

    it('A1 — production mode (isDev=false) installs NO __pryzm* globals', async () => {
        await installDevTestFunctions(false);
        const w = (globalThis as Record<string, unknown>).window as Record<string, unknown>;
        for (const name of PRYZM_GLOBALS) {
            expect(w[name], `${name} must be absent in production`).toBeUndefined();
        }
    });

    // 30s: the first dev-mode call transforms the whole @pryzm/schemas barrel
    // behind the dynamic import — slow under vitest's transform, not at runtime.
    it('A2 — dev mode (isDev=true) installs ALL __pryzm* globals', { timeout: 30_000 }, async () => {
        await installDevTestFunctions(true);
        const w = (globalThis as Record<string, unknown>).window as Record<string, unknown>;
        for (const name of PRYZM_GLOBALS) {
            expect(typeof w[name], `${name} must be installed in dev`).toBe('function');
        }
    });
});

describe('C74-class guard — call-site + split shape (source assertions)', () => {
    it('B1 — AIAreaLayout no longer calls installPryzmTestFunctions directly', () => {
        // The old defect: a bare, unconditional `installPryzmTestFunctions()`.
        expect(AI_AREA_SRC).not.toMatch(/installPryzmTestFunctions\(\)/);
        // Nor a static import of the dev module (it must stay out of the prod
        // chunk graph; the guard seam dynamic-imports it under DEV only).
        expect(AI_AREA_SRC).not.toMatch(/from '..\/..\/dev\/installPryzmTestFunctions'/);
    });

    it('B2 — the dev install sits behind the canonical import.meta.env.DEV guard', () => {
        expect(AI_AREA_SRC).toMatch(
            /if \(import\.meta\.env\.DEV\)[\s\S]{0,200}installDevTestFunctions\(/,
        );
    });

    it('B3 — the PRODUCTION graph wiring is called OUTSIDE the guard', () => {
        // installLiveGraphWiring() must be invoked, and NOT inside the DEV block.
        expect(AI_AREA_SRC).toMatch(/installLiveGraphWiring\(\);/);
        const guardIdx = AI_AREA_SRC.indexOf('import.meta.env.DEV');
        const wiringIdx = AI_AREA_SRC.indexOf('installLiveGraphWiring();');
        expect(wiringIdx).toBeGreaterThan(-1);
        // The wiring call precedes the guard block (unconditional).
        expect(wiringIdx).toBeLessThan(guardIdx);
    });

    it('B4 — the dev module carries NO production graph wiring any more', () => {
        // Match CALLS/IMPORTS (identifier followed by `(` or inside an import),
        // not prose mentions in comments documenting where the wiring moved.
        expect(DEV_INSTALLER_SRC).not.toMatch(/provideLiveGraphSources\(/);
        expect(DEV_INSTALLER_SRC).not.toMatch(/installBuildBuildingGraph\(/);
        expect(DEV_INSTALLER_SRC).not.toMatch(/installBuildingGraphOverlay\(/);
        expect(DEV_INSTALLER_SRC).not.toMatch(/installLivingGraphOverlay\(/);
        expect(DEV_INSTALLER_SRC).not.toMatch(/from '\.\.\/engine\/buildBuildingGraph'/);
        // NOTE deliberately NOT asserted: the string constant
        // `'@pryzm/ai-host/src/.../validate-and-format.js'` stays — it is the
        // LAZY deep-import path __pryzmValidateLayout loads at CALL time, a
        // dev helper, not install-time production wiring.
        expect(DEV_INSTALLER_SRC).not.toMatch(/@pryzm\/core-app-model/);
    });

    it('B5 — the production wiring module carries ALL four wiring calls', () => {
        expect(GRAPH_WIRING_SRC).toMatch(/provideLiveGraphSources\(\{ semantic: semanticGraphManager, constraint: aiService \}\)/);
        expect(GRAPH_WIRING_SRC).toMatch(/installBuildBuildingGraph\(\);/);
        expect(GRAPH_WIRING_SRC).toMatch(/installBuildingGraphOverlay\(\);/);
        expect(GRAPH_WIRING_SRC).toMatch(/installLivingGraphOverlay\(\);/);
    });
});
