// wave-6-b-d9: Real binding test — SheetIssuancePanel
//
// Contract: when SheetIssuancePanel.show() is called the runtime learns the
// panel is visible (activatePanel), and when hide() is called it learns the
// panel is gone (deactivatePanel).  Both transitions are idempotent.
//
// Docs: docs/03_PRYZM3/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import {
    SheetIssuancePanel,
    SHEET_ISSUANCE_PANEL_ID,
    ISSUE_PURPOSES,
    DELIVERY_METHODS,
} from '../../SheetIssuancePanel.js';
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

describe('SheetIssuancePanel — wave-6-b-d9 binding contract', () => {
    it('has the correct SHEET_ISSUANCE_PANEL_ID constant', () => {
        expect(SHEET_ISSUANCE_PANEL_ID).toBe('sheet-issuance-panel');
    });

    it('exports at least 5 issue purpose codes', () => {
        expect(ISSUE_PURPOSES.length).toBeGreaterThanOrEqual(5);
    });

    it('ISSUE_PURPOSES includes IFC purpose', () => {
        const ids = ISSUE_PURPOSES.map(p => p.purposeId);
        expect(ids).toContain('ifc');
    });

    it('ISSUE_PURPOSES includes IFR purpose', () => {
        const ids = ISSUE_PURPOSES.map(p => p.purposeId);
        expect(ids).toContain('ifr');
    });

    it('exports at least 3 delivery methods', () => {
        expect(DELIVERY_METHODS.length).toBeGreaterThanOrEqual(3);
    });

    it('DELIVERY_METHODS includes email method', () => {
        const ids = DELIVERY_METHODS.map(m => m.methodId);
        expect(ids).toContain('email');
    });

    it('DELIVERY_METHODS includes cde method', () => {
        const ids = DELIVERY_METHODS.map(m => m.methodId);
        expect(ids).toContain('cde');
    });

    it('constructs without throwing (happy-dom DOM available)', () => {
        expect(() => new SheetIssuancePanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const panel = new SheetIssuancePanel(makeRuntime());
        expect(panel.element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="complementary"', () => {
        const panel = new SheetIssuancePanel(makeRuntime());
        expect(panel.element.getAttribute('role')).toBe('complementary');
    });

    // ── show() — mount binding ────────────────────────────────────────────────

    it('show() calls activatePanel with panel-id "sheet-issuance-panel"', () => {
        const runtime = makeRuntime();
        const panel = new SheetIssuancePanel(runtime);
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'sheet-issuance-panel',
            expect.objectContaining({ label: 'Sheet Issuance' }),
        );
    });

    it('show() makes the element visible', () => {
        const panel = new SheetIssuancePanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    // ── hide() — unmount binding ──────────────────────────────────────────────

    it('hide() calls deactivatePanel with panel-id "sheet-issuance-panel"', () => {
        const runtime = makeRuntime();
        const panel = new SheetIssuancePanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('sheet-issuance-panel');
    });

    it('hide() hides the element', () => {
        const panel = new SheetIssuancePanel(makeRuntime());
        panel.show();
        panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    // ── show/hide symmetry ────────────────────────────────────────────────────

    it('show() then hide() produces exactly one activate and one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new SheetIssuancePanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    // ── idempotency ───────────────────────────────────────────────────────────

    it('show() → show() calls activatePanel twice (slot owns idempotency)', () => {
        const runtime = makeRuntime();
        const panel = new SheetIssuancePanel(runtime);
        panel.show();
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledTimes(2);
    });

    // ── DOM content ───────────────────────────────────────────────────────────

    it('renders a purpose row for every ISSUE_PURPOSES entry', () => {
        const panel = new SheetIssuancePanel(makeRuntime());
        const rows = panel.element.querySelectorAll('[data-purpose-id]');
        expect(rows.length).toBe(ISSUE_PURPOSES.length);
    });

    it('renders a method row for every DELIVERY_METHODS entry', () => {
        const panel = new SheetIssuancePanel(makeRuntime());
        const rows = panel.element.querySelectorAll('[data-method-id]');
        expect(rows.length).toBe(DELIVERY_METHODS.length);
    });

    it.each(ISSUE_PURPOSES.map(p => p.purposeId))(
        'purpose row "%s" is present in the DOM',
        (purposeId) => {
            const panel = new SheetIssuancePanel(makeRuntime());
            const row = panel.element.querySelector(`[data-purpose-id="${purposeId}"]`);
            expect(row).not.toBeNull();
        },
    );

    it.each(DELIVERY_METHODS.map(m => m.methodId))(
        'delivery method row "%s" is present in the DOM',
        (methodId) => {
            const panel = new SheetIssuancePanel(makeRuntime());
            const row = panel.element.querySelector(`[data-method-id="${methodId}"]`);
            expect(row).not.toBeNull();
        },
    );

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new SheetIssuancePanel(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('show()/hide() without runtime — no throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new SheetIssuancePanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warnSpy.mockRestore();
    });
});
