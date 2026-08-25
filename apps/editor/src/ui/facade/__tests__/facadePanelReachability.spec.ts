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

/**
 * §FACADE-CORNERS-ARE-ASKED-FOR · ARM D (L-10973) — the panel does NOT silently
 * guess the facade plane.
 *
 * ⭐ THE FOUNDER'S OWN MEASUREMENT IS THE REQUIREMENT. On 2026-08-25 he ran the
 * first real photograph: automatic detection scored 0.64, his four hand-placed
 * corners scored 1.00, and his rectification was visibly better. C108 §4.3 makes an
 * uncertain plane CAP every downstream confidence, so a 0.64 plane poisons the whole
 * reading while still looking like an answer — and he asked for "Set facade corners"
 * to become MANDATORY.
 *
 * The honest form of mandatory is ASKED FOR EVERY TIME, NEVER ASSUMED, and that is
 * what is asserted here — BEHAVIOURALLY, on a real panel instance measuring a real
 * raster, not by reading the source for a flag. Arms B and C above are source reads
 * and say so; this one runs the thing.
 */
describe('§FACADE-CORNERS-ARE-ASKED-FOR · ARM D — the plane is asked for, not assumed', () => {
    const load = async (): Promise<{
        panel: import('../FacadeReconstructionPanel').FacadeReconstructionPanel;
        image: import('@pryzm/facade-reconstruction').RasterImage;
    }> => {
        const [{ FacadeReconstructionPanel }, { caseA }] = await Promise.all([
            import('../FacadeReconstructionPanel'),
            import('@pryzm/facade-reconstruction/testing'),
        ]);
        const image = caseA().image;
        return { panel: new FacadeReconstructionPanel(), image };
    };

    it('⛔ a freshly loaded photograph gets NO detected plane and NO claimed confidence', async () => {
        const { panel, image } = await load();
        await panel.loadImage({ image, scale: 1, sourceWidth: image.width, sourceHeight: image.height });
        const d = panel.diagnostics;
        const ir = panel.ir;
        expect(d).not.toBeNull();
        expect(ir).not.toBeNull();
        expect(d!.facadeQuad.status).toBe('needs-user');
        expect(d!.facadeQuad.quad).toBeNull();
        expect(d!.facadeQuad.confidence).toBeNull();
        // C108 §4.3 propagation: unknown in ⇒ unknown out, at every node.
        expect(ir!.facade.confidence).toBeNull();
        expect(ir!.facade.periodicity.confidence).toBeNull();
        expect(ir!.facade.zones.flatMap((z) => z.cells).filter((c) => c.confidence !== null).length).toBe(0);
        panel.close();
    }, 120_000);

    it('⭐ four supplied corners score 1.00 and rectify, where detection was never run', async () => {
        const { panel, image } = await load();
        await panel.loadImage({ image, scale: 1, sourceWidth: image.width, sourceHeight: image.height });
        // The corners of the facade the generator DREW, in cropped-frame pixels.
        await panel.setFacadeQuad([
            { x: 40, y: 30 },
            { x: 440, y: 30 },
            { x: 440, y: 330 },
            { x: 40, y: 330 },
        ]);
        const d = panel.diagnostics!;
        expect(d.facadeQuad.status).toBe('user-supplied');
        expect(d.facadeQuad.confidence).toBe(1);
        expect(d.rectified.image).not.toBeNull();
        // And the structure the drawn grid actually has: 5 bays x 4 storeys.
        expect(panel.ir!.facade.zones.length).toBe(4);
        expect(panel.ir!.facade.zones[0]!.cells.length).toBe(5);
        panel.close();
    }, 120_000);

    it('⛔ CLEARING the corners returns to ASKING — it is not a back door into guessing', async () => {
        const { panel, image } = await load();
        await panel.loadImage({ image, scale: 1, sourceWidth: image.width, sourceHeight: image.height });
        await panel.setFacadeQuad([
            { x: 40, y: 30 },
            { x: 440, y: 30 },
            { x: 440, y: 330 },
            { x: 40, y: 330 },
        ]);
        expect(panel.diagnostics!.facadeQuad.status).toBe('user-supplied');
        await panel.setFacadeQuad(null);
        expect(panel.diagnostics!.facadeQuad.status).toBe('needs-user');
        expect(panel.diagnostics!.facadeQuad.confidence).toBeNull();
        panel.close();
    }, 120_000);

    it('offers detection as a LABELLED shortcut whose cost is written on it', async () => {
        const { panel, image } = await load();
        await panel.loadImage({ image, scale: 1, sourceWidth: image.width, sourceHeight: image.height });
        const labels = [...panel.element.querySelectorAll('button')].map((b) => b.textContent ?? '');
        expect(labels).toContain('Set facade corners');
        expect(labels).toContain('Detect the plane automatically instead');
        panel.close();
    }, 120_000);
});
