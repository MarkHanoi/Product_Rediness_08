/**
 * CW4 — CURTAIN WALL "BY SLAB", driven through the surfaces the founder touches.
 *
 * Founder, 2026-08-19: *"I want to create HANDRAILS + CURTAIN WALLS + WALLS 'BY SLAB'.
 * Wall works. Curtain wall does NOT. The workflow is: select the slab FIRST, then
 * activate the tool."*
 *
 * ⛔ WHY THIS FILE DRIVES THE DOM AND NOT `createFromSelectedSlab()` DIRECTLY.
 * Lane HR2 found the railing's By-Slab test PASSING WHILE THE FEATURE WAS DEAD: it
 * stubbed `window.selectionManager` and clicked, which made an UNSATISFIABLE condition
 * satisfiable in the one place in the universe where it held. So every arm below
 * starts at `tool.activate(...)`, then executes **the statement `ToolManager` runs one
 * line later** — `selectionManager.setEnabled(false)`, which calls `unselectAll()`
 * (`packages/input-host/src/SelectionManager.ts:927-930`) — and only then reaches the
 * By-Slab affordance through a real `click()` on the rendered button or a real
 * `KeyboardEvent` on `window`. If the ordering hazard returns, these go red.
 *
 * WHAT IS REAL HERE: `CurtainWallTool` (the unit under test), its mode bar's DOM and
 * key handler, `CurtainWallStore`, and the command class that gets constructed.
 * WHAT IS A DOUBLE: the renderer `world`, the `commandManager` sink, and a
 * `selectionManager` whose ONLY modelled behaviour is the `setEnabled(false)` →
 * `selectedObject = null` rule cited above — i.e. the double supplies the hazard, it
 * does not supply the cure.
 *
 * Contracts: C87 §13 (curtain-wall to-be), C84 EI-4a (one flow, not three copies),
 * C84 EI-8 (one concept, one spelling — the `S` accelerator), C16 CA-18 (a refusal
 * names the mechanism), C84 EI-6 (never silently do nothing).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CurtainWallTool, CurtainWallStore } from '@pryzm/geometry-curtain-wall';
import { CreateCurtainWallsFromSlabCommand } from '../src/curtainwall/CreateCurtainWallsFromSlabCommand';

// ── The renderer collaborator, stubbed. Not the subject of any assertion. ──────
function makeWorld() {
    const canvas = document.createElement('canvas');
    return {
        scene:    { three: {} },
        camera:   { controls: { enabled: true } },
        renderer: { three: { domElement: canvas } },
    } as any;
}

/**
 * A `selectionManager` double that models ONE real behaviour and no others:
 * `setEnabled(false)` → `unselectAll()` → `selectedObject === null`
 * (`SelectionManager.ts:927-930`). That rule is the whole defect — it is supplied so
 * the test can reproduce it, never bypassed so the test can avoid it.
 */
function makeSelectionManager(initiallySelected: unknown = null) {
    return {
        selectedObject: initiallySelected,
        enabled: true,
        setEnabled(enabled: boolean) {
            this.enabled = enabled;
            if (!enabled) this.selectedObject = null;   // unselectAll()
        },
    };
}

function slabMesh(id: string, elementType = 'Slab') {
    return { userData: { id, elementType } };
}

interface Harness {
    tool: CurtainWallTool;
    selectionManager: ReturnType<typeof makeSelectionManager>;
    executed: any[];
    asks: Array<{ message: string; onSlab: (slabId: string) => void }>;
    alerts: string[];
}

/**
 * Every tool built by a test, so `afterEach` can end its session.
 *
 * ⚠ NOT HOUSEKEEPING — it is load-bearing, and finding out why is worth recording.
 * The mode bar's key handler lives on `window` and calls `stopImmediatePropagation()`
 * when it claims a key. A tool left active by a previous test therefore SWALLOWS the
 * next test's keypress before the tool under test ever sees it, and three keyboard
 * arms failed with the product working perfectly. A leaked listener is a real leak:
 * `deactivate()` is what a finished session runs, so the test runs it too.
 */
let _liveTools: CurtainWallTool[] = [];

/**
 * Build the tool and run **the real activation ordering**:
 *   1. `activate(mode)`                          ← ToolManager: `await activateFn()`
 *   2. `selectionManager.setEnabled(false)`      ← ToolManager: the very next statement
 * (`packages/input-host/src/ToolManager.ts:547-552`).
 */
function activateAsToolManagerDoes(opts: {
    preSelected?: unknown;
    withRequester?: boolean;
    mode?: 'SINGLE' | 'POLYLINE' | 'ORTHO' | 'CURVED';
}): Harness {
    const executed: any[] = [];
    const asks: Harness['asks'] = [];
    const alerts: string[] = [];

    (globalThis as any).alert = (msg: string) => { alerts.push(msg); };

    const selectionManager = makeSelectionManager(opts.preSelected ?? null);

    const tool = new CurtainWallTool(
        makeWorld(),
        {} as any,
        {
            curtainWallStore: new CurtainWallStore(),
            selectionManager,
            commandManager: { execute: (cmd: any) => { executed.push(cmd); } },
        } as any,
    );

    if (opts.withRequester !== false) {
        // The app's ONE pick-a-slab flow, as `ToolsAreaLayout` injects it. Recorded
        // rather than executed: the overlay is the app's, the contract is the shape.
        tool.setSlabPickRequester((message, onSlab) => { asks.push({ message, onSlab }); });
    }

    _liveTools.push(tool);
    tool.activate(opts.mode ?? 'SINGLE');
    selectionManager.setEnabled(false);

    return { tool, selectionManager, executed, asks, alerts };
}

/** The By-Slab button the founder clicks, found the way the DOM exposes it. */
function bySlabButton(): HTMLElement {
    const btn = document.querySelector<HTMLElement>('#cw-mode-bar .wdh-btn--slab');
    if (!btn) throw new Error('By Slab button is not on the curtain-wall mode bar');
    return btn;
}

function pressKey(key: string): void {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

function activeModeOnBar(): string | undefined {
    return document.querySelector<HTMLElement>('#cw-mode-bar .wdh-btn--active')?.dataset.cwMode;
}

describe('CW4 — curtain wall BY SLAB (C87 §13, L-1074 + L-1165 + L-1161)', () => {
    beforeEach(() => {
        _liveTools = [];
        document.body.innerHTML = '';
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        for (const t of _liveTools) { try { t.deactivate(); } catch { /* already ended */ } }
        _liveTools = [];
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    // ── G1 — the founder's stated workflow ────────────────────────────────────
    it('select the slab FIRST, then activate the tool: the pick survives ToolManager erasing the selection', () => {
        const h = activateAsToolManagerDoes({ preSelected: slabMesh('slab-1') });

        // The precondition that made this unsatisfiable is present, not avoided:
        expect(h.selectionManager.selectedObject).toBeNull();

        bySlabButton().click();

        expect(h.executed).toHaveLength(1);
        expect(h.executed[0]).toBeInstanceOf(CreateCurtainWallsFromSlabCommand);
        expect((h.executed[0] as any).payload.slabId).toBe('slab-1');
        expect(h.alerts).toEqual([]);
        expect(h.asks).toHaveLength(0);   // it already knew; it must not ask
    });

    it("accepts SlabFragmentBuilder's capital-S 'Slab' elementType (C15 §12)", () => {
        const h = activateAsToolManagerDoes({ preSelected: slabMesh('slab-2', 'Slab') });
        bySlabButton().click();
        expect((h.executed[0] as any).payload.slabId).toBe('slab-2');
    });

    // ── G2 — no pre-selection: ASK, do not merely refuse ──────────────────────
    it('no pre-selection: it ASKS for a slab instead of refusing, and creates from the slab that comes back', () => {
        const h = activateAsToolManagerDoes({ preSelected: null });

        bySlabButton().click();

        // ⭐ THE ARM THAT WAS RED BEFORE L-1165: the tool alerted and dispatched
        // nothing, while the wall — same bar, same gesture — asked.
        expect(h.asks).toHaveLength(1);
        expect(h.asks[0].message).toMatch(/slab/i);
        expect(h.alerts).toEqual([]);
        expect(h.executed).toHaveLength(0);   // nothing is created before the answer

        h.asks[0].onSlab('slab-picked-in-scene');

        expect(h.executed).toHaveLength(1);
        expect((h.executed[0] as any).payload.slabId).toBe('slab-picked-in-scene');
    });

    it('a CANCELLED pick creates nothing — it does not fall back to a stale slab', () => {
        const h = activateAsToolManagerDoes({ preSelected: null });
        bySlabButton().click();
        expect(h.asks).toHaveLength(1);
        // The user pressed ESC: the callback is never invoked.
        expect(h.executed).toHaveLength(0);
        expect(h.alerts).toEqual([]);
    });

    it('a non-slab selection is not treated as a slab — it asks', () => {
        const h = activateAsToolManagerDoes({ preSelected: { userData: { id: 'wall-9', elementType: 'wall' } } });
        bySlabButton().click();
        expect(h.executed).toHaveLength(0);
        expect(h.asks).toHaveLength(1);
    });

    // ── The refusal, watched FIRING (C87 §13.12's red-first rule) ─────────────
    it('with NO pick flow injected it still REFUSES BY NAME rather than doing nothing silently', () => {
        const h = activateAsToolManagerDoes({ preSelected: null, withRequester: false });

        bySlabButton().click();

        expect(h.executed).toHaveLength(0);
        expect(h.alerts).toHaveLength(1);
        // C16 CA-18 — the refusal names the mechanism and the live alternative.
        expect(h.alerts[0]).toMatch(/BY SLAB/);
        expect(h.alerts[0]).toMatch(/Nothing was created/);
    });

    // ── L-1161 — one concept, one spelling: S is By Slab across the family ────
    it('S reaches By Slab from a pre-selected slab (it used to mean "Single")', () => {
        const h = activateAsToolManagerDoes({ preSelected: slabMesh('slab-3'), mode: 'POLYLINE' });
        expect(activeModeOnBar()).toBe('POLYLINE');

        pressKey('s');

        // Before L-1161 this switched the bar to SINGLE and dispatched nothing —
        // which is "the button did nothing" wearing a mode change.
        expect(h.executed).toHaveLength(1);
        expect((h.executed[0] as any).payload.slabId).toBe('slab-3');
        // The bar is gone because By Slab is fire-and-done (§FIX-NAV-UNLOCK
        // deactivates so camera controls come back), which is why "the mode did not
        // change" is asserted in the arm below instead of here.
        expect(activeModeOnBar()).toBeUndefined();
    });

    it('S does NOT switch the drawing mode — the collision it used to have with "Single"', () => {
        const h = activateAsToolManagerDoes({ preSelected: null, mode: 'POLYLINE' });
        expect(activeModeOnBar()).toBe('POLYLINE');

        pressKey('s');

        expect(h.asks).toHaveLength(1);          // By Slab ran…
        expect(activeModeOnBar()).toBe('POLYLINE'); // …and the mode is untouched
    });

    it('the bar advertises S, matching WallDrawingHUD (C84 EI-8)', () => {
        activateAsToolManagerDoes({ preSelected: null });
        expect(bySlabButton().querySelector('.wdh-key')?.textContent).toBe('S');
    });

    it('B stays live as a deprecated alias so anyone who learned it is not punished', () => {
        const h = activateAsToolManagerDoes({ preSelected: slabMesh('slab-4') });
        pressKey('b');
        expect(h.executed).toHaveLength(1);
        expect((h.executed[0] as any).payload.slabId).toBe('slab-4');
    });

    it('1 still selects Single, so no drawing mode was lost to the re-keying', () => {
        const h = activateAsToolManagerDoes({ preSelected: null, mode: 'POLYLINE' });
        pressKey('1');
        expect(activeModeOnBar()).toBe('SINGLE');
        expect(h.executed).toHaveLength(0);
        expect(h.asks).toHaveLength(0);
    });
});
