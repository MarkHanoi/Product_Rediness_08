// wave-6-b-d3: Real binding test — LeaderStylePanel
import { describe, expect, it, vi } from 'vitest';
import { LeaderStylePanel, LEADER_STYLE_PANEL_ID } from '../../LeaderStylePanel.js';
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

describe('LeaderStylePanel — wave-6-b-d3 binding contract', () => {
    it('has the correct LEADER_STYLE_PANEL_ID constant', () => {
        expect(LEADER_STYLE_PANEL_ID).toBe('leader-style-panel');
    });

    it('constructs without throwing', () => {
        expect(() => new LeaderStylePanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new LeaderStylePanel(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('show() calls activatePanel with "leader-style-panel"', () => {
        const rt = makeRuntime();
        const panel = new LeaderStylePanel(rt);
        panel.show();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'leader-style-panel', expect.objectContaining({ label: 'Leader Style Panel' }),
        );
    });

    it('show() makes element visible', () => {
        const panel = new LeaderStylePanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    it('hide() calls deactivatePanel with "leader-style-panel"', () => {
        const rt = makeRuntime();
        const panel = new LeaderStylePanel(rt);
        panel.show(); panel.hide();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('leader-style-panel');
    });

    it('hide() hides element', () => {
        const panel = new LeaderStylePanel(makeRuntime());
        panel.show(); panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    it('show() then hide() produces exactly one activate and one deactivate', () => {
        const rt = makeRuntime();
        const panel = new LeaderStylePanel(rt);
        panel.show(); panel.hide();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('operates without runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new LeaderStylePanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warn.mockRestore();
    });

    it('getStyle() returns default textHeight of 2.5', () => {
        expect(new LeaderStylePanel(makeRuntime()).getStyle().textHeight).toBe(2.5);
    });

    it('setStyle() updates arrowType', () => {
        const panel = new LeaderStylePanel(makeRuntime());
        panel.setStyle({ arrowType: 'dot' });
        expect(panel.getStyle().arrowType).toBe('dot');
    });

    it('close button calls hide()', () => {
        const rt = makeRuntime();
        const panel = new LeaderStylePanel(rt);
        panel.show();
        (panel.element.querySelector('.lsp-close-btn') as HTMLButtonElement).click();
        expect(panel.element.style.display).toBe('none');
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('leader-style-panel');
    });
});
