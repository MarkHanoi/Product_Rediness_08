// wave-6-b-d9: Real binding test — SheetBrowserPanel
//
// Contract: when SheetBrowserPanel.show() is called the runtime learns the
// panel is visible (activatePanel), and when hide() is called it learns the
// panel is gone (deactivatePanel).  Both transitions are idempotent.
//
// Docs: docs/03_PRYZM3/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import {
    SheetBrowserPanel,
    SHEET_BROWSER_PANEL_ID,
    SHEET_DISCIPLINES,
    SHEET_STATUSES,
} from '../../SheetBrowserPanel.js';
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

describe('SheetBrowserPanel — wave-6-b-d9 binding contract', () => {
    it('has the correct SHEET_BROWSER_PANEL_ID constant', () => {
        expect(SHEET_BROWSER_PANEL_ID).toBe('sheet-browser-panel');
    });

    it('exports at least 5 sheet disciplines', () => {
        expect(SHEET_DISCIPLINES.length).toBeGreaterThanOrEqual(5);
    });

    it('SHEET_DISCIPLINES includes architecture discipline', () => {
        const ids = SHEET_DISCIPLINES.map(d => d.disciplineId);
        expect(ids).toContain('architecture');
    });

    it('SHEET_DISCIPLINES includes structure discipline', () => {
        const ids = SHEET_DISCIPLINES.map(d => d.disciplineId);
        expect(ids).toContain('structure');
    });

    it('exports at least 4 sheet statuses', () => {
        expect(SHEET_STATUSES.length).toBeGreaterThanOrEqual(4);
    });

    it('SHEET_STATUSES includes ifc status', () => {
        const ids = SHEET_STATUSES.map(s => s.statusId);
        expect(ids).toContain('ifc');
    });

    it('constructs without throwing (happy-dom DOM available)', () => {
        expect(() => new SheetBrowserPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const panel = new SheetBrowserPanel(makeRuntime());
        expect(panel.element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="complementary"', () => {
        const panel = new SheetBrowserPanel(makeRuntime());
        expect(panel.element.getAttribute('role')).toBe('complementary');
    });

    // ── show() — mount binding ────────────────────────────────────────────────

    it('show() calls activatePanel with panel-id "sheet-browser-panel"', () => {
        const runtime = makeRuntime();
        const panel = new SheetBrowserPanel(runtime);
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'sheet-browser-panel',
            expect.objectContaining({ label: 'Sheet Browser' }),
        );
    });

    it('show() makes the element visible', () => {
        const panel = new SheetBrowserPanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    // ── hide() — unmount binding ──────────────────────────────────────────────

    it('hide() calls deactivatePanel with panel-id "sheet-browser-panel"', () => {
        const runtime = makeRuntime();
        const panel = new SheetBrowserPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('sheet-browser-panel');
    });

    it('hide() hides the element', () => {
        const panel = new SheetBrowserPanel(makeRuntime());
        panel.show();
        panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    // ── show/hide symmetry ────────────────────────────────────────────────────

    it('show() then hide() produces exactly one activate and one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new SheetBrowserPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    // ── idempotency ───────────────────────────────────────────────────────────

    it('show() → show() calls activatePanel twice (slot owns idempotency)', () => {
        const runtime = makeRuntime();
        const panel = new SheetBrowserPanel(runtime);
        panel.show();
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledTimes(2);
    });

    // ── DOM content ───────────────────────────────────────────────────────────

    it('renders a discipline chip for every SHEET_DISCIPLINES entry', () => {
        const panel = new SheetBrowserPanel(makeRuntime());
        const chips = panel.element.querySelectorAll('[data-discipline-id]');
        expect(chips.length).toBe(SHEET_DISCIPLINES.length);
    });

    it('renders a status chip for every SHEET_STATUSES entry', () => {
        const panel = new SheetBrowserPanel(makeRuntime());
        const chips = panel.element.querySelectorAll('[data-status-id]');
        expect(chips.length).toBe(SHEET_STATUSES.length);
    });

    it('renders a search input', () => {
        const panel = new SheetBrowserPanel(makeRuntime());
        const input = panel.element.querySelector('[data-sbp-search]');
        expect(input).not.toBeNull();
    });

    it.each(SHEET_DISCIPLINES.map(d => d.disciplineId))(
        'discipline chip "%s" is present in the DOM',
        (disciplineId) => {
            const panel = new SheetBrowserPanel(makeRuntime());
            const chip = panel.element.querySelector(`[data-discipline-id="${disciplineId}"]`);
            expect(chip).not.toBeNull();
        },
    );

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new SheetBrowserPanel(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('show()/hide() without runtime — no throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new SheetBrowserPanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warnSpy.mockRestore();
    });
});
