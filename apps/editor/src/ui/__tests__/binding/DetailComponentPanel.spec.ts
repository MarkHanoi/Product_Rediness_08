// wave-6-b-d3: Real binding test — DetailComponentPanel
import { describe, expect, it, vi } from 'vitest';
import { DetailComponentPanel, DETAIL_COMPONENT_PANEL_ID } from '../../DetailComponentPanel.js';
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

describe('DetailComponentPanel — wave-6-b-d3 binding contract', () => {
    it('has the correct DETAIL_COMPONENT_PANEL_ID constant', () => {
        expect(DETAIL_COMPONENT_PANEL_ID).toBe('detail-component-panel');
    });

    it('constructs without throwing', () => {
        expect(() => new DetailComponentPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new DetailComponentPanel(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('show() calls activatePanel with "detail-component-panel"', () => {
        const rt = makeRuntime();
        const panel = new DetailComponentPanel(rt);
        panel.show();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'detail-component-panel', expect.objectContaining({ label: 'Detail Component Panel' }),
        );
    });

    it('show() makes element visible', () => {
        const panel = new DetailComponentPanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    it('hide() calls deactivatePanel with "detail-component-panel"', () => {
        const rt = makeRuntime();
        const panel = new DetailComponentPanel(rt);
        panel.show(); panel.hide();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('detail-component-panel');
    });

    it('hide() hides element', () => {
        const panel = new DetailComponentPanel(makeRuntime());
        panel.show(); panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    it('show() then hide() produces exactly one activate and one deactivate', () => {
        const rt = makeRuntime();
        const panel = new DetailComponentPanel(rt);
        panel.show(); panel.hide();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('operates without runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new DetailComponentPanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warn.mockRestore();
    });

    it('getState() returns default componentType of "filled-region"', () => {
        expect(new DetailComponentPanel(makeRuntime()).getState().componentType).toBe('filled-region');
    });

    it('setState() updates fillPattern and scale', () => {
        const panel = new DetailComponentPanel(makeRuntime());
        panel.setState({ fillPattern: 'stone', scale: 2.5 });
        expect(panel.getState().fillPattern).toBe('stone');
        expect(panel.getState().scale).toBe(2.5);
    });

    it('renders a fill-pattern select', () => {
        const panel = new DetailComponentPanel(makeRuntime());
        expect(panel.element.querySelector('[data-dcp-field="fillPattern"]')).not.toBeNull();
    });

    it('close button calls hide()', () => {
        const rt = makeRuntime();
        const panel = new DetailComponentPanel(rt);
        panel.show();
        (panel.element.querySelector('.dcp-close-btn') as HTMLButtonElement).click();
        expect(panel.element.style.display).toBe('none');
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('detail-component-panel');
    });
});
