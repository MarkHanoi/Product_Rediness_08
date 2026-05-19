// wave-6-b-d1: Real binding test — LayerPanel
//
// Contract: when LayerPanel.show() is called the runtime learns the panel is
// visible (activatePanel), and when hide() is called it learns the panel is
// gone (deactivatePanel).  Both transitions are idempotent.
//
// Docs: docs/03_PRYZM3/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import { LayerPanel, LAYER_PANEL_ID } from '../../LayerPanel.js';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeViewRegistryMock() {
    return {
        activeViewId: null,
        activate: vi.fn(),
        list: vi.fn(() => []),
        subscribe: vi.fn(() => ({ dispose: vi.fn() })),
        activatePanel: vi.fn(),
        deactivatePanel: vi.fn(),
        getActivePanelIds: vi.fn(() => new Set<string>()),
        subscribePanelChange: vi.fn(() => ({ dispose: vi.fn() })),
    };
}

function makeRuntime() {
    const viewRegistry = makeViewRegistryMock();
    return {
        viewRegistry,
        // remaining slots not exercised by LayerPanel in wave-6-b-d1
    } as unknown as PryzmRuntime;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LayerPanel — wave-6-b-d1 binding contract', () => {
    it('has the correct static LAYER_PANEL_ID constant', () => {
        expect(LAYER_PANEL_ID).toBe('layer-panel');
    });

    it('constructs without throwing (happy-dom DOM available)', () => {
        const runtime = makeRuntime();
        expect(() => new LayerPanel(runtime)).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const panel = new LayerPanel(makeRuntime());
        expect(panel.element).toBeInstanceOf(HTMLElement);
    });

    // ── show() — mount binding ────────────────────────────────────────────────

    it('show() calls activatePanel with panel-id "layer-panel"', () => {
        const runtime = makeRuntime();
        const panel = new LayerPanel(runtime);
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'layer-panel',
            expect.objectContaining({ label: 'Layer Panel' }),
        );
    });

    it('show() makes the element visible', () => {
        const panel = new LayerPanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    // ── hide() — unmount binding ──────────────────────────────────────────────

    it('hide() calls deactivatePanel with panel-id "layer-panel"', () => {
        const runtime = makeRuntime();
        const panel = new LayerPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('layer-panel');
    });

    it('hide() hides the element', () => {
        const panel = new LayerPanel(makeRuntime());
        panel.show();
        panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    // ── idempotency ───────────────────────────────────────────────────────────

    it('show() → show() calls activatePanel twice (idempotency is on the slot, not the panel)', () => {
        // The ViewRegistrySlot.activatePanel() itself is idempotent.
        // LayerPanel just calls it; it does not guard against double calls.
        const runtime = makeRuntime();
        const panel = new LayerPanel(runtime);
        panel.show();
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledTimes(2);
    });

    it('operates without runtime — no throw (logs a warning)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new LayerPanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warnSpy.mockRestore();
    });

    // ── show() / hide() symmetry ──────────────────────────────────────────────

    it('show() then hide() produces exactly one activate and one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new LayerPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });
});
