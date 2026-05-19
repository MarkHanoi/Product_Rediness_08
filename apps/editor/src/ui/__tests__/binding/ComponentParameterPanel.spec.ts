// wave-6-b-d8: Real binding test — ComponentParameterPanel
//
// Contract: when ComponentParameterPanel.show() is called the runtime learns
// the panel is visible (activatePanel), and when hide() is called it learns
// the panel is gone (deactivatePanel).  Both transitions are idempotent.
//
// Docs: docs/03_PRYZM3/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import {
    ComponentParameterPanel,
    COMPONENT_PARAMETER_PANEL_ID,
    COMPONENT_PARAM_GROUPS,
} from '../../ComponentParameterPanel.js';
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

describe('ComponentParameterPanel — wave-6-b-d8 binding contract', () => {
    it('has the correct COMPONENT_PARAMETER_PANEL_ID constant', () => {
        expect(COMPONENT_PARAMETER_PANEL_ID).toBe('component-parameter-panel');
    });

    it('exports at least 5 parameter groups', () => {
        expect(COMPONENT_PARAM_GROUPS.length).toBeGreaterThanOrEqual(5);
    });

    it('constructs without throwing (happy-dom DOM available)', () => {
        const runtime = makeRuntime();
        expect(() => new ComponentParameterPanel(runtime)).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const panel = new ComponentParameterPanel(makeRuntime());
        expect(panel.element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="complementary"', () => {
        const panel = new ComponentParameterPanel(makeRuntime());
        expect(panel.element.getAttribute('role')).toBe('complementary');
    });

    // ── show() — mount binding ────────────────────────────────────────────────

    it('show() calls activatePanel with panel-id "component-parameter-panel"', () => {
        const runtime = makeRuntime();
        const panel = new ComponentParameterPanel(runtime);
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'component-parameter-panel',
            expect.objectContaining({ label: 'Component Parameters' }),
        );
    });

    it('show(elementId) passes elementId through to activatePanel spec', () => {
        const runtime = makeRuntime();
        const panel = new ComponentParameterPanel(runtime);
        panel.show('wall-abc-123');
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'component-parameter-panel',
            expect.objectContaining({ elementId: 'wall-abc-123' }),
        );
    });

    it('show() makes the element visible', () => {
        const panel = new ComponentParameterPanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    // ── hide() — unmount binding ──────────────────────────────────────────────

    it('hide() calls deactivatePanel with panel-id "component-parameter-panel"', () => {
        const runtime = makeRuntime();
        const panel = new ComponentParameterPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith(
            'component-parameter-panel',
        );
    });

    it('hide() hides the element', () => {
        const panel = new ComponentParameterPanel(makeRuntime());
        panel.show();
        panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    // ── show/hide symmetry ────────────────────────────────────────────────────

    it('show() then hide() produces exactly one activate and one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new ComponentParameterPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    // ── idempotency ───────────────────────────────────────────────────────────

    it('show() → show() calls activatePanel twice (slot owns idempotency)', () => {
        const runtime = makeRuntime();
        const panel = new ComponentParameterPanel(runtime);
        panel.show();
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledTimes(2);
    });

    // ── DOM content ───────────────────────────────────────────────────────────

    it('renders a group row for every COMPONENT_PARAM_GROUPS entry', () => {
        const panel = new ComponentParameterPanel(makeRuntime());
        const rows = panel.element.querySelectorAll('[data-group-id]');
        expect(rows.length).toBe(COMPONENT_PARAM_GROUPS.length);
    });

    it('renders element-bar with "No element selected" when no elementId given', () => {
        const panel = new ComponentParameterPanel(makeRuntime());
        const bar = panel.element.querySelector('[data-cpp-element-bar]');
        expect(bar?.textContent).toContain('No element selected');
    });

    it('element-bar updates after show(elementId)', () => {
        const panel = new ComponentParameterPanel(makeRuntime());
        panel.show('door-guid-99');
        const bar = panel.element.querySelector('[data-cpp-element-bar]');
        expect(bar?.textContent).toContain('door-guid-99');
    });

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new ComponentParameterPanel(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('show()/hide() without runtime — no throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new ComponentParameterPanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warnSpy.mockRestore();
    });
});
