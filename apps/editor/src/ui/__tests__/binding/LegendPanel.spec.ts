// wave-6-b-d4: Real binding test — LegendPanel
import { describe, expect, it, vi } from 'vitest';
import { LegendPanel, LEGEND_PANEL_ID } from '../../LegendPanel.js';
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

describe('LegendPanel — wave-6-b-d4 binding contract', () => {
    it('LEGEND_PANEL_ID is "legend-panel"', () => {
        expect(LEGEND_PANEL_ID).toBe('legend-panel');
    });

    it('constructs without throwing', () => {
        expect(() => new LegendPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new LegendPanel(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('show() calls activatePanel("legend-panel")', () => {
        const rt = makeRuntime();
        new LegendPanel(rt).show();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'legend-panel', expect.objectContaining({ label: 'Legend Panel' }),
        );
    });

    it('show() sets display:block', () => {
        const p = new LegendPanel(makeRuntime());
        p.show();
        expect(p.element.style.display).toBe('block');
    });

    it('hide() calls deactivatePanel("legend-panel")', () => {
        const rt = makeRuntime();
        const p  = new LegendPanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('legend-panel');
    });

    it('hide() sets display:none', () => {
        const p = new LegendPanel(makeRuntime());
        p.show(); p.hide();
        expect(p.element.style.display).toBe('none');
    });

    it('exactly one activate and one deactivate per cycle', () => {
        const rt = makeRuntime();
        const p  = new LegendPanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('null runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => { const p = new LegendPanel(null); p.show(); p.hide(); }).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('default title is "Legend"', () => {
        expect(new LegendPanel(makeRuntime()).getState().title).toBe('Legend');
    });

    it('default showTitle is true', () => {
        expect(new LegendPanel(makeRuntime()).getState().showTitle).toBe(true);
    });

    it('default textSize is 3.5', () => {
        expect(new LegendPanel(makeRuntime()).getState().textSize).toBe(3.5);
    });

    it('default scale is 50', () => {
        expect(new LegendPanel(makeRuntime()).getState().scale).toBe(50);
    });

    it('default has 3 legend components', () => {
        expect(new LegendPanel(makeRuntime()).getState().components.length).toBe(3);
    });

    it('setState() patches title and textSize', () => {
        const p = new LegendPanel(makeRuntime());
        p.setState({ title: 'Custom Legend', textSize: 5 });
        expect(p.getState().title).toBe('Custom Legend');
        expect(p.getState().textSize).toBe(5);
    });

    it('setState() patches autoFit to false', () => {
        const p = new LegendPanel(makeRuntime());
        p.setState({ autoFit: false });
        expect(p.getState().autoFit).toBe(false);
    });

    it('renders title input', () => {
        expect(new LegendPanel(makeRuntime()).element.querySelector('[data-lp-field="title"]')).not.toBeNull();
    });

    it('renders textSize input', () => {
        expect(new LegendPanel(makeRuntime()).element.querySelector('[data-lp-field="textSize"]')).not.toBeNull();
    });

    it('renders showTitle checkbox', () => {
        expect(new LegendPanel(makeRuntime()).element.querySelector('[data-lp-field="showTitle"]')).not.toBeNull();
    });

    it('close button triggers hide()', () => {
        const rt = makeRuntime();
        const p  = new LegendPanel(rt);
        p.show();
        (p.element.querySelector('.lp-close-btn') as HTMLButtonElement).click();
        expect(p.element.style.display).toBe('none');
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('legend-panel');
    });
});
