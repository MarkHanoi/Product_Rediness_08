// wave-6-b-d6: Real binding test — CameraPanel
import { describe, expect, it, vi } from 'vitest';
import { CameraPanel, CAMERA_PANEL_ID } from '../../CameraPanel.js';
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

describe('CameraPanel — wave-6-b-d6 binding contract', () => {
    it('CAMERA_PANEL_ID is "camera-panel"', () => {
        expect(CAMERA_PANEL_ID).toBe('camera-panel');
    });

    it('constructs without throwing', () => {
        expect(() => new CameraPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new CameraPanel(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('show() calls activatePanel("camera-panel", { label: "Camera Settings" })', () => {
        const rt = makeRuntime();
        new CameraPanel(rt).show();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'camera-panel', expect.objectContaining({ label: 'Camera Settings' }),
        );
    });

    it('show() sets display:block', () => {
        const p = new CameraPanel(makeRuntime());
        p.show();
        expect(p.element.style.display).toBe('block');
    });

    it('hide() calls deactivatePanel("camera-panel")', () => {
        const rt = makeRuntime();
        const p  = new CameraPanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('camera-panel');
    });

    it('hide() sets display:none', () => {
        const p = new CameraPanel(makeRuntime());
        p.show(); p.hide();
        expect(p.element.style.display).toBe('none');
    });

    it('exactly one activate and one deactivate per show/hide cycle', () => {
        const rt = makeRuntime();
        const p  = new CameraPanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('null runtime — show/hide do not throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const p = new CameraPanel(null);
        expect(() => { p.show(); p.hide(); }).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('default projection is "parallel"', () => {
        expect(new CameraPanel(makeRuntime()).getState().projection).toBe('parallel');
    });

    it('default focalLength is 50', () => {
        expect(new CameraPanel(makeRuntime()).getState().focalLength).toBe(50);
    });

    it('default farClipActive is false', () => {
        expect(new CameraPanel(makeRuntime()).getState().farClipActive).toBe(false);
    });

    it('setState() patches projection to "perspective"', () => {
        const p = new CameraPanel(makeRuntime());
        p.setState({ projection: 'perspective' });
        expect(p.getState().projection).toBe('perspective');
    });

    it('setState() patches focalLength to 85', () => {
        const p = new CameraPanel(makeRuntime());
        p.setState({ focalLength: 85 });
        expect(p.getState().focalLength).toBe(85);
    });

    it('renders a select for projection', () => {
        expect(new CameraPanel(makeRuntime()).element.querySelector('[data-camp-field="projection"]')).not.toBeNull();
    });

    it('renders a number input for focalLength', () => {
        expect(new CameraPanel(makeRuntime()).element.querySelector('[data-camp-field="focalLength"]')).not.toBeNull();
    });

    it('renders a checkbox for farClipActive', () => {
        expect(new CameraPanel(makeRuntime()).element.querySelector('[data-camp-field="farClipActive"]')).not.toBeNull();
    });

    it('close button triggers hide()', () => {
        const rt = makeRuntime();
        const p  = new CameraPanel(rt);
        p.show();
        (p.element.querySelector('.camp-close-btn') as HTMLButtonElement).click();
        expect(p.element.style.display).toBe('none');
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('camera-panel');
    });
});
