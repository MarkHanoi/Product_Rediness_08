// wave-6-b-d4: Real binding test — AreaPanel
import { describe, expect, it, vi } from 'vitest';
import { AreaPanel, AREA_PANEL_ID } from '../../AreaPanel.js';
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

describe('AreaPanel — wave-6-b-d4 binding contract', () => {
    it('AREA_PANEL_ID is "area-panel"', () => {
        expect(AREA_PANEL_ID).toBe('area-panel');
    });

    it('constructs without throwing', () => {
        expect(() => new AreaPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new AreaPanel(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('show() calls activatePanel("area-panel", { label: "Area Panel" })', () => {
        const rt = makeRuntime();
        new AreaPanel(rt).show();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'area-panel', expect.objectContaining({ label: 'Area Panel' }),
        );
    });

    it('show() sets display:block', () => {
        const p = new AreaPanel(makeRuntime());
        p.show();
        expect(p.element.style.display).toBe('block');
    });

    it('hide() calls deactivatePanel("area-panel")', () => {
        const rt = makeRuntime();
        const p  = new AreaPanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('area-panel');
    });

    it('hide() sets display:none', () => {
        const p = new AreaPanel(makeRuntime());
        p.show(); p.hide();
        expect(p.element.style.display).toBe('none');
    });

    it('exactly one activate and one deactivate per show/hide cycle', () => {
        const rt = makeRuntime();
        const p  = new AreaPanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('null runtime — show/hide do not throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const p = new AreaPanel(null);
        expect(() => { p.show(); p.hide(); }).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('default areaType is "gross-building-area"', () => {
        expect(new AreaPanel(makeRuntime()).getState().areaType).toBe('gross-building-area');
    });

    it('default computationMethod is "finish-face"', () => {
        expect(new AreaPanel(makeRuntime()).getState().computationMethod).toBe('finish-face');
    });

    it('setState() patches unit to "ft²"', () => {
        const p = new AreaPanel(makeRuntime());
        p.setState({ unit: 'ft²' });
        expect(p.getState().unit).toBe('ft²');
    });

    it('setState() patches wallFaceOffset', () => {
        const p = new AreaPanel(makeRuntime());
        p.setState({ wallFaceOffset: 25 });
        expect(p.getState().wallFaceOffset).toBe(25);
    });

    it('renders a select for areaType', () => {
        expect(new AreaPanel(makeRuntime()).element.querySelector('[data-ap-field="areaType"]')).not.toBeNull();
    });

    it('renders an input for wallFaceOffset', () => {
        expect(new AreaPanel(makeRuntime()).element.querySelector('[data-ap-field="wallFaceOffset"]')).not.toBeNull();
    });

    it('renders isComputed checkbox', () => {
        expect(new AreaPanel(makeRuntime()).element.querySelector('[data-ap-field="isComputed"]')).not.toBeNull();
    });

    it('close button triggers hide()', () => {
        const rt = makeRuntime();
        const p  = new AreaPanel(rt);
        p.show();
        (p.element.querySelector('.ap-close-btn') as HTMLButtonElement).click();
        expect(p.element.style.display).toBe('none');
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('area-panel');
    });
});
