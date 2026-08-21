/**
 * §LINK-MODEL-REACHABILITY (L-3157) — the panel has a ROUTE, and it stays.
 *
 * ── WHY A REACHABILITY TEST IS THE ONE THIS FEATURE MOST NEEDED ─────────────
 *
 * The defect this repository keeps re-committing is not broken code — it is
 * FINISHED code nothing calls. `openSiteInspectorPanel` was a complete panel whose
 * only caller lived in a class never instantiated: unreachable for months, and a
 * routine dead-file cleanup would have deleted the capability along with the
 * corpse (§GIS-ACTION-REGISTRY, L-1187). Lane LINK1 wrote 2 347 lines of
 * linked-model engine and no entry point at all.
 *
 * [[committed-is-not-reachable]] and [[authored-but-unwired-is-the-bottleneck]]
 * are the standing lessons, and both say the same thing: prove it at the layer the
 * USER experiences, never at a pure function's return value.
 *
 * ⚠ HONEST ABOUT WHAT THIS ASSERTS. Instantiating `ProjectBrowserPanel` drags in a
 * very large module graph (the whole ViewBrowser surface, its runtime and its
 * stores), which is not loadable under happy-dom without a composed runtime. So
 * this suite proves reachability in TWO independent ways, neither of which is a
 * full render, and it says so rather than implying more:
 *
 *   ARM A — the PANEL MODULE loads standalone and exposes the entry point the
 *           Project Browser dynamically imports. This is a REAL import: if the
 *           module throws at load, or the export is renamed, this fails.
 *   ARM B — the CALL SITE still exists in `ProjectBrowserPanel.ts`, reading the
 *           file from disk. This is a source-level check and is deliberately
 *           labelled as one — a text guard can pass while the runtime is broken
 *           (L-3013, where two text-based guards passed clean and only the suite
 *           that IMPORTED the file failed). Arm A is what covers that gap; arm B
 *           covers what arm A cannot see, namely whether anything CALLS it.
 *
 * Together: the door exists (B) and it opens (A). Neither alone would do.
 *
 * ⚠ ARM A'S TIMEOUT IS A BUDGET, NOT FLAKE TOLERANCE — and the number that made
 * it necessary was a REAL DEFECT, now fixed. Measured:
 *
 *   BEFORE  arm A's first `await import` exceeded 120 s and the transform log
 *           showed the entire command registry loading behind it. Cause: the panel
 *           imported `resolveActiveProjectId` from `ui/site/siteDispatch`, a large
 *           dispatch surface, for a function that reads two runtime fields and one
 *           window global. Per-module cold: `siteDispatch` 9.0 s,
 *           `linkedModelController` 17.7 s (its weight is `@pryzm/core-app-model`
 *           via `apiFetch` — NOT THREE, which was the first guess and was wrong).
 *   AFTER   the resolver was extracted to `engine/project/activeProjectId.ts`
 *           (§LINK-ACTIVE-PID-EXTRACT, L-3160) — this whole file, both arms,
 *           29 assertions: **23 s**.
 *
 * The budget is kept because a real module import in this harness is legitimately
 * slower than vitest's 10 s default, and it is documented so nobody later reads a
 * bare number as permission to retry a hang.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_BROWSER = resolve('apps/editor/src/ui/ViewBrowser/ProjectBrowserPanel.ts');

/**
 * Transform budget for the REAL import in arm A. See the header: the cost is
 * measured, it is build-time, and it is named here rather than left as a bare
 * magic number that a future reader would take for flake tolerance.
 */
const ARM_A_TIMEOUT_MS = 120_000;

describe('§LINK-MODEL-REACHABILITY · ARM A — the panel module loads and exports its entry point', () => {
    it('exposes the exact functions the Project Browser imports', async () => {
        // A REAL import. A module-load throw, a circular barrel, or a renamed
        // export fails here — the class of defect a source grep cannot see
        // ([[scc-no-barrel-access-at-module-load]]).
        const mod = await import('../LinkedModelsPanel');
        expect(typeof mod.openLinkedModelsPanel).toBe('function');
        expect(typeof mod.closeLinkedModelsPanel).toBe('function');
        expect(typeof mod.toggleLinkedModelsPanel).toBe('function');
        expect(typeof mod.isLinkedModelsPanelOpen).toBe('function');
        expect(typeof mod.disposeLinkedModelsPanel).toBe('function');
        expect(typeof mod.wireLinkedModelsRuntime).toBe('function');
    }, ARM_A_TIMEOUT_MS);

    it('reports CLOSED before it is ever opened, rather than throwing', async () => {
        const mod = await import('../LinkedModelsPanel');
        expect(mod.isLinkedModelsPanelOpen()).toBe(false);
    }, ARM_A_TIMEOUT_MS);

    it('opens against a NULL runtime without throwing, and renders the empty state', async () => {
        // A panel that only survives a fully-composed runtime is a panel that
        // breaks on the one path users actually hit first — opening it before a
        // project has finished loading ([[null-at-mount-runtime-event-race]]).
        const mod = await import('../LinkedModelsPanel');
        mod.openLinkedModelsPanel(null);
        expect(mod.isLinkedModelsPanelOpen()).toBe(true);

        const root = document.getElementById('pryzm-linked-models-panel');
        expect(root).not.toBeNull();

        const text = root!.textContent ?? '';
        expect(text).toContain('Linked Models');
        // The empty state EXPLAINS the feature rather than showing a bare "0".
        expect(text).toContain('No linked models in this project.');
        expect(text).toContain('Link a project');
        // The read-only contract is stated, not left to be discovered by clicking.
        expect(text).toContain('cannot be selected');

        mod.closeLinkedModelsPanel();
        expect(mod.isLinkedModelsPanelOpen()).toBe(false);
        expect(document.getElementById('pryzm-linked-models-panel')).toBeNull();
    }, ARM_A_TIMEOUT_MS);

    it('close is idempotent and dispose is safe on an unopened panel', async () => {
        const mod = await import('../LinkedModelsPanel');
        expect(() => mod.closeLinkedModelsPanel()).not.toThrow();
        expect(() => mod.disposeLinkedModelsPanel()).not.toThrow();
    }, ARM_A_TIMEOUT_MS);
});

describe('§LINK-MODEL-REACHABILITY · ARM B — the Project Browser still calls it', () => {
    // SOURCE-LEVEL, and labelled as such. This cannot tell you the panel works;
    // it tells you the only route to it has not been deleted or renamed away.
    const src = readFileSync(PROJECT_BROWSER, 'utf8');

    it('imports the panel module from the GIS tab builder', () => {
        expect(src).toContain("import('../links/LinkedModelsPanel')");
    });

    it('calls the entry point ARM A just proved exists', () => {
        expect(src).toContain('openLinkedModelsPanel');
    });

    it('renders a user-visible "Linked Models" action', () => {
        expect(src).toContain("'Linked Models'");
    });

    it('registers a GIS tab for the builder that carries the action', () => {
        // If the GIS tab itself is ever removed, the button goes with it and this
        // fails — which is the point. A route is only as live as its entry surface.
        expect(src).toMatch(/id:\s*'GIS'/);
        expect(src).toContain('_buildGISPanel');
    });
});
