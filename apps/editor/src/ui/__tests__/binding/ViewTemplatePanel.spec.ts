// wave-6-b-d6: Real binding test — ViewTemplatePanel
import { describe, expect, it, vi } from 'vitest';
import { ViewTemplatePanel, VIEW_TEMPLATE_PANEL_ID } from '../../ViewTemplatePanel.js';
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

describe('ViewTemplatePanel — wave-6-b-d6 binding contract', () => {
    it('VIEW_TEMPLATE_PANEL_ID is "view-template-panel"', () => {
        expect(VIEW_TEMPLATE_PANEL_ID).toBe('view-template-panel');
    });

    it('constructs without throwing', () => {
        expect(() => new ViewTemplatePanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new ViewTemplatePanel(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('show() calls activatePanel("view-template-panel", { label: "View Template" })', () => {
        const rt = makeRuntime();
        new ViewTemplatePanel(rt).show();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'view-template-panel', expect.objectContaining({ label: 'View Template' }),
        );
    });

    it('show() sets display:block', () => {
        const p = new ViewTemplatePanel(makeRuntime());
        p.show();
        expect(p.element.style.display).toBe('block');
    });

    it('hide() calls deactivatePanel("view-template-panel")', () => {
        const rt = makeRuntime();
        const p  = new ViewTemplatePanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('view-template-panel');
    });

    it('hide() sets display:none', () => {
        const p = new ViewTemplatePanel(makeRuntime());
        p.show(); p.hide();
        expect(p.element.style.display).toBe('none');
    });

    it('exactly one activate and one deactivate per show/hide cycle', () => {
        const rt = makeRuntime();
        const p  = new ViewTemplatePanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('null runtime — show/hide do not throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const p = new ViewTemplatePanel(null);
        expect(() => { p.show(); p.hide(); }).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('default templateName is ""', () => {
        expect(new ViewTemplatePanel(makeRuntime()).getState().templateName).toBe('');
    });

    it('default applyViewScale is true', () => {
        expect(new ViewTemplatePanel(makeRuntime()).getState().applyViewScale).toBe(true);
    });

    it('default applyPhase is false', () => {
        expect(new ViewTemplatePanel(makeRuntime()).getState().applyPhase).toBe(false);
    });

    it('setState() patches templateName', () => {
        const p = new ViewTemplatePanel(makeRuntime());
        p.setState({ templateName: 'Working Views' });
        expect(p.getState().templateName).toBe('Working Views');
    });

    it('setState() patches applyPhase to true', () => {
        const p = new ViewTemplatePanel(makeRuntime());
        p.setState({ applyPhase: true });
        expect(p.getState().applyPhase).toBe(true);
    });

    it('renders an input for templateName', () => {
        expect(new ViewTemplatePanel(makeRuntime()).element.querySelector('[data-vtp-field="templateName"]')).not.toBeNull();
    });

    it('renders a checkbox for applyViewScale', () => {
        expect(new ViewTemplatePanel(makeRuntime()).element.querySelector('[data-vtp-field="applyViewScale"]')).not.toBeNull();
    });

    it('renders a checkbox for applyColorFills', () => {
        expect(new ViewTemplatePanel(makeRuntime()).element.querySelector('[data-vtp-field="applyColorFills"]')).not.toBeNull();
    });

    it('close button triggers hide()', () => {
        const rt = makeRuntime();
        const p  = new ViewTemplatePanel(rt);
        p.show();
        (p.element.querySelector('.vtp-close-btn') as HTMLButtonElement).click();
        expect(p.element.style.display).toBe('none');
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('view-template-panel');
    });
});
