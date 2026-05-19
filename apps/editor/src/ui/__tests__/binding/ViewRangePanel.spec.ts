// wave-6-b-d6: Real binding test — ViewRangePanel
import { describe, expect, it, vi } from 'vitest';
import { ViewRangePanel, VIEW_RANGE_PANEL_ID } from '../../ViewRangePanel.js';
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

describe('ViewRangePanel — wave-6-b-d6 binding contract', () => {
    it('VIEW_RANGE_PANEL_ID is "view-range-panel"', () => {
        expect(VIEW_RANGE_PANEL_ID).toBe('view-range-panel');
    });

    it('constructs without throwing', () => {
        expect(() => new ViewRangePanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new ViewRangePanel(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('show() calls activatePanel("view-range-panel", { label: "View Range" })', () => {
        const rt = makeRuntime();
        new ViewRangePanel(rt).show();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'view-range-panel', expect.objectContaining({ label: 'View Range' }),
        );
    });

    it('show() sets display:block', () => {
        const p = new ViewRangePanel(makeRuntime());
        p.show();
        expect(p.element.style.display).toBe('block');
    });

    it('hide() calls deactivatePanel("view-range-panel")', () => {
        const rt = makeRuntime();
        const p  = new ViewRangePanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('view-range-panel');
    });

    it('hide() sets display:none', () => {
        const p = new ViewRangePanel(makeRuntime());
        p.show(); p.hide();
        expect(p.element.style.display).toBe('none');
    });

    it('exactly one activate and one deactivate per show/hide cycle', () => {
        const rt = makeRuntime();
        const p  = new ViewRangePanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('null runtime — show/hide do not throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const p = new ViewRangePanel(null);
        expect(() => { p.show(); p.hide(); }).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('default topLevel is "level-above"', () => {
        expect(new ViewRangePanel(makeRuntime()).getState().topLevel).toBe('level-above');
    });

    it('default cutLevel is "associated-level"', () => {
        expect(new ViewRangePanel(makeRuntime()).getState().cutLevel).toBe('associated-level');
    });

    it('default cutOffset is 1200', () => {
        expect(new ViewRangePanel(makeRuntime()).getState().cutOffset).toBe(1200);
    });

    it('setState() patches topLevel to "unlimited"', () => {
        const p = new ViewRangePanel(makeRuntime());
        p.setState({ topLevel: 'unlimited' });
        expect(p.getState().topLevel).toBe('unlimited');
    });

    it('setState() patches cutOffset to 2000', () => {
        const p = new ViewRangePanel(makeRuntime());
        p.setState({ cutOffset: 2000 });
        expect(p.getState().cutOffset).toBe(2000);
    });

    it('renders a select for topLevel', () => {
        expect(new ViewRangePanel(makeRuntime()).element.querySelector('[data-vrp-field="topLevel"]')).not.toBeNull();
    });

    it('renders an input for cutOffset', () => {
        expect(new ViewRangePanel(makeRuntime()).element.querySelector('[data-vrp-field="cutOffset"]')).not.toBeNull();
    });

    it('renders a select for viewDepthLevel', () => {
        expect(new ViewRangePanel(makeRuntime()).element.querySelector('[data-vrp-field="viewDepthLevel"]')).not.toBeNull();
    });

    it('close button triggers hide()', () => {
        const rt = makeRuntime();
        const p  = new ViewRangePanel(rt);
        p.show();
        (p.element.querySelector('.vrp-close-btn') as HTMLButtonElement).click();
        expect(p.element.style.display).toBe('none');
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('view-range-panel');
    });
});
