// wave-6-b-d3: Real binding test — RevisionCloudPanel
import { describe, expect, it, vi } from 'vitest';
import { RevisionCloudPanel, REVISION_CLOUD_PANEL_ID } from '../../RevisionCloudPanel.js';
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

describe('RevisionCloudPanel — wave-6-b-d3 binding contract', () => {
    it('has the correct REVISION_CLOUD_PANEL_ID constant', () => {
        expect(REVISION_CLOUD_PANEL_ID).toBe('revision-cloud-panel');
    });

    it('constructs without throwing', () => {
        expect(() => new RevisionCloudPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new RevisionCloudPanel(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('show() calls activatePanel with "revision-cloud-panel"', () => {
        const rt = makeRuntime();
        const panel = new RevisionCloudPanel(rt);
        panel.show();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'revision-cloud-panel', expect.objectContaining({ label: 'Revision Cloud Panel' }),
        );
    });

    it('show() makes element visible', () => {
        const panel = new RevisionCloudPanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    it('hide() calls deactivatePanel with "revision-cloud-panel"', () => {
        const rt = makeRuntime();
        const panel = new RevisionCloudPanel(rt);
        panel.show(); panel.hide();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('revision-cloud-panel');
    });

    it('hide() hides element', () => {
        const panel = new RevisionCloudPanel(makeRuntime());
        panel.show(); panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    it('show() then hide() produces exactly one activate and one deactivate', () => {
        const rt = makeRuntime();
        const panel = new RevisionCloudPanel(rt);
        panel.show(); panel.hide();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('operates without runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new RevisionCloudPanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warn.mockRestore();
    });

    it('getState() returns default arcRadius of 4', () => {
        expect(new RevisionCloudPanel(makeRuntime()).getState().arcRadius).toBe(4);
    });

    it('setState() updates revisionMark', () => {
        const panel = new RevisionCloudPanel(makeRuntime());
        panel.setState({ revisionMark: 'B', showMark: false });
        expect(panel.getState().revisionMark).toBe('B');
        expect(panel.getState().showMark).toBe(false);
    });

    it('renders a textarea for remarks', () => {
        const panel = new RevisionCloudPanel(makeRuntime());
        expect(panel.element.querySelector('[data-rcp-field="remarks"]')).not.toBeNull();
    });

    it('close button calls hide()', () => {
        const rt = makeRuntime();
        const panel = new RevisionCloudPanel(rt);
        panel.show();
        (panel.element.querySelector('.rcp-close-btn') as HTMLButtonElement).click();
        expect(panel.element.style.display).toBe('none');
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('revision-cloud-panel');
    });
});
