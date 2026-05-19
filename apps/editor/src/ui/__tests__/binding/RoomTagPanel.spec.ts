// wave-6-b-d3: Real binding test — RoomTagPanel
import { describe, expect, it, vi } from 'vitest';
import { RoomTagPanel, ROOM_TAG_PANEL_ID } from '../../RoomTagPanel.js';
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

describe('RoomTagPanel — wave-6-b-d3 binding contract', () => {
    it('has the correct ROOM_TAG_PANEL_ID constant', () => {
        expect(ROOM_TAG_PANEL_ID).toBe('room-tag-panel');
    });

    it('constructs without throwing', () => {
        expect(() => new RoomTagPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new RoomTagPanel(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('show() calls activatePanel with "room-tag-panel"', () => {
        const rt = makeRuntime();
        const panel = new RoomTagPanel(rt);
        panel.show();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'room-tag-panel', expect.objectContaining({ label: 'Room Tag Panel' }),
        );
    });

    it('show() makes element visible', () => {
        const panel = new RoomTagPanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    it('hide() calls deactivatePanel with "room-tag-panel"', () => {
        const rt = makeRuntime();
        const panel = new RoomTagPanel(rt);
        panel.show(); panel.hide();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('room-tag-panel');
    });

    it('hide() hides element', () => {
        const panel = new RoomTagPanel(makeRuntime());
        panel.show(); panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    it('show() then hide() produces exactly one activate and one deactivate', () => {
        const rt = makeRuntime();
        const panel = new RoomTagPanel(rt);
        panel.show(); panel.hide();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('operates without runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new RoomTagPanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warn.mockRestore();
    });

    it('getState() returns default placement "center"', () => {
        expect(new RoomTagPanel(makeRuntime()).getState().placement).toBe('center');
    });

    it('getState() returns showArea true by default', () => {
        expect(new RoomTagPanel(makeRuntime()).getState().showArea).toBe(true);
    });

    it('setState() updates areaUnit and placement', () => {
        const panel = new RoomTagPanel(makeRuntime());
        panel.setState({ areaUnit: 'ft²', placement: 'near-door' });
        expect(panel.getState().areaUnit).toBe('ft²');
        expect(panel.getState().placement).toBe('near-door');
    });

    it('renders a format-string input field', () => {
        const panel = new RoomTagPanel(makeRuntime());
        expect(panel.element.querySelector('[data-rtp-field="formatString"]')).not.toBeNull();
    });

    it('renders showArea and showRoomName checkboxes', () => {
        const panel = new RoomTagPanel(makeRuntime());
        expect(panel.element.querySelector('[data-rtp-field="showArea"]')).not.toBeNull();
        expect(panel.element.querySelector('[data-rtp-field="showRoomName"]')).not.toBeNull();
    });

    it('close button calls hide()', () => {
        const rt = makeRuntime();
        const panel = new RoomTagPanel(rt);
        panel.show();
        (panel.element.querySelector('.rtp-close-btn') as HTMLButtonElement).click();
        expect(panel.element.style.display).toBe('none');
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('room-tag-panel');
    });
});
