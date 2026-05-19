// wave-6-c-d4: Real binding test — ColorToolbar
import { describe, expect, it, vi } from 'vitest';
import { ColorToolbar, COLOR_TOOLBAR_ID, COLOR_TOOLBAR_BUTTONS } from '../ColorToolbar.js';
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

describe('ColorToolbar — wave-6-c-d4 binding contract', () => {
    it('COLOR_TOOLBAR_ID is "color-toolbar"', () => {
        expect(COLOR_TOOLBAR_ID).toBe('color-toolbar');
    });

    it('exposes 6 button definitions', () => {
        expect(COLOR_TOOLBAR_BUTTONS.length).toBe(6);
    });

    it('has 3 fill + 2 override + 1 legend buttons', () => {
        expect(COLOR_TOOLBAR_BUTTONS.filter(b => b.group === 'fill').length).toBe(3);
        expect(COLOR_TOOLBAR_BUTTONS.filter(b => b.group === 'override').length).toBe(2);
        expect(COLOR_TOOLBAR_BUTTONS.filter(b => b.group === 'legend').length).toBe(1);
    });

    it('constructs without throwing', () => {
        expect(() => new ColorToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new ColorToolbar(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        expect(new ColorToolbar(makeRuntime()).element.getAttribute('role')).toBe('toolbar');
    });

    it('element aria-label is "Color Tools"', () => {
        expect(new ColorToolbar(makeRuntime()).element.getAttribute('aria-label')).toBe('Color Tools');
    });

    it.each(COLOR_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches executeCommand on click',
        (commandType) => {
            const rt      = makeRuntime();
            const toolbar = new ColorToolbar(rt);
            const btn     = toolbar.element.querySelector(`[data-command="${commandType}"]`) as HTMLButtonElement;
            expect(btn).not.toBeNull();
            btn.click();
            expect(rt.bus.executeCommand).toHaveBeenCalledWith(commandType, expect.any(Object));
        },
    );

    it('triggerCommand() dispatches color-fill-by-category', () => {
        const rt = makeRuntime();
        new ColorToolbar(rt).triggerCommand('color-fill-by-category');
        expect(rt.bus.executeCommand).toHaveBeenCalledWith('color-fill-by-category', expect.any(Object));
    });

    it('constructs without runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new ColorToolbar(null)).not.toThrow();
        warn.mockRestore();
    });

    it('button click without runtime — warns, does not throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const t    = new ColorToolbar(null);
        const btn  = t.element.querySelector('[data-command="color-fill-by-category"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('renders 2 group separators (between 3 groups)', () => {
        expect(new ColorToolbar(makeRuntime()).element.querySelectorAll('.ct-separator').length).toBe(2);
    });

    it('all buttons have aria-label', () => {
        for (const btn of new ColorToolbar(makeRuntime()).element.querySelectorAll('.ct-btn')) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('renders exactly 6 buttons', () => {
        expect(new ColorToolbar(makeRuntime()).element.querySelectorAll('.ct-btn').length).toBe(6);
    });
});
