// wave-6-b-d9: Real binding test — SheetCompositionPanel
//
// Contract: when SheetCompositionPanel.show() is called the runtime learns
// the panel is visible (activatePanel), and when hide() is called it learns
// the panel is gone (deactivatePanel).  Both transitions are idempotent.
//
// Docs: docs/03_PRYZM3/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import {
    SheetCompositionPanel,
    SHEET_COMPOSITION_PANEL_ID,
    VIEWPORT_PROPERTIES,
    TITLE_BLOCK_OPTIONS,
} from '../../SheetCompositionPanel.js';
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

describe('SheetCompositionPanel — wave-6-b-d9 binding contract', () => {
    it('has the correct SHEET_COMPOSITION_PANEL_ID constant', () => {
        expect(SHEET_COMPOSITION_PANEL_ID).toBe('sheet-composition-panel');
    });

    it('exports at least 4 viewport properties', () => {
        expect(VIEWPORT_PROPERTIES.length).toBeGreaterThanOrEqual(4);
    });

    it('VIEWPORT_PROPERTIES includes "scale" property', () => {
        const ids = VIEWPORT_PROPERTIES.map(p => p.propId);
        expect(ids).toContain('scale');
    });

    it('TITLE_BLOCK_OPTIONS has at least 5 options', () => {
        expect(TITLE_BLOCK_OPTIONS.length).toBeGreaterThanOrEqual(5);
    });

    it('constructs without throwing (happy-dom DOM available)', () => {
        expect(() => new SheetCompositionPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const panel = new SheetCompositionPanel(makeRuntime());
        expect(panel.element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="complementary"', () => {
        const panel = new SheetCompositionPanel(makeRuntime());
        expect(panel.element.getAttribute('role')).toBe('complementary');
    });

    // ── show() — mount binding ────────────────────────────────────────────────

    it('show() calls activatePanel with panel-id "sheet-composition-panel"', () => {
        const runtime = makeRuntime();
        const panel = new SheetCompositionPanel(runtime);
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'sheet-composition-panel',
            expect.objectContaining({ label: 'Sheet Composition' }),
        );
    });

    it('show(sheetId) passes sheetId through to activatePanel spec', () => {
        const runtime = makeRuntime();
        const panel = new SheetCompositionPanel(runtime);
        panel.show('sheet-guid-01');
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'sheet-composition-panel',
            expect.objectContaining({ elementId: 'sheet-guid-01' }),
        );
    });

    it('show() makes the element visible', () => {
        const panel = new SheetCompositionPanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    // ── hide() — unmount binding ──────────────────────────────────────────────

    it('hide() calls deactivatePanel with panel-id "sheet-composition-panel"', () => {
        const runtime = makeRuntime();
        const panel = new SheetCompositionPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith(
            'sheet-composition-panel',
        );
    });

    it('hide() hides the element', () => {
        const panel = new SheetCompositionPanel(makeRuntime());
        panel.show();
        panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    // ── show/hide symmetry ────────────────────────────────────────────────────

    it('show() then hide() produces exactly one activate and one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new SheetCompositionPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    // ── idempotency ───────────────────────────────────────────────────────────

    it('show() → show() calls activatePanel twice (slot owns idempotency)', () => {
        const runtime = makeRuntime();
        const panel = new SheetCompositionPanel(runtime);
        panel.show();
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledTimes(2);
    });

    // ── DOM content ───────────────────────────────────────────────────────────

    it('renders a prop row for every VIEWPORT_PROPERTIES entry', () => {
        const panel = new SheetCompositionPanel(makeRuntime());
        const rows = panel.element.querySelectorAll('[data-prop-id]');
        expect(rows.length).toBe(VIEWPORT_PROPERTIES.length);
    });

    it('renders a title block select element', () => {
        const panel = new SheetCompositionPanel(makeRuntime());
        const select = panel.element.querySelector('[data-scp-titleblock]');
        expect(select).not.toBeNull();
    });

    it('title block select has an option for every TITLE_BLOCK_OPTIONS entry', () => {
        const panel = new SheetCompositionPanel(makeRuntime());
        const select = panel.element.querySelector('[data-scp-titleblock]') as HTMLSelectElement;
        expect(select.options.length).toBe(TITLE_BLOCK_OPTIONS.length);
    });

    it.each(VIEWPORT_PROPERTIES.map(p => p.propId))(
        'viewport property row "%s" is present in the DOM',
        (propId) => {
            const panel = new SheetCompositionPanel(makeRuntime());
            const row = panel.element.querySelector(`[data-prop-id="${propId}"]`);
            expect(row).not.toBeNull();
        },
    );

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new SheetCompositionPanel(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('show()/hide() without runtime — no throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new SheetCompositionPanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warnSpy.mockRestore();
    });
});
