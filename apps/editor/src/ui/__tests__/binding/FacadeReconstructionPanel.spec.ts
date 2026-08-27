// C108 / SPEC-FACADE-RECONSTRUCTION-PIPELINE §4 — the PANEL leg of Milestone 1,
// asserted against the REAL engine rather than a fake.
//
// ── WHAT THIS FILE IS FOR ────────────────────────────────────────────────────
// The engine landed with 30 corpus cases green and no caller. That is the
// [[authored-but-unwired-is-the-bottleneck]] shape, and the defence against
// repeating it in the UI is to assert the two things a compiling panel does not
// prove: that the button EXISTS and OPENS it, and that a real `FacadeIR` reaches
// the readout with its unknowns still readable as unknown.
//
// ⚠ WHAT IT DOES NOT COVER, STATED RATHER THAN IMPLIED. happy-dom returns `null`
// from `canvas.getContext('2d')` and gives the canvas no layout box, so:
//   · the overlay DRAWING MATH is not exercised here — every layer takes its
//     "no 2-D canvas context" branch, which is why the assertion below is that
//     each layer REFUSES WITH A REASON rather than throwing;
//   · `canvasPoint()`'s pointer -> pixel mapping is not exercised either, because
//     `getBoundingClientRect()` is 0x0. The two pick interactions are therefore
//     driven through `setFacadeQuad` / `setReferenceDimension`, which is what the
//     click handlers themselves call.
// The raster-side twins of those overlays ARE proven, by the CLI's PNG output.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { caseA } from '@pryzm/facade-reconstruction/testing';
import type { Quad } from '@pryzm/facade-reconstruction';
import { _resetFrameSchedulerForTest, getFrameScheduler } from '@pryzm/frame-scheduler';

import { FACADE_LAYERS, confidenceCss } from '../../facade/facadeOverlays';
import {
    FacadeReconstructionPanel,
    openFacadeReconstructionPanel,
} from '../../facade/FacadeReconstructionPanel';
import type { DecodedImage } from '../../facade/facadeRaster';

function decodedCaseA(): DecodedImage {
    const image = caseA().image;
    return { image, sourceWidth: image.width, sourceHeight: image.height, scale: 1 };
}

function text(panel: FacadeReconstructionPanel, selector: string): string {
    return Array.from(panel.element.querySelectorAll(selector))
        .map((n) => n.textContent ?? '')
        .join(' | ');
}

describe('FacadeReconstructionPanel — C108 §8 reachability + honesty', () => {
    beforeEach(() => {
        document.body.replaceChildren();
        // §RAF166 — `_run()` now yields a frame via the frame bus
        // (`yieldForProgress`) instead of a raw `requestAnimationFrame`. The bus
        // only ticks once the `FrameScheduler` singleton has been `start()`-ed —
        // by design, `wakeIfStopped()` refuses to spin up an adapter nobody gave
        // it (see `FrameScheduler.ts`). The real app starts it exactly once at
        // bootstrap, long before any panel can open; this spec constructs the
        // panel standalone, so the test must reproduce that one bootstrap step
        // itself or `loadImage()` hangs to the suite's timeout — the migrated
        // call compiles and the P3 gate is green, but the callback silently
        // never fires without this.
        getFrameScheduler().start();
    });

    afterEach(() => {
        _resetFrameSchedulerForTest();
    });

    it('constructs without a runtime and exposes a complementary landmark', () => {
        const panel = new FacadeReconstructionPanel();
        expect(panel.element).toBeInstanceOf(HTMLElement);
        expect(panel.element.getAttribute('role')).toBe('complementary');
        // Milestone 1 ends at the IR: nothing is committed, so nothing is needed.
        expect(panel.ir).toBeNull();
    });

    it('mounts into the document and closes again', () => {
        const panel = openFacadeReconstructionPanel();
        expect(document.body.contains(panel.element)).toBe(true);
        expect(panel.element.classList.contains('frp-hidden')).toBe(false);
        panel.close();
        expect(panel.element.classList.contains('frp-hidden')).toBe(true);
    });

    it('offers every brief §18 overlay layer, by name', () => {
        // ⛔ A SET assertion, not a count. A count stays green while a layer is
        // silently renamed or swapped, which is the failure mode the contract-index
        // gate exists for one directory over.
        const ids = FACADE_LAYERS.map((l) => l.id);
        expect(new Set(ids)).toEqual(
            new Set([
                'crop',
                'edges',
                'quad',
                'rectified',
                'zones',
                'bays',
                'openings',
                'arches',
                'projections',
                'symmetry',
                'periodicity',
                'reconstruction',
                'confidence',
            ]),
        );
        const panel = new FacadeReconstructionPanel();
        expect(panel.element.querySelectorAll('.frp-layerbtn')).toHaveLength(FACADE_LAYERS.length);
    });

    it('runs the REAL engine on a decoded raster and fills the readout', async () => {
        const panel = new FacadeReconstructionPanel();
        await panel.loadImage(decodedCaseA());

        // ── UPDATED 2026-08-25 (L-10973) — LOADING NO LONGER GUESSES A PLANE ──
        // This test used to load a photograph and assert 4 zones x 5 bays straight
        // afterwards, because the panel auto-detected the facade plane on load. It
        // no longer does: the founder measured detection at 0.64 against 1.00 for
        // his own four corners on the same image, and C108 §4.3 makes that 0.64 a
        // CAP on every number the panel shows. The corners are now ASKED FOR on
        // every photograph. ⭐ The assertion is STRENGTHENED rather than relaxed —
        // both states are now pinned, in order.
        expect(panel.diagnostics!.facadeQuad.status).toBe('needs-user');
        expect(panel.ir!.facade.confidence).toBeNull();

        // The four corners of the facade the generator DREW, in cropped-frame pixels.
        await panel.setFacadeQuad([
            { x: 40, y: 30 },
            { x: 440, y: 30 },
            { x: 440, y: 330 },
            { x: 40, y: 330 },
        ]);

        const ir = panel.ir;
        expect(ir).not.toBeNull();
        // Corpus case A draws a 5-bay x 4-storey grid. The panel is reading the
        // engine, not a fixture, so these are the generator's own numbers.
        expect(ir!.facade.zones).toHaveLength(4);
        expect(ir!.facade.zones[0]!.cells).toHaveLength(5);
        expect(ir!.facade.periodicity.repeatX).toBe(5);
        expect(ir!.facade.periodicity.repeatY).toBe(4);

        const readout = text(panel, '.frp-row-label');
        for (const label of ['Facade plane', 'Lattice', 'Openings', 'Periodicity', 'Symmetry', 'Curvature', 'Surface', 'Scale']) {
            expect(readout).toContain(label);
        }
        // The stage notes are the trace of what each stage did AND refused to do.
        expect(panel.element.querySelectorAll('.frp-notes li').length).toBeGreaterThan(0);
    });

    it('shows scale as UNKNOWN until a reference dimension is supplied, then in metres', async () => {
        const panel = new FacadeReconstructionPanel();
        await panel.loadImage(decodedCaseA());

        // ⛔ THE C108 §2.2 INVARIANT, ASSERTED IN THE DOM. Before the user measures
        // anything, scale is unknown and the panel says the word — it does not
        // print a plausible number, and it does not print `0.00`.
        expect(panel.ir!.scale.status).toBe('unknown');
        expect(text(panel, '.frp-row-value')).toContain('UNKNOWN');

        // brief §16 — two points in NORMALIZED facade coordinates, Y up.
        panel.setReferenceDimension({ x: 0, y: 0 }, { x: 0, y: 1 }, 12.5);
        expect(panel.ir!.scale.status).toBe('user-supplied');
        expect(panel.ir!.scale.metersPerUnit).toBeCloseTo(12.5, 6);
        expect(panel.ir!.units).toBe('meters');
        expect(text(panel, '.frp-row-value')).toContain('12.5000 m per normalized unit');
    });

    it('keeps the user reference across a re-run, and lets the user quad win', async () => {
        const panel = new FacadeReconstructionPanel();
        await panel.loadImage(decodedCaseA());
        panel.setReferenceDimension({ x: 0, y: 0 }, { x: 0, y: 1 }, 12.5);

        // The corpus case A facade rect, which is what the four clicks would place.
        const quad = [
            { x: 40, y: 30 },
            { x: 440, y: 30 },
            { x: 440, y: 330 },
            { x: 40, y: 330 },
        ] as unknown as Quad;
        await panel.setFacadeQuad(quad);

        // ⭐ brief §6 — a user-supplied plane is CERTAIN by definition; the engine
        // does not get to second-guess the four corners it was handed.
        expect(panel.ir!.facade.confidence).toBe(1);
        // ⛔ And the metre the user measured SURVIVED the re-run. Silently reverting
        // to normalized units on the next re-measure would lose their only
        // real-world number without saying so.
        expect(panel.ir!.scale.status).toBe('user-supplied');

        await panel.setFacadeQuad(null);
        expect(panel.ir!.facade.confidence).not.toBe(1);
    });

    it('carries the S16 tiling caveat on the surface row — it is UNVERIFIED, not measured', async () => {
        const panel = new FacadeReconstructionPanel();
        await panel.loadImage(decodedCaseA());
        // Neither C108 §6.1 nor SPEC §5 declares ground truth for tile pitch, and on
        // a plain window grid with no tiling S16 returns `grid` at the OPENING
        // LATTICE pitch. The row must not read like a measurement.
        expect(text(panel, '.frp-row-caveat')).toContain('UNVERIFIED');
    });

    it('every layer refuses with a NAMED reason rather than throwing', async () => {
        const panel = new FacadeReconstructionPanel();
        await panel.loadImage(decodedCaseA());
        const canvas = document.createElement('canvas');
        for (const layer of FACADE_LAYERS) {
            const result = layer.draw(canvas, panel.ir!, panel.diagnostics!);
            // happy-dom has no 2-D context, so every layer takes its refusal branch.
            // ⭐ The assertion is that the refusal is NAMED: a blank canvas could
            // equally mean "nothing was found" or "this stage never ran", and those
            // are different answers (C62 §1.1 applied to pictures).
            expect(result.ok).toBe(false);
            expect(result.reason).toBeTruthy();
        }
    });

    it('never colours an unknown confidence like a measured zero', () => {
        // ⛔ `0` is the claim "certain this is wrong". Not knowing is a different
        // answer, and it must not land at the bottom of the same ramp.
        expect(confidenceCss(null)).not.toBe(confidenceCss(0));
        expect(confidenceCss(null)).toContain('154');
        expect(confidenceCss(0)).toContain('224');
    });
});

// ── REACHABILITY (L-11007) ───────────────────────────────────────────────────
//
// ⭐ THE ASSERTION THIS LANE EXISTS FOR. `ClashDetectionPanel` in this same
// directory is referenced by its own binding test AND BY NOTHING ELSE — a panel
// that compiles, is tested, and cannot be opened. The check below is the one that
// would have caught it: build the rail the user actually clicks, find the button,
// click it, and require the panel to be in the document afterwards.
describe('ExportRailPanel — the Import group opens the facade panel', () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    it('renders a "Facade from Photo" button that mounts the panel when clicked', async () => {
        const { ExportRailPanel } = await import('../../tools-panel/panels/ExportRailPanel');
        // ToolsPanelProps is an `any`-heavy interface; the rail's build() path reads
        // none of these fields, so a minimal stub is honest rather than a fake that
        // pretends to be more capable than the real thing.
        const panel = new ExportRailPanel(
            { service: {} } as unknown as ConstructorParameters<typeof ExportRailPanel>[0],
            {} as unknown as ConstructorParameters<typeof ExportRailPanel>[1],
        );
        const root = panel.build();
        document.body.appendChild(root);

        const button = Array.from(root.querySelectorAll('button')).find(
            (b) => b.title === 'Facade from Photo',
        );
        expect(button, 'the Import group must carry a "Facade from Photo" button').toBeDefined();

        expect(document.querySelector('.frp-panel')).toBeNull();
        button!.click();
        expect(document.querySelector('.frp-panel')).not.toBeNull();
    });
});
