// wave-6-b-d7: Real binding test — FamilyConstraintPanel
//
// Contract: when FamilyConstraintPanel.show() is called the runtime learns the
// panel is visible (activatePanel with label 'Constraints'), and when hide()
// is called it learns the panel is gone (deactivatePanel).
//
// Docs: docs/archive/pryzm3-internal/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import {
    FamilyConstraintPanel,
    FAMILY_CONSTRAINT_PANEL_ID,
    CONSTRAINT_DISPLAY_DEFS,
} from '../../FamilyConstraintPanel.js';
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

describe('FamilyConstraintPanel — wave-6-b-d7 binding contract', () => {
    it('has the correct FAMILY_CONSTRAINT_PANEL_ID constant', () => {
        expect(FAMILY_CONSTRAINT_PANEL_ID).toBe('family-constraint-panel');
    });

    it('exports the 7 canonical constraint kinds', () => {
        expect(CONSTRAINT_DISPLAY_DEFS.length).toBe(7);
        const kinds = CONSTRAINT_DISPLAY_DEFS.map(d => d.kind);
        expect(kinds).toContain('coincident');
        expect(kinds).toContain('dimension');
        expect(kinds).toContain('perpendicular');
    });

    it('constructs without throwing (happy-dom DOM available)', () => {
        expect(() => new FamilyConstraintPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const panel = new FamilyConstraintPanel(makeRuntime());
        expect(panel.element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="complementary"', () => {
        const panel = new FamilyConstraintPanel(makeRuntime());
        expect(panel.element.getAttribute('role')).toBe('complementary');
    });

    // ── show() — mount binding ────────────────────────────────────────────────

    it('show() calls activatePanel with panel-id "family-constraint-panel"', () => {
        const runtime = makeRuntime();
        const panel = new FamilyConstraintPanel(runtime);
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'family-constraint-panel',
            expect.objectContaining({ label: 'Constraints' }),
        );
    });

    it('show() makes the element visible', () => {
        const panel = new FamilyConstraintPanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    // ── hide() — unmount binding ──────────────────────────────────────────────

    it('hide() calls deactivatePanel with panel-id "family-constraint-panel"', () => {
        const runtime = makeRuntime();
        const panel = new FamilyConstraintPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('family-constraint-panel');
    });

    it('hide() hides the element', () => {
        const panel = new FamilyConstraintPanel(makeRuntime());
        panel.show();
        panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    // ── show/hide symmetry ────────────────────────────────────────────────────

    it('show() then hide() produces exactly one activate and one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new FamilyConstraintPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    // ── idempotency ───────────────────────────────────────────────────────────

    it('show() → show() calls activatePanel twice (slot owns idempotency)', () => {
        const runtime = makeRuntime();
        const panel = new FamilyConstraintPanel(runtime);
        panel.show();
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledTimes(2);
    });

    // ── DOM content ───────────────────────────────────────────────────────────

    it('renders a row for each constraint kind in CONSTRAINT_DISPLAY_DEFS', () => {
        const panel = new FamilyConstraintPanel(makeRuntime());
        const rows = panel.element.querySelectorAll('[data-constraint-kind]');
        expect(rows.length).toBe(CONSTRAINT_DISPLAY_DEFS.length);
    });

    it('each constraint row has a count badge', () => {
        const panel = new FamilyConstraintPanel(makeRuntime());
        for (const def of CONSTRAINT_DISPLAY_DEFS) {
            const badge = panel.element.querySelector(`[data-count="${def.kind}"]`);
            expect(badge).not.toBeNull();
        }
    });

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new FamilyConstraintPanel(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('show()/hide() without runtime — no throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new FamilyConstraintPanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warnSpy.mockRestore();
    });
});
