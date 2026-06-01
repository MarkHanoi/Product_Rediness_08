// wave-6-b-d2: Real binding test — LayerLockPanel
//
// Contract: show() calls activatePanel with 'layer-lock-panel'; hide() calls
// deactivatePanel.  Both transitions are idempotent (the slot is idempotent).
//
// Docs: docs/archive/pryzm3-internal/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import { LayerLockPanel, LAYER_LOCK_PANEL_ID } from '../../LayerLockPanel.js';
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
    return { viewRegistry } as unknown as PryzmRuntime;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LayerLockPanel — wave-6-b-d2 binding contract', () => {
    it('has the correct static LAYER_LOCK_PANEL_ID constant', () => {
        expect(LAYER_LOCK_PANEL_ID).toBe('layer-lock-panel');
    });

    it('constructs without throwing', () => {
        expect(() => new LayerLockPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const panel = new LayerLockPanel(makeRuntime());
        expect(panel.element).toBeInstanceOf(HTMLElement);
    });

    // ── show() — mount binding ────────────────────────────────────────────────

    it('show() calls activatePanel with panel-id "layer-lock-panel"', () => {
        const runtime = makeRuntime();
        const panel = new LayerLockPanel(runtime);
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'layer-lock-panel',
            expect.objectContaining({ label: 'Layer Lock Panel' }),
        );
    });

    it('show() makes the element visible', () => {
        const panel = new LayerLockPanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    // ── hide() — unmount binding ──────────────────────────────────────────────

    it('hide() calls deactivatePanel with panel-id "layer-lock-panel"', () => {
        const runtime = makeRuntime();
        const panel = new LayerLockPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('layer-lock-panel');
    });

    it('hide() hides the element', () => {
        const panel = new LayerLockPanel(makeRuntime());
        panel.show();
        panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    // ── show() / hide() symmetry ──────────────────────────────────────────────

    it('show() then hide() produces exactly one activate and one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new LayerLockPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('operates without runtime — no throw (logs a warning)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new LayerLockPanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warnSpy.mockRestore();
    });

    // ── DOM content ───────────────────────────────────────────────────────────

    it('renders layer rows inside the body', () => {
        const panel = new LayerLockPanel(makeRuntime());
        panel.show();
        const rows = panel.element.querySelectorAll('.llp-row');
        expect(rows.length).toBeGreaterThan(0);
    });

    it('has a close button that calls hide()', () => {
        const runtime = makeRuntime();
        const panel = new LayerLockPanel(runtime);
        panel.show();
        const closeBtn = panel.element.querySelector('.llp-close-btn') as HTMLButtonElement;
        expect(closeBtn).not.toBeNull();
        closeBtn.click();
        expect(panel.element.style.display).toBe('none');
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('layer-lock-panel');
    });
});
