// wave-6-c-d4: Real binding test — RoomToolbar
import { describe, expect, it, vi } from 'vitest';
import { RoomToolbar, ROOM_TOOLBAR_ID, ROOM_TOOLBAR_BUTTONS } from '../RoomToolbar.js';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

function makeRuntime() {
    return {
        bus: {
            executeCommand: vi.fn(),
            register: vi.fn(() => ({ dispose: vi.fn() })),
            registry: new Map(),
        },
    } as unknown as PryzmRuntime;
}

describe('RoomToolbar — wave-6-c-d4 binding contract', () => {
    it('ROOM_TOOLBAR_ID is "room-toolbar"', () => {
        expect(ROOM_TOOLBAR_ID).toBe('room-toolbar');
    });

    it('exposes 6 button definitions', () => {
        expect(ROOM_TOOLBAR_BUTTONS.length).toBe(6);
    });

    it('has 3 place + 2 boundary + 1 properties buttons', () => {
        expect(ROOM_TOOLBAR_BUTTONS.filter(b => b.group === 'place').length).toBe(3);
        expect(ROOM_TOOLBAR_BUTTONS.filter(b => b.group === 'boundary').length).toBe(2);
        expect(ROOM_TOOLBAR_BUTTONS.filter(b => b.group === 'properties').length).toBe(1);
    });

    it('constructs without throwing', () => {
        expect(() => new RoomToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new RoomToolbar(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        expect(new RoomToolbar(makeRuntime()).element.getAttribute('role')).toBe('toolbar');
    });

    it('element aria-label is "Room Tools"', () => {
        expect(new RoomToolbar(makeRuntime()).element.getAttribute('aria-label')).toBe('Room Tools');
    });

    it.each(ROOM_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches executeCommand on click',
        (commandType) => {
            const rt      = makeRuntime();
            const toolbar = new RoomToolbar(rt);
            const btn     = toolbar.element.querySelector(`[data-command="${commandType}"]`) as HTMLButtonElement;
            expect(btn).not.toBeNull();
            btn.click();
            expect(rt.bus.executeCommand).toHaveBeenCalledWith(commandType, expect.any(Object));
        },
    );

    it('triggerCommand() dispatches room-place', () => {
        const rt = makeRuntime();
        new RoomToolbar(rt).triggerCommand('room-place');
        expect(rt.bus.executeCommand).toHaveBeenCalledWith('room-place', expect.any(Object));
    });

    it('constructs without runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new RoomToolbar(null)).not.toThrow();
        warn.mockRestore();
    });

    it('button click without runtime — warns, does not throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const t    = new RoomToolbar(null);
        const btn  = t.element.querySelector('[data-command="room-place"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('renders 2 group separators (between 3 groups)', () => {
        expect(new RoomToolbar(makeRuntime()).element.querySelectorAll('.rt-separator').length).toBe(2);
    });

    it('all buttons have aria-label', () => {
        for (const btn of new RoomToolbar(makeRuntime()).element.querySelectorAll('.rt-btn')) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('renders exactly 6 buttons', () => {
        expect(new RoomToolbar(makeRuntime()).element.querySelectorAll('.rt-btn').length).toBe(6);
    });
});
