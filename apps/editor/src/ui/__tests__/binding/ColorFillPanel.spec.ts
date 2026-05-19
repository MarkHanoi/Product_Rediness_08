// wave-6-b-d4: Real binding test — ColorFillPanel
import { describe, expect, it, vi } from 'vitest';
import { ColorFillPanel, COLOR_FILL_PANEL_ID } from '../../ColorFillPanel.js';
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

describe('ColorFillPanel — wave-6-b-d4 binding contract', () => {
    it('COLOR_FILL_PANEL_ID is "color-fill-panel"', () => {
        expect(COLOR_FILL_PANEL_ID).toBe('color-fill-panel');
    });

    it('constructs without throwing', () => {
        expect(() => new ColorFillPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new ColorFillPanel(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('show() calls activatePanel("color-fill-panel")', () => {
        const rt = makeRuntime();
        new ColorFillPanel(rt).show();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'color-fill-panel', expect.objectContaining({ label: 'Color Fill Panel' }),
        );
    });

    it('show() sets display:block', () => {
        const p = new ColorFillPanel(makeRuntime());
        p.show();
        expect(p.element.style.display).toBe('block');
    });

    it('hide() calls deactivatePanel("color-fill-panel")', () => {
        const rt = makeRuntime();
        const p  = new ColorFillPanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('color-fill-panel');
    });

    it('hide() sets display:none', () => {
        const p = new ColorFillPanel(makeRuntime());
        p.show(); p.hide();
        expect(p.element.style.display).toBe('none');
    });

    it('exactly one activate and one deactivate per cycle', () => {
        const rt = makeRuntime();
        const p  = new ColorFillPanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('null runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => { const p = new ColorFillPanel(null); p.show(); p.hide(); }).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('default schemeName is "Default Color Fill"', () => {
        expect(new ColorFillPanel(makeRuntime()).getState().schemeName).toBe('Default Color Fill');
    });

    it('default isActive is false', () => {
        expect(new ColorFillPanel(makeRuntime()).getState().isActive).toBe(false);
    });

    it('default has 5 category entries', () => {
        expect(new ColorFillPanel(makeRuntime()).getState().entries.length).toBe(5);
    });

    it('default background is "#ffffff"', () => {
        expect(new ColorFillPanel(makeRuntime()).getState().background).toBe('#ffffff');
    });

    it('setState() patches isActive', () => {
        const p = new ColorFillPanel(makeRuntime());
        p.setState({ isActive: true });
        expect(p.getState().isActive).toBe(true);
    });

    it('setState() patches background color', () => {
        const p = new ColorFillPanel(makeRuntime());
        p.setState({ background: '#eeeeee' });
        expect(p.getState().background).toBe('#eeeeee');
    });

    it('renders schemeName input', () => {
        expect(
            new ColorFillPanel(makeRuntime()).element.querySelector('[data-cfp-field="schemeName"]'),
        ).not.toBeNull();
    });

    it('renders isActive checkbox', () => {
        expect(
            new ColorFillPanel(makeRuntime()).element.querySelector('[data-cfp-field="isActive"]'),
        ).not.toBeNull();
    });

    it('renders fill color swatches for categories', () => {
        const swatches = new ColorFillPanel(makeRuntime()).element.querySelectorAll('[data-cfp-fill-cat]');
        expect(swatches.length).toBeGreaterThan(0);
    });

    it('close button triggers hide()', () => {
        const rt = makeRuntime();
        const p  = new ColorFillPanel(rt);
        p.show();
        (p.element.querySelector('.cfp-close-btn') as HTMLButtonElement).click();
        expect(p.element.style.display).toBe('none');
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('color-fill-panel');
    });
});
