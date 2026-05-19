// wave-6-c-d4: Real binding test — AreaToolbar
import { describe, expect, it, vi } from 'vitest';
import { AreaToolbar, AREA_TOOLBAR_ID, AREA_TOOLBAR_BUTTONS } from '../AreaToolbar.js';
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

describe('AreaToolbar — wave-6-c-d4 binding contract', () => {
    it('AREA_TOOLBAR_ID is "area-toolbar"', () => {
        expect(AREA_TOOLBAR_ID).toBe('area-toolbar');
    });

    it('exposes 5 button definitions', () => {
        expect(AREA_TOOLBAR_BUTTONS.length).toBe(5);
    });

    it('has 2 place + 1 boundary + 2 scheme buttons', () => {
        expect(AREA_TOOLBAR_BUTTONS.filter(b => b.group === 'place').length).toBe(2);
        expect(AREA_TOOLBAR_BUTTONS.filter(b => b.group === 'boundary').length).toBe(1);
        expect(AREA_TOOLBAR_BUTTONS.filter(b => b.group === 'scheme').length).toBe(2);
    });

    it('constructs without throwing', () => {
        expect(() => new AreaToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new AreaToolbar(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        expect(new AreaToolbar(makeRuntime()).element.getAttribute('role')).toBe('toolbar');
    });

    it('element aria-label is "Area Tools"', () => {
        expect(new AreaToolbar(makeRuntime()).element.getAttribute('aria-label')).toBe('Area Tools');
    });

    it.each(AREA_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches executeCommand on click',
        (commandType) => {
            const rt      = makeRuntime();
            const toolbar = new AreaToolbar(rt);
            const btn     = toolbar.element.querySelector(`[data-command="${commandType}"]`) as HTMLButtonElement;
            expect(btn).not.toBeNull();
            btn.click();
            expect(rt.bus.executeCommand).toHaveBeenCalledWith(commandType, expect.any(Object));
        },
    );

    it('triggerCommand() dispatches area-place', () => {
        const rt = makeRuntime();
        new AreaToolbar(rt).triggerCommand('area-place');
        expect(rt.bus.executeCommand).toHaveBeenCalledWith('area-place', expect.any(Object));
    });

    it('constructs without runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new AreaToolbar(null)).not.toThrow();
        warn.mockRestore();
    });

    it('button click without runtime — warns, does not throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const t    = new AreaToolbar(null);
        const btn  = t.element.querySelector('[data-command="area-place"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('renders 2 group separators (between 3 groups)', () => {
        expect(new AreaToolbar(makeRuntime()).element.querySelectorAll('.at-separator').length).toBe(2);
    });

    it('all buttons have aria-label', () => {
        for (const btn of new AreaToolbar(makeRuntime()).element.querySelectorAll('.at-btn')) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('renders exactly 5 buttons', () => {
        expect(new AreaToolbar(makeRuntime()).element.querySelectorAll('.at-btn').length).toBe(5);
    });
});
