// @vitest-environment happy-dom
//
// §FIX-PLAN-WALLTOOL-ARM-ON-ACTIVATE (L-66) — the plan-view wall tool must arm the
// instant the tool is activated (the "Draw Wall" pre-draw panel is shown), exactly
// like the 3D tool which arms synchronously in WallTool.activate(). The wall-type
// dropdown "Apply" is a change-type affordance ONLY — it must never be the thing that
// first arms drawing.
//
// L-28 already made WallPlanToolHandler arm on activate() and the panel pre-apply the
// default (Plain Wall) type (locked by PlanWallToolDefaultActive.test.ts). The residual
// L-66 gate was that arming depended on the ASYNC ToolManager.activateWall → notify →
// subscribe → _activateHandler chain (and the pane not being paused) completing before
// the user's first click; until it had, PlanViewToolOverlay._onMouseDownCapture dropped
// the click (`!this._activeHandler`), so users pressed "Apply" first. This suite locks
// the fix: the panel asserts a "panel visible ⟺ handler armed" invariant via
// PlanViewToolOverlay.ensureWallDrawArmed(), with NO Apply click.
//
// Scope: PlanViewToolOverlay.ensureWallDrawArmed() arming decision + the panel wiring
// that calls it. Does NOT touch wall geometry / join files (sole-wall lane).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PlanViewToolOverlay } from '../src/engine/views/PlanViewToolOverlay';
import { showWallPreDraw, type PreDrawPanelHost } from '../src/ui/property-panel/PropertyPanelPreDraw';

// ── Part A: ensureWallDrawArmed() arming decision ───────────────────────────────
describe('§FIX-PLAN-WALLTOOL-ARM-ON-ACTIVATE (L-66) — PlanViewToolOverlay.ensureWallDrawArmed', () => {
    function makeOverlay() {
        const ov = new PlanViewToolOverlay() as unknown as {
            _active: boolean;
            _paused: boolean;
            _activeTool: string;
            _activeHandler: unknown;
            _activateHandler: (tool: string) => void;
            ensureWallDrawArmed: () => void;
        };
        // Stub the real handler activation (needs a live canvas ctx we don't have in
        // happy-dom) so we test the arming DECISION in isolation. The stub simulates a
        // successful activation by setting _activeHandler, matching the live contract.
        const activateSpy = vi.fn((tool: string) => { ov._activeHandler = { __tool: tool }; });
        ov._activateHandler = activateSpy as never;
        return { ov, activateSpy };
    }

    it('arms the wall handler on activate — first click can draw with NO prior Apply', () => {
        const { ov, activateSpy } = makeOverlay();
        ov._active = true;
        ov._paused = false;
        ov._activeTool = 'none';
        ov._activeHandler = null;

        ov.ensureWallDrawArmed();

        expect(ov._activeTool).toBe('wall');
        expect(activateSpy).toHaveBeenCalledTimes(1);
        expect(activateSpy).toHaveBeenCalledWith('wall');
        expect(ov._activeHandler).not.toBeNull();
    });

    it('is idempotent — does NOT re-activate an already-armed wall handler', () => {
        const { ov, activateSpy } = makeOverlay();
        ov._active = true;
        ov._paused = false;
        ov._activeTool = 'wall';
        ov._activeHandler = { __tool: 'wall' }; // already armed (e.g. subscribe path won the race)

        ov.ensureWallDrawArmed();

        expect(activateSpy).not.toHaveBeenCalled();
    });

    it('no-ops when the pane is paused (split-view pane owns focus)', () => {
        const { ov, activateSpy } = makeOverlay();
        ov._active = true;
        ov._paused = true;          // SVP pane has focus — must not double-arm
        ov._activeTool = 'none';
        ov._activeHandler = null;

        ov.ensureWallDrawArmed();

        expect(activateSpy).not.toHaveBeenCalled();
        expect(ov._activeHandler).toBeNull();
    });

    it('no-ops when the overlay is not attached', () => {
        const { ov, activateSpy } = makeOverlay();
        ov._active = false;         // detached
        ov._paused = false;
        ov._activeTool = 'none';
        ov._activeHandler = null;

        ov.ensureWallDrawArmed();

        expect(activateSpy).not.toHaveBeenCalled();
    });
});

// ── Part B: the wall pre-draw panel arms on show (Apply not required) ────────────
describe('§FIX-PLAN-WALLTOOL-ARM-ON-ACTIVATE (L-66) — showWallPreDraw arms on show', () => {
    let ensureWallDrawArmed: ReturnType<typeof vi.fn>;
    let svpEnsure: ReturnType<typeof vi.fn>;

    function makeHost(): PreDrawPanelHost {
        const element = document.createElement('div');
        return {
            element,
            clearForPreDraw: () => { element.innerHTML = ''; },
            buildCloseBtn: () => document.createElement('button'),
            makeVisible: () => {},
            positionBesideModeBar: () => {},
        } as unknown as PreDrawPanelHost;
    }

    beforeEach(() => {
        ensureWallDrawArmed = vi.fn();
        svpEnsure = vi.fn();
        (window as any).planViewToolOverlay = { ensureWallDrawArmed };
        (window as any).svpPlanToolOverlay = { ensureWallDrawArmed: svpEnsure };
        // Canonical wall tool with the default (undefined ⇒ Plain Wall) system type.
        (window as any).wallTool = {
            _id: undefined as string | undefined,
            getSystemTypeId() { return this._id; },
            setSystemTypeId(id: string | undefined) { this._id = id; },
        };
    });

    afterEach(() => {
        delete (window as any).planViewToolOverlay;
        delete (window as any).svpPlanToolOverlay;
        delete (window as any).wallTool;
        delete (window as any).wallSystemTypeStore;
        vi.restoreAllMocks();
    });

    it('shows the panel AND arms the plan draw handler — no Apply click needed', () => {
        showWallPreDraw(makeHost(), (window as any).wallTool);

        // Panel visible ⟺ handler armed: the left-panel plan overlay was armed on show.
        expect(ensureWallDrawArmed).toHaveBeenCalledTimes(1);
        // Split-view pane parity — asserted too (idempotent no-op when unfocused live).
        expect(svpEnsure).toHaveBeenCalledTimes(1);
    });
});
