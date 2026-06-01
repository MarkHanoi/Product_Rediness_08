// wave-6-b-d2: Real binding test — DimensionStylePanel
//
// Contract: show() calls activatePanel('dimension-style-panel', …);
// hide() calls deactivatePanel('dimension-style-panel').
//
// Docs: docs/archive/pryzm3-internal/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import { DimensionStylePanel, DIMENSION_STYLE_PANEL_ID } from '../../DimensionStylePanel.js';
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

describe('DimensionStylePanel — wave-6-b-d2 binding contract', () => {
    it('has the correct DIMENSION_STYLE_PANEL_ID constant', () => {
        expect(DIMENSION_STYLE_PANEL_ID).toBe('dimension-style-panel');
    });

    it('constructs without throwing', () => {
        expect(() => new DimensionStylePanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const panel = new DimensionStylePanel(makeRuntime());
        expect(panel.element).toBeInstanceOf(HTMLElement);
    });

    // ── show() — mount binding ────────────────────────────────────────────────

    it('show() calls activatePanel with panel-id "dimension-style-panel"', () => {
        const runtime = makeRuntime();
        const panel = new DimensionStylePanel(runtime);
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'dimension-style-panel',
            expect.objectContaining({ label: 'Dimension Style Panel' }),
        );
    });

    it('show() makes the element visible', () => {
        const panel = new DimensionStylePanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    // ── hide() — unmount binding ──────────────────────────────────────────────

    it('hide() calls deactivatePanel with "dimension-style-panel"', () => {
        const runtime = makeRuntime();
        const panel = new DimensionStylePanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('dimension-style-panel');
    });

    it('hide() hides the element', () => {
        const panel = new DimensionStylePanel(makeRuntime());
        panel.show();
        panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    // ── show() / hide() symmetry ──────────────────────────────────────────────

    it('show() then hide() produces exactly one activate and one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new DimensionStylePanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('operates without runtime — no throw (logs a warning)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new DimensionStylePanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warnSpy.mockRestore();
    });

    // ── Style API ─────────────────────────────────────────────────────────────

    it('getStyle() returns a copy of the default style', () => {
        const panel = new DimensionStylePanel(makeRuntime());
        const style = panel.getStyle();
        expect(style.textHeight).toBe(2.5);
        expect(style.arrowType).toBe('filled');
        expect(style.unitFormat).toBe('mm');
    });

    it('setStyle() updates the style and syncs the form', () => {
        const panel = new DimensionStylePanel(makeRuntime());
        panel.setStyle({ textHeight: 5.0, unitFormat: 'cm' });
        const style = panel.getStyle();
        expect(style.textHeight).toBe(5.0);
        expect(style.unitFormat).toBe('cm');
    });

    // ── DOM structure ─────────────────────────────────────────────────────────

    it('renders an apply button', () => {
        const panel = new DimensionStylePanel(makeRuntime());
        const applyBtn = panel.element.querySelector('.dsp-apply-btn');
        expect(applyBtn).not.toBeNull();
    });

    it('close button calls hide()', () => {
        const runtime = makeRuntime();
        const panel = new DimensionStylePanel(runtime);
        panel.show();
        const closeBtn = panel.element.querySelector('.dsp-close-btn') as HTMLButtonElement;
        closeBtn.click();
        expect(panel.element.style.display).toBe('none');
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('dimension-style-panel');
    });
});
