// wave-6-c-d6: Real binding test — ElevationToolbar
import { describe, expect, it, vi } from 'vitest';
import { ElevationToolbar, ELEVATION_TOOLBAR_ID, ELEVATION_TOOLBAR_BUTTONS } from '../ElevationToolbar.js';
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

describe('ElevationToolbar — wave-6-c-d6 binding contract', () => {
    it('ELEVATION_TOOLBAR_ID is "elevation-toolbar"', () => {
        expect(ELEVATION_TOOLBAR_ID).toBe('elevation-toolbar');
    });

    it('exposes 7 button definitions', () => {
        expect(ELEVATION_TOOLBAR_BUTTONS.length).toBe(7);
    });

    it('has 3 create + 2 edit + 2 output buttons', () => {
        expect(ELEVATION_TOOLBAR_BUTTONS.filter(b => b.group === 'create').length).toBe(3);
        expect(ELEVATION_TOOLBAR_BUTTONS.filter(b => b.group === 'edit').length).toBe(2);
        expect(ELEVATION_TOOLBAR_BUTTONS.filter(b => b.group === 'output').length).toBe(2);
    });

    it('constructs without throwing', () => {
        expect(() => new ElevationToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new ElevationToolbar(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        expect(new ElevationToolbar(makeRuntime()).element.getAttribute('role')).toBe('toolbar');
    });

    it('element aria-label is "Elevation Tools"', () => {
        expect(new ElevationToolbar(makeRuntime()).element.getAttribute('aria-label')).toBe('Elevation Tools');
    });

    it.each(ELEVATION_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches executeCommand on click',
        (commandType) => {
            const rt      = makeRuntime();
            const toolbar = new ElevationToolbar(rt);
            const btn     = toolbar.element.querySelector(`[data-command="${commandType}"]`) as HTMLButtonElement;
            expect(btn).not.toBeNull();
            btn.click();
            expect(rt.bus.executeCommand).toHaveBeenCalledWith(commandType, expect.any(Object));
        },
    );

    it('triggerCommand() dispatches elevation-interior', () => {
        const rt = makeRuntime();
        new ElevationToolbar(rt).triggerCommand('elevation-interior');
        expect(rt.bus.executeCommand).toHaveBeenCalledWith('elevation-interior', expect.any(Object));
    });

    it('constructs without runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new ElevationToolbar(null)).not.toThrow();
        warn.mockRestore();
    });

    it('button click without runtime — warns, does not throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const t    = new ElevationToolbar(null);
        const btn  = t.element.querySelector('[data-command="elevation-interior"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('renders 2 group separators (between 3 groups)', () => {
        expect(new ElevationToolbar(makeRuntime()).element.querySelectorAll('.eltb-separator').length).toBe(2);
    });

    it('all buttons have aria-label', () => {
        for (const btn of new ElevationToolbar(makeRuntime()).element.querySelectorAll('.eltb-btn')) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('renders exactly 7 buttons', () => {
        expect(new ElevationToolbar(makeRuntime()).element.querySelectorAll('.eltb-btn').length).toBe(7);
    });
});
