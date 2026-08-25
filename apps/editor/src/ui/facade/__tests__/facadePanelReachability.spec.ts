/**
 * §FACADE-PANEL-REACHABILITY (L-10930) — the panel has a route from the panel the
 * founder actually opens.
 *
 * ── THE DEFECT THIS EXISTS TO PREVENT, WHICH WE SHIPPED ─────────────────────
 *
 * "Facade from Photo" was authored into `ExportRailPanel.ts` and was UNREACHABLE
 * for its entire life. The founder hard-refreshed, opened a new window, and the
 * button was not there — because `ExportRailPanel` is not the surface his right
 * rail renders. `ProjectBrowserPanel` is.
 *
 * ⛔ AND A BINDING TEST PASSED THE WHOLE TIME. `FacadeReconstructionPanel.spec.ts`
 * constructed its OWN rail, put the item in it, and asserted the item was there.
 * It proved that an array literal contains what the same file put into it. It
 * could never have failed, and it certified a dead button as wired.
 *
 * That is [[committed-is-not-reachable]] and [[authored-but-unwired-is-the-bottleneck]]
 * in one artefact: prove it at the layer the USER experiences, never at a value the
 * test itself supplied.
 *
 * ── THREE ARMS, BECAUSE THE BREAK WAS BETWEEN THEM ──────────────────────────
 *
 *   ARM A — the PANEL MODULE loads standalone and exports the entry point.
 *           A REAL import: a module-load throw, a circular barrel, or a renamed
 *           export fails here ([[scc-no-barrel-access-at-module-load]]).
 *   ARM B — `ProjectBrowserPanel.ts` RENDERS an item carrying the action id.
 *           Source-level, and deliberately labelled as such — a text guard can
 *           pass while the runtime is broken (L-3013). Arm A covers that gap.
 *   ARM C — ⭐ `PlatformProjectBrowser.handleHubMenuAction` HANDLES that same
 *           action id. THIS IS THE ARM THAT WOULD HAVE CAUGHT THE BUG. A button
 *           and a handler can each be perfectly correct while nothing joins them;
 *           the two files are edited by different people at different times, and
 *           an id typo between them is invisible to both A and B.
 *
 * Together: the door exists (B), something is behind it (C), and it opens (A).
 * Arm C is not redundant with B — it is the JOIN, and the join is what broke.
 *
 * ⚠ WHAT THIS DOES NOT ASSERT. It does not render `ProjectBrowserPanel` — that
 * drags in the whole ViewBrowser surface and is not loadable under happy-dom
 * without a composed runtime, the same limitation `linkedModelsReachability.spec.ts`
 * documents. Arms B and C are source reads and are named as such rather than
 * dressed up as a render.
 *
 * The arm A budget is a BUILD-TIME cost, not flake tolerance: a real module import
 * in this harness is legitimately slower than vitest's 10 s default. Named here so
 * nobody later reads a bare number as permission to retry a hang.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** The action id that must appear identically in all three places. */
const ACTION_ID = 'import-facade-photo';

const HUB_PANEL   = resolve('apps/editor/src/ui/ViewBrowser/ProjectBrowserPanel.ts');
const HUB_HANDLER = resolve('apps/editor/src/ui/platform/PlatformProjectBrowser.ts');

const ARM_A_TIMEOUT_MS = 120_000;

describe('§FACADE-PANEL-REACHABILITY · ARM A — the panel module loads and exports its entry point', () => {
    it('exposes the exact function the hub handler dynamically imports', async () => {
        const mod = await import('../FacadeReconstructionPanel');
        expect(typeof mod.openFacadeReconstructionPanel).toBe('function');
        expect(typeof mod.closeFacadeReconstructionPanel).toBe('function');
        expect(typeof mod.toggleFacadeReconstructionPanel).toBe('function');
    }, ARM_A_TIMEOUT_MS);

    it('close is idempotent on a panel that was never opened', async () => {
        const mod = await import('../FacadeReconstructionPanel');
        expect(() => mod.closeFacadeReconstructionPanel()).not.toThrow();
    }, ARM_A_TIMEOUT_MS);
});

describe('§FACADE-PANEL-REACHABILITY · ARM B — the hub panel renders the button', () => {
    // SOURCE-LEVEL. This cannot tell you the panel works; it tells you the entry
    // point exists in the file that renders the founder's right rail.
    const src = readFileSync(HUB_PANEL, 'utf8');

    it('renders an item carrying the action id', () => {
        expect(src).toContain(`'${ACTION_ID}'`);
    });

    it('labels it in the words the founder will look for', () => {
        expect(src).toContain('Facade from Photo');
    });

    it('places it in the Export & Print group, where the other importers live', () => {
        const groupStart = src.indexOf("buildSection('Export &amp; Print'");
        expect(groupStart).toBeGreaterThan(-1);
        const groupEnd = src.indexOf('], false));', groupStart);
        expect(groupEnd).toBeGreaterThan(groupStart);
        // Inside the group's own children array — not merely somewhere in the file.
        expect(src.slice(groupStart, groupEnd)).toContain(`'${ACTION_ID}'`);
    });
});

describe('§FACADE-PANEL-REACHABILITY · ARM C — the hub handler acts on that id', () => {
    // ⭐ THE JOIN. Arms A and B both passed while this link did not exist.
    const src = readFileSync(HUB_HANDLER, 'utf8');

    it('has a switch case for the SAME id the button emits', () => {
        expect(src).toContain(`case '${ACTION_ID}':`);
    });

    it('that case imports the module ARM A proved loads, and calls its entry point', () => {
        const caseStart = src.indexOf(`case '${ACTION_ID}':`);
        expect(caseStart).toBeGreaterThan(-1);
        const caseEnd = src.indexOf('break;', caseStart);
        expect(caseEnd).toBeGreaterThan(caseStart);

        const body = src.slice(caseStart, caseEnd);
        expect(body).toContain("import('../facade/FacadeReconstructionPanel')");
        expect(body).toContain('openFacadeReconstructionPanel');
    });

    it('names the failure on the console instead of swallowing it (C74)', () => {
        // A silent catch is indistinguishable from a dead button — which is the
        // exact defect this whole file exists to close.
        const caseStart = src.indexOf(`case '${ACTION_ID}':`);
        const body = src.slice(caseStart, src.indexOf('break;', caseStart));
        expect(body).toContain('.catch(');
        expect(body).toContain('console.error');
    });

    it('declares the action reachable in the §HUB reachability probe', () => {
        expect(src).toContain(`'${ACTION_ID}': [`);
    });
});
