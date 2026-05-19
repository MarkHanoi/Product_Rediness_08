// wave-6-b-d8: Real binding test — ComponentRelationshipPanel
//
// Contract: when ComponentRelationshipPanel.show() is called the runtime
// learns the panel is visible (activatePanel), and when hide() is called it
// learns the panel is gone (deactivatePanel).  Both transitions are idempotent.
//
// Docs: docs/03_PRYZM3/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import {
    ComponentRelationshipPanel,
    COMPONENT_RELATIONSHIP_PANEL_ID,
    RELATIONSHIP_CATEGORIES,
} from '../../ComponentRelationshipPanel.js';
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

describe('ComponentRelationshipPanel — wave-6-b-d8 binding contract', () => {
    it('has the correct COMPONENT_RELATIONSHIP_PANEL_ID constant', () => {
        expect(COMPONENT_RELATIONSHIP_PANEL_ID).toBe('component-relationship-panel');
    });

    it('exports at least 5 relationship categories', () => {
        expect(RELATIONSHIP_CATEGORIES.length).toBeGreaterThanOrEqual(5);
    });

    it('RELATIONSHIP_CATEGORIES include a "hosted" category', () => {
        const ids = RELATIONSHIP_CATEGORIES.map(c => c.categoryId);
        expect(ids).toContain('hosted');
    });

    it('RELATIONSHIP_CATEGORIES include a "joins" category', () => {
        const ids = RELATIONSHIP_CATEGORIES.map(c => c.categoryId);
        expect(ids).toContain('joins');
    });

    it('constructs without throwing (happy-dom DOM available)', () => {
        expect(() => new ComponentRelationshipPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const panel = new ComponentRelationshipPanel(makeRuntime());
        expect(panel.element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="complementary"', () => {
        const panel = new ComponentRelationshipPanel(makeRuntime());
        expect(panel.element.getAttribute('role')).toBe('complementary');
    });

    // ── show() — mount binding ────────────────────────────────────────────────

    it('show() calls activatePanel with panel-id "component-relationship-panel"', () => {
        const runtime = makeRuntime();
        const panel = new ComponentRelationshipPanel(runtime);
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'component-relationship-panel',
            expect.objectContaining({ label: 'Component Relationships' }),
        );
    });

    it('show(elementId) passes elementId through to activatePanel spec', () => {
        const runtime = makeRuntime();
        const panel = new ComponentRelationshipPanel(runtime);
        panel.show('window-guid-42');
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'component-relationship-panel',
            expect.objectContaining({ elementId: 'window-guid-42' }),
        );
    });

    it('show() makes the element visible', () => {
        const panel = new ComponentRelationshipPanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    // ── hide() — unmount binding ──────────────────────────────────────────────

    it('hide() calls deactivatePanel with panel-id "component-relationship-panel"', () => {
        const runtime = makeRuntime();
        const panel = new ComponentRelationshipPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith(
            'component-relationship-panel',
        );
    });

    it('hide() hides the element', () => {
        const panel = new ComponentRelationshipPanel(makeRuntime());
        panel.show();
        panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    // ── show/hide symmetry ────────────────────────────────────────────────────

    it('show() then hide() produces exactly one activate and one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new ComponentRelationshipPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    // ── idempotency ───────────────────────────────────────────────────────────

    it('show() → show() calls activatePanel twice (slot owns idempotency)', () => {
        const runtime = makeRuntime();
        const panel = new ComponentRelationshipPanel(runtime);
        panel.show();
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledTimes(2);
    });

    // ── DOM content ───────────────────────────────────────────────────────────

    it('renders a category row for every RELATIONSHIP_CATEGORIES entry', () => {
        const panel = new ComponentRelationshipPanel(makeRuntime());
        const rows = panel.element.querySelectorAll('[data-category-id]');
        expect(rows.length).toBe(RELATIONSHIP_CATEGORIES.length);
    });

    it.each(RELATIONSHIP_CATEGORIES.map(c => c.categoryId))(
        'category row "%s" is present in the DOM',
        (catId) => {
            const panel = new ComponentRelationshipPanel(makeRuntime());
            const row = panel.element.querySelector(`[data-category-id="${catId}"]`);
            expect(row).not.toBeNull();
        },
    );

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new ComponentRelationshipPanel(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('show()/hide() without runtime — no throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new ComponentRelationshipPanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warnSpy.mockRestore();
    });
});
