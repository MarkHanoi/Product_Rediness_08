// wave-6-b-d7: Real binding test — FamilyBrowserPanel
//
// Contract: when FamilyBrowserPanel.show() is called the runtime learns the
// panel is visible (activatePanel), and when hide() is called it learns the
// panel is gone (deactivatePanel).  Both transitions are idempotent.
//
// Docs: docs/03_PRYZM3/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import {
    FamilyBrowserPanel,
    FAMILY_BROWSER_PANEL_ID,
    FAMILY_CATEGORIES,
} from '../../FamilyBrowserPanel.js';
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

describe('FamilyBrowserPanel — wave-6-b-d7 binding contract', () => {
    it('has the correct FAMILY_BROWSER_PANEL_ID constant', () => {
        expect(FAMILY_BROWSER_PANEL_ID).toBe('family-browser-panel');
    });

    it('exports at least 9 family categories', () => {
        expect(FAMILY_CATEGORIES.length).toBeGreaterThanOrEqual(9);
    });

    it('constructs without throwing (happy-dom DOM available)', () => {
        const runtime = makeRuntime();
        expect(() => new FamilyBrowserPanel(runtime)).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const panel = new FamilyBrowserPanel(makeRuntime());
        expect(panel.element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="complementary"', () => {
        const panel = new FamilyBrowserPanel(makeRuntime());
        expect(panel.element.getAttribute('role')).toBe('complementary');
    });

    // ── show() — mount binding ────────────────────────────────────────────────

    it('show() calls activatePanel with panel-id "family-browser-panel"', () => {
        const runtime = makeRuntime();
        const panel = new FamilyBrowserPanel(runtime);
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'family-browser-panel',
            expect.objectContaining({ label: 'Family Browser' }),
        );
    });

    it('show() makes the element visible', () => {
        const panel = new FamilyBrowserPanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    // ── hide() — unmount binding ──────────────────────────────────────────────

    it('hide() calls deactivatePanel with panel-id "family-browser-panel"', () => {
        const runtime = makeRuntime();
        const panel = new FamilyBrowserPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('family-browser-panel');
    });

    it('hide() hides the element', () => {
        const panel = new FamilyBrowserPanel(makeRuntime());
        panel.show();
        panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    // ── show/hide symmetry ────────────────────────────────────────────────────

    it('show() then hide() produces exactly one activate and one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new FamilyBrowserPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    // ── idempotency ───────────────────────────────────────────────────────────

    it('show() → show() calls activatePanel twice (slot owns idempotency)', () => {
        const runtime = makeRuntime();
        const panel = new FamilyBrowserPanel(runtime);
        panel.show();
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledTimes(2);
    });

    // ── DOM content ───────────────────────────────────────────────────────────

    it('renders a category row for every FAMILY_CATEGORIES entry', () => {
        const panel = new FamilyBrowserPanel(makeRuntime());
        const rows = panel.element.querySelectorAll('[data-category-id]');
        expect(rows.length).toBe(FAMILY_CATEGORIES.length);
    });

    it('renders a search input', () => {
        const panel = new FamilyBrowserPanel(makeRuntime());
        const input = panel.element.querySelector('[data-fbp-search]');
        expect(input).not.toBeNull();
    });

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new FamilyBrowserPanel(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('show()/hide() without runtime — no throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new FamilyBrowserPanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warnSpy.mockRestore();
    });
});
