// wave-6-b-d7: Real binding test — FamilyPreviewPanel
//
// Contract: when FamilyPreviewPanel.show() is called the runtime learns the
// panel is visible (activatePanel with label 'Family Preview'), and when
// hide() is called it learns the panel is gone (deactivatePanel).
// The optional familyId / typeId arguments are passed through into the
// PanelViewSpec metadata.
//
// Docs: docs/archive/pryzm3-internal/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import {
    FamilyPreviewPanel,
    FAMILY_PREVIEW_PANEL_ID,
} from '../../FamilyPreviewPanel.js';
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

describe('FamilyPreviewPanel — wave-6-b-d7 binding contract', () => {
    it('has the correct FAMILY_PREVIEW_PANEL_ID constant', () => {
        expect(FAMILY_PREVIEW_PANEL_ID).toBe('family-preview-panel');
    });

    it('constructs without throwing (happy-dom DOM available)', () => {
        expect(() => new FamilyPreviewPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const panel = new FamilyPreviewPanel(makeRuntime());
        expect(panel.element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="complementary"', () => {
        const panel = new FamilyPreviewPanel(makeRuntime());
        expect(panel.element.getAttribute('role')).toBe('complementary');
    });

    // ── show() — mount binding ────────────────────────────────────────────────

    it('show() calls activatePanel with panel-id "family-preview-panel"', () => {
        const runtime = makeRuntime();
        const panel = new FamilyPreviewPanel(runtime);
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'family-preview-panel',
            expect.objectContaining({ label: 'Family Preview' }),
        );
    });

    it('show() makes the element visible', () => {
        const panel = new FamilyPreviewPanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    it('show(familyId, typeId) forwards ids in the PanelViewSpec', () => {
        const runtime = makeRuntime();
        const panel = new FamilyPreviewPanel(runtime);
        panel.show('door-single', 'd900');
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'family-preview-panel',
            expect.objectContaining({ familyId: 'door-single', typeId: 'd900' }),
        );
    });

    it('show() includes the current mode in the PanelViewSpec', () => {
        const runtime = makeRuntime();
        const panel = new FamilyPreviewPanel(runtime);
        panel.show();
        const [, spec] = (runtime.viewRegistry.activatePanel as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(['2d', '3d', 'plan', 'elevation']).toContain(spec.mode);
    });

    // ── hide() — unmount binding ──────────────────────────────────────────────

    it('hide() calls deactivatePanel with panel-id "family-preview-panel"', () => {
        const runtime = makeRuntime();
        const panel = new FamilyPreviewPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('family-preview-panel');
    });

    it('hide() hides the element', () => {
        const panel = new FamilyPreviewPanel(makeRuntime());
        panel.show();
        panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    // ── show/hide symmetry ────────────────────────────────────────────────────

    it('show() then hide() produces exactly one activate and one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new FamilyPreviewPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    // ── setMode() ─────────────────────────────────────────────────────────────

    it('setMode() switches the active mode button', () => {
        const panel = new FamilyPreviewPanel(makeRuntime());
        panel.setMode('plan');
        const activeBtn = panel.element.querySelector('[data-active="true"][data-mode]') as HTMLElement | null;
        expect(activeBtn?.getAttribute('data-mode')).toBe('plan');
    });

    it('setMode() deactivates the previously active mode button', () => {
        const panel = new FamilyPreviewPanel(makeRuntime());
        // Default is '3d'
        panel.setMode('2d');
        const threeDBtn = panel.element.querySelector('[data-mode="3d"]') as HTMLElement | null;
        expect(threeDBtn?.getAttribute('data-active')).toBe('false');
    });

    // ── DOM content ───────────────────────────────────────────────────────────

    it('renders 4 mode buttons (3d, 2d, plan, elevation)', () => {
        const panel = new FamilyPreviewPanel(makeRuntime());
        const modeBtns = panel.element.querySelectorAll('[data-mode]');
        expect(modeBtns.length).toBe(4);
    });

    it('renders a canvas area placeholder', () => {
        const panel = new FamilyPreviewPanel(makeRuntime());
        const canvas = panel.element.querySelector('[data-fvp-canvas]');
        expect(canvas).not.toBeNull();
    });

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new FamilyPreviewPanel(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('show()/hide() without runtime — no throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new FamilyPreviewPanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warnSpy.mockRestore();
    });
});
