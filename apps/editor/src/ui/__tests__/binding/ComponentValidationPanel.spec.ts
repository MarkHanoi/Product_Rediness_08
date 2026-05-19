// wave-6-b-d8: Real binding test — ComponentValidationPanel
//
// Contract: when ComponentValidationPanel.show() is called the runtime learns
// the panel is visible (activatePanel), and when hide() is called it learns
// the panel is gone (deactivatePanel).  Both transitions are idempotent.
//
// Docs: docs/03_PRYZM3/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import {
    ComponentValidationPanel,
    COMPONENT_VALIDATION_PANEL_ID,
    VALIDATION_RULE_DEFS,
} from '../../ComponentValidationPanel.js';
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

describe('ComponentValidationPanel — wave-6-b-d8 binding contract', () => {
    it('has the correct COMPONENT_VALIDATION_PANEL_ID constant', () => {
        expect(COMPONENT_VALIDATION_PANEL_ID).toBe('component-validation-panel');
    });

    it('exports at least 4 validation rule defs', () => {
        expect(VALIDATION_RULE_DEFS.length).toBeGreaterThanOrEqual(4);
    });

    it('VALIDATION_RULE_DEFS covers all three severity levels', () => {
        const severities = new Set(VALIDATION_RULE_DEFS.map(r => r.severity));
        expect(severities.has('error')).toBe(true);
        expect(severities.has('warning')).toBe(true);
        expect(severities.has('info')).toBe(true);
    });

    it('constructs without throwing (happy-dom DOM available)', () => {
        expect(() => new ComponentValidationPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const panel = new ComponentValidationPanel(makeRuntime());
        expect(panel.element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="complementary"', () => {
        const panel = new ComponentValidationPanel(makeRuntime());
        expect(panel.element.getAttribute('role')).toBe('complementary');
    });

    // ── show() — mount binding ────────────────────────────────────────────────

    it('show() calls activatePanel with panel-id "component-validation-panel"', () => {
        const runtime = makeRuntime();
        const panel = new ComponentValidationPanel(runtime);
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'component-validation-panel',
            expect.objectContaining({ label: 'Component Validation' }),
        );
    });

    it('show(elementId) passes elementId through to activatePanel spec', () => {
        const runtime = makeRuntime();
        const panel = new ComponentValidationPanel(runtime);
        panel.show('column-guid-05');
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'component-validation-panel',
            expect.objectContaining({ elementId: 'column-guid-05' }),
        );
    });

    it('show() makes the element visible', () => {
        const panel = new ComponentValidationPanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    // ── hide() — unmount binding ──────────────────────────────────────────────

    it('hide() calls deactivatePanel with panel-id "component-validation-panel"', () => {
        const runtime = makeRuntime();
        const panel = new ComponentValidationPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith(
            'component-validation-panel',
        );
    });

    it('hide() hides the element', () => {
        const panel = new ComponentValidationPanel(makeRuntime());
        panel.show();
        panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    // ── show/hide symmetry ────────────────────────────────────────────────────

    it('show() then hide() produces exactly one activate and one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new ComponentValidationPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    // ── idempotency ───────────────────────────────────────────────────────────

    it('show() → show() calls activatePanel twice (slot owns idempotency)', () => {
        const runtime = makeRuntime();
        const panel = new ComponentValidationPanel(runtime);
        panel.show();
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledTimes(2);
    });

    // ── DOM content ───────────────────────────────────────────────────────────

    it('renders a rule row for every VALIDATION_RULE_DEFS entry', () => {
        const panel = new ComponentValidationPanel(makeRuntime());
        const rows = panel.element.querySelectorAll('[data-rule-id]');
        expect(rows.length).toBe(VALIDATION_RULE_DEFS.length);
    });

    it.each(VALIDATION_RULE_DEFS.map(r => r.ruleId))(
        'rule row "%s" is present in the DOM',
        (ruleId) => {
            const panel = new ComponentValidationPanel(makeRuntime());
            const row = panel.element.querySelector(`[data-rule-id="${ruleId}"]`);
            expect(row).not.toBeNull();
        },
    );

    it('renders a Fix button for each rule that has an autoFixId', () => {
        const panel = new ComponentValidationPanel(makeRuntime());
        const rulesWithFix = VALIDATION_RULE_DEFS.filter(r => r.autoFixId !== null);
        const fixBtns = panel.element.querySelectorAll('[data-fix-id]');
        expect(fixBtns.length).toBe(rulesWithFix.length);
    });

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new ComponentValidationPanel(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('show()/hide() without runtime — no throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new ComponentValidationPanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warnSpy.mockRestore();
    });
});
