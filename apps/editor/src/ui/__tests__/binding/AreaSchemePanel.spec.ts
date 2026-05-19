// wave-6-b-d4: Real binding test — AreaSchemePanel
import { describe, expect, it, vi } from 'vitest';
import { AreaSchemePanel, AREA_SCHEME_PANEL_ID } from '../../AreaSchemePanel.js';
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

describe('AreaSchemePanel — wave-6-b-d4 binding contract', () => {
    it('AREA_SCHEME_PANEL_ID is "area-scheme-panel"', () => {
        expect(AREA_SCHEME_PANEL_ID).toBe('area-scheme-panel');
    });

    it('constructs without throwing', () => {
        expect(() => new AreaSchemePanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new AreaSchemePanel(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('show() calls activatePanel("area-scheme-panel")', () => {
        const rt = makeRuntime();
        new AreaSchemePanel(rt).show();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'area-scheme-panel', expect.objectContaining({ label: 'Area Scheme Panel' }),
        );
    });

    it('show() sets display:block', () => {
        const p = new AreaSchemePanel(makeRuntime());
        p.show();
        expect(p.element.style.display).toBe('block');
    });

    it('hide() calls deactivatePanel("area-scheme-panel")', () => {
        const rt = makeRuntime();
        const p  = new AreaSchemePanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('area-scheme-panel');
    });

    it('hide() sets display:none', () => {
        const p = new AreaSchemePanel(makeRuntime());
        p.show(); p.hide();
        expect(p.element.style.display).toBe('none');
    });

    it('exactly one activate and one deactivate per cycle', () => {
        const rt = makeRuntime();
        const p  = new AreaSchemePanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('null runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => { const p = new AreaSchemePanel(null); p.show(); p.hide(); }).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('default schemeName is "Default Area Scheme"', () => {
        expect(new AreaSchemePanel(makeRuntime()).getState().schemeName).toBe('Default Area Scheme');
    });

    it('default showLegend is true', () => {
        expect(new AreaSchemePanel(makeRuntime()).getState().showLegend).toBe(true);
    });

    it('default has 4 color entries', () => {
        expect(new AreaSchemePanel(makeRuntime()).getState().entries.length).toBe(4);
    });

    it('setState() patches legendPosition', () => {
        const p = new AreaSchemePanel(makeRuntime());
        p.setState({ legendPosition: 'top-left' });
        expect(p.getState().legendPosition).toBe('top-left');
    });

    it('setState() patches showLegend to false', () => {
        const p = new AreaSchemePanel(makeRuntime());
        p.setState({ showLegend: false });
        expect(p.getState().showLegend).toBe(false);
    });

    it('renders swatches for area type colors', () => {
        expect(
            new AreaSchemePanel(makeRuntime()).element.querySelectorAll('[data-asp-entry-color]').length,
        ).toBeGreaterThan(0);
    });

    it('close button triggers hide()', () => {
        const rt = makeRuntime();
        const p  = new AreaSchemePanel(rt);
        p.show();
        (p.element.querySelector('.asp-close-btn') as HTMLButtonElement).click();
        expect(p.element.style.display).toBe('none');
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('area-scheme-panel');
    });
});
