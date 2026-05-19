// wave-6-b-d6: Real binding test — WorksetPanel
import { describe, expect, it, vi } from 'vitest';
import { WorksetPanel, WORKSET_PANEL_ID } from '../../WorksetPanel.js';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

function makeRuntime() {
    return {
        viewRegistry: {
            activeViewId: null,
            activate: vi.fn(),
            list: vi.fn(() => []),
            subscribe: vi.fn(() => ({ dispose: vi.fn() })),
            activatePanel: vi.fn(),
            deactivatePanel: vi.fn(),
            getActivePanelIds: vi.fn(() => new Set<string>()),
            subscribePanelChange: vi.fn(() => ({ dispose: vi.fn() })),
        },
    } as unknown as PryzmRuntime;
}

describe('WorksetPanel — wave-6-b-d6 binding contract', () => {
    it('WORKSET_PANEL_ID is "workset-panel"', () => {
        expect(WORKSET_PANEL_ID).toBe('workset-panel');
    });

    it('constructs without throwing', () => {
        expect(() => new WorksetPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new WorksetPanel(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('show() calls activatePanel("workset-panel", { label: "Worksets" })', () => {
        const rt = makeRuntime();
        new WorksetPanel(rt).show();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'workset-panel', expect.objectContaining({ label: 'Worksets' }),
        );
    });

    it('show() sets display:block', () => {
        const p = new WorksetPanel(makeRuntime());
        p.show();
        expect(p.element.style.display).toBe('block');
    });

    it('hide() calls deactivatePanel("workset-panel")', () => {
        const rt = makeRuntime();
        const p  = new WorksetPanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('workset-panel');
    });

    it('hide() sets display:none', () => {
        const p = new WorksetPanel(makeRuntime());
        p.show(); p.hide();
        expect(p.element.style.display).toBe('none');
    });

    it('exactly one activate and one deactivate per show/hide cycle', () => {
        const rt = makeRuntime();
        const p  = new WorksetPanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('null runtime — show/hide do not throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const p = new WorksetPanel(null);
        expect(() => { p.show(); p.hide(); }).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('default activeWorkset is "Shared Levels and Grids"', () => {
        expect(new WorksetPanel(makeRuntime()).getState().activeWorkset).toBe('Shared Levels and Grids');
    });

    it('default visibilityInView is "visible"', () => {
        expect(new WorksetPanel(makeRuntime()).getState().visibilityInView).toBe('visible');
    });

    it('default editableByEveryone is true', () => {
        expect(new WorksetPanel(makeRuntime()).getState().editableByEveryone).toBe(true);
    });

    it('setState() patches activeWorkset', () => {
        const p = new WorksetPanel(makeRuntime());
        p.setState({ activeWorkset: 'Architecture' });
        expect(p.getState().activeWorkset).toBe('Architecture');
    });

    it('setState() patches visibilityInView to "hidden"', () => {
        const p = new WorksetPanel(makeRuntime());
        p.setState({ visibilityInView: 'hidden' });
        expect(p.getState().visibilityInView).toBe('hidden');
    });

    it('renders an input for activeWorkset', () => {
        expect(new WorksetPanel(makeRuntime()).element.querySelector('[data-wsp-field="activeWorkset"]')).not.toBeNull();
    });

    it('renders a select for visibilityInView', () => {
        expect(new WorksetPanel(makeRuntime()).element.querySelector('[data-wsp-field="visibilityInView"]')).not.toBeNull();
    });

    it('renders a checkbox for editableByOwnerOnly', () => {
        expect(new WorksetPanel(makeRuntime()).element.querySelector('[data-wsp-field="editableByOwnerOnly"]')).not.toBeNull();
    });

    it('close button triggers hide()', () => {
        const rt = makeRuntime();
        const p  = new WorksetPanel(rt);
        p.show();
        (p.element.querySelector('.wsp-close-btn') as HTMLButtonElement).click();
        expect(p.element.style.display).toBe('none');
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('workset-panel');
    });
});
