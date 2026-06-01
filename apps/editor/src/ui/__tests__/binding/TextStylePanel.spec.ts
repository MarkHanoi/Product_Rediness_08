// wave-6-b-d2: Real binding test — TextStylePanel
//
// Contract: show() calls activatePanel('text-style-panel', …);
// hide() calls deactivatePanel('text-style-panel').
//
// Docs: docs/archive/pryzm3-internal/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import { TextStylePanel, TEXT_STYLE_PANEL_ID } from '../../TextStylePanel.js';
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

describe('TextStylePanel — wave-6-b-d2 binding contract', () => {
    it('has the correct TEXT_STYLE_PANEL_ID constant', () => {
        expect(TEXT_STYLE_PANEL_ID).toBe('text-style-panel');
    });

    it('constructs without throwing', () => {
        expect(() => new TextStylePanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const panel = new TextStylePanel(makeRuntime());
        expect(panel.element).toBeInstanceOf(HTMLElement);
    });

    // ── show() — mount binding ────────────────────────────────────────────────

    it('show() calls activatePanel with panel-id "text-style-panel"', () => {
        const runtime = makeRuntime();
        const panel = new TextStylePanel(runtime);
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'text-style-panel',
            expect.objectContaining({ label: 'Text Style Panel' }),
        );
    });

    it('show() makes the element visible', () => {
        const panel = new TextStylePanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    // ── hide() — unmount binding ──────────────────────────────────────────────

    it('hide() calls deactivatePanel with "text-style-panel"', () => {
        const runtime = makeRuntime();
        const panel = new TextStylePanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('text-style-panel');
    });

    it('hide() hides the element', () => {
        const panel = new TextStylePanel(makeRuntime());
        panel.show();
        panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    // ── show() / hide() symmetry ──────────────────────────────────────────────

    it('show() then hide() produces exactly one activate and one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new TextStylePanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('operates without runtime — no throw (logs a warning)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new TextStylePanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warnSpy.mockRestore();
    });

    // ── Style API ─────────────────────────────────────────────────────────────

    it('getStyle() returns a copy of the default style', () => {
        const panel = new TextStylePanel(makeRuntime());
        const style = panel.getStyle();
        expect(style.fontFamily).toBe('Arial');
        expect(style.fontSize).toBe(10);
        expect(style.bold).toBe(false);
        expect(style.alignment).toBe('left');
        expect(style.lineSpacing).toBe(1.15);
    });

    it('setStyle() updates specific fields', () => {
        const panel = new TextStylePanel(makeRuntime());
        panel.setStyle({ fontFamily: 'Georgia', fontSize: 14, bold: true });
        const style = panel.getStyle();
        expect(style.fontFamily).toBe('Georgia');
        expect(style.fontSize).toBe(14);
        expect(style.bold).toBe(true);
        // unchanged fields remain at defaults
        expect(style.alignment).toBe('left');
    });

    // ── DOM structure ─────────────────────────────────────────────────────────

    it('renders Bold/Italic/Underline toggle buttons', () => {
        const panel = new TextStylePanel(makeRuntime());
        const boldBtn = panel.element.querySelector('[data-tsp-toggle="bold"]');
        const italicBtn = panel.element.querySelector('[data-tsp-toggle="italic"]');
        const underlineBtn = panel.element.querySelector('[data-tsp-toggle="underline"]');
        expect(boldBtn).not.toBeNull();
        expect(italicBtn).not.toBeNull();
        expect(underlineBtn).not.toBeNull();
    });

    it('close button calls hide()', () => {
        const runtime = makeRuntime();
        const panel = new TextStylePanel(runtime);
        panel.show();
        const closeBtn = panel.element.querySelector('.tsp-close-btn') as HTMLButtonElement;
        closeBtn.click();
        expect(panel.element.style.display).toBe('none');
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('text-style-panel');
    });
});
