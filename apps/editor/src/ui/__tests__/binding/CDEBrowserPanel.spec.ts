// wave-6-b-d10: Real binding test — CDEBrowserPanel
//
// Contract: show() calls activatePanel; hide() calls deactivatePanel.
// Docs: docs/archive/pryzm3-internal/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import {
    CDEBrowserPanel,
    CDE_BROWSER_PANEL_ID,
    CDE_DOC_TYPES,
    CDE_STATUSES,
} from '../../CDEBrowserPanel.js';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

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

describe('CDEBrowserPanel — wave-6-b-d10 binding contract', () => {
    it('has the correct CDE_BROWSER_PANEL_ID constant', () => {
        expect(CDE_BROWSER_PANEL_ID).toBe('cde-browser-panel');
    });

    it('exports at least 4 CDE document types', () => {
        expect(CDE_DOC_TYPES.length).toBeGreaterThanOrEqual(4);
    });

    it('CDE_DOC_TYPES includes model type', () => {
        expect(CDE_DOC_TYPES.map(t => t.typeId)).toContain('model');
    });

    it('CDE_DOC_TYPES includes drawing type', () => {
        expect(CDE_DOC_TYPES.map(t => t.typeId)).toContain('drawing');
    });

    it('exports at least 4 CDE statuses', () => {
        expect(CDE_STATUSES.length).toBeGreaterThanOrEqual(4);
    });

    it('CDE_STATUSES includes wip status', () => {
        expect(CDE_STATUSES.map(s => s.statusId)).toContain('wip');
    });

    it('CDE_STATUSES includes published status', () => {
        expect(CDE_STATUSES.map(s => s.statusId)).toContain('published');
    });

    it('constructs without throwing', () => {
        expect(() => new CDEBrowserPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const panel = new CDEBrowserPanel(makeRuntime());
        expect(panel.element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="complementary"', () => {
        const panel = new CDEBrowserPanel(makeRuntime());
        expect(panel.element.getAttribute('role')).toBe('complementary');
    });

    it('show() calls activatePanel with panel-id "cde-browser-panel"', () => {
        const runtime = makeRuntime();
        const panel = new CDEBrowserPanel(runtime);
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'cde-browser-panel',
            expect.objectContaining({ label: 'CDE Browser' }),
        );
    });

    it('show() makes the element visible', () => {
        const panel = new CDEBrowserPanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    it('hide() calls deactivatePanel with panel-id "cde-browser-panel"', () => {
        const runtime = makeRuntime();
        const panel = new CDEBrowserPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('cde-browser-panel');
    });

    it('hide() hides the element', () => {
        const panel = new CDEBrowserPanel(makeRuntime());
        panel.show();
        panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    it('show() then hide() produces exactly one activate and one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new CDEBrowserPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('show() → show() calls activatePanel twice (slot owns idempotency)', () => {
        const runtime = makeRuntime();
        const panel = new CDEBrowserPanel(runtime);
        panel.show();
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledTimes(2);
    });

    it('renders a type chip for every CDE_DOC_TYPES entry', () => {
        const panel = new CDEBrowserPanel(makeRuntime());
        const chips = panel.element.querySelectorAll('[data-type-id]');
        expect(chips.length).toBe(CDE_DOC_TYPES.length);
    });

    it('renders a status chip for every CDE_STATUSES entry', () => {
        const panel = new CDEBrowserPanel(makeRuntime());
        const chips = panel.element.querySelectorAll('[data-status-id]');
        expect(chips.length).toBe(CDE_STATUSES.length);
    });

    it('renders a search input', () => {
        const panel = new CDEBrowserPanel(makeRuntime());
        expect(panel.element.querySelector('[data-cdebp-search]')).not.toBeNull();
    });

    it.each(CDE_DOC_TYPES.map(t => t.typeId))(
        'document type chip "%s" is present in the DOM',
        (typeId) => {
            const panel = new CDEBrowserPanel(makeRuntime());
            expect(panel.element.querySelector(`[data-type-id="${typeId}"]`)).not.toBeNull();
        },
    );

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new CDEBrowserPanel(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('show()/hide() without runtime — no throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new CDEBrowserPanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warnSpy.mockRestore();
    });
});
