// wave-6-b-d7: Real binding test — FamilyPropertiesPanel
//
// Contract: when FamilyPropertiesPanel.show() is called the runtime learns the
// panel is visible (activatePanel with label 'Family Properties'), and when
// hide() is called it learns the panel is gone (deactivatePanel).
//
// Docs: docs/03_PRYZM3/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import {
    FamilyPropertiesPanel,
    FAMILY_PROPERTIES_PANEL_ID,
    BUILT_IN_PARAM_DEFS,
} from '../../FamilyPropertiesPanel.js';
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

describe('FamilyPropertiesPanel — wave-6-b-d7 binding contract', () => {
    it('has the correct FAMILY_PROPERTIES_PANEL_ID constant', () => {
        expect(FAMILY_PROPERTIES_PANEL_ID).toBe('family-properties-panel');
    });

    it('exports at least 4 built-in parameter definitions', () => {
        expect(BUILT_IN_PARAM_DEFS.length).toBeGreaterThanOrEqual(4);
    });

    it('constructs without throwing (happy-dom DOM available)', () => {
        expect(() => new FamilyPropertiesPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const panel = new FamilyPropertiesPanel(makeRuntime());
        expect(panel.element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="complementary"', () => {
        const panel = new FamilyPropertiesPanel(makeRuntime());
        expect(panel.element.getAttribute('role')).toBe('complementary');
    });

    // ── show() — mount binding ────────────────────────────────────────────────

    it('show() calls activatePanel with panel-id "family-properties-panel"', () => {
        const runtime = makeRuntime();
        const panel = new FamilyPropertiesPanel(runtime);
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'family-properties-panel',
            expect.objectContaining({ label: 'Family Properties' }),
        );
    });

    it('show() makes the element visible', () => {
        const panel = new FamilyPropertiesPanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    it('show(familyId, typeId) passes ids in the PanelViewSpec', () => {
        const runtime = makeRuntime();
        const panel = new FamilyPropertiesPanel(runtime);
        panel.show('wall-basic', 'w200');
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'family-properties-panel',
            expect.objectContaining({ familyId: 'wall-basic', typeId: 'w200' }),
        );
    });

    // ── hide() — unmount binding ──────────────────────────────────────────────

    it('hide() calls deactivatePanel with panel-id "family-properties-panel"', () => {
        const runtime = makeRuntime();
        const panel = new FamilyPropertiesPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('family-properties-panel');
    });

    it('hide() hides the element', () => {
        const panel = new FamilyPropertiesPanel(makeRuntime());
        panel.show();
        panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    // ── show/hide symmetry ────────────────────────────────────────────────────

    it('show() then hide() produces exactly one activate and one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new FamilyPropertiesPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    // ── DOM content ───────────────────────────────────────────────────────────

    it('renders a param row for every BUILT_IN_PARAM_DEFS entry', () => {
        const panel = new FamilyPropertiesPanel(makeRuntime());
        const rows = panel.element.querySelectorAll('[data-param-id]');
        expect(rows.length).toBe(BUILT_IN_PARAM_DEFS.length);
    });

    it('renders an input element for each param', () => {
        const panel = new FamilyPropertiesPanel(makeRuntime());
        const inputs = panel.element.querySelectorAll('[data-param-input]');
        expect(inputs.length).toBe(BUILT_IN_PARAM_DEFS.length);
    });

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new FamilyPropertiesPanel(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('show()/hide() without runtime — no throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new FamilyPropertiesPanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warnSpy.mockRestore();
    });
});
