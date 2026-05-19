// wave-6-c-d3: Real binding test — DimensionToolbar
import { describe, expect, it, vi } from 'vitest';
import { DimensionToolbar, DIMENSION_TOOLBAR_ID, DIMENSION_TOOLBAR_BUTTONS } from '../DimensionToolbar.js';
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

describe('DimensionToolbar — wave-6-c-d3 binding contract', () => {
    it('DIMENSION_TOOLBAR_ID is "dimension-toolbar"', () => {
        expect(DIMENSION_TOOLBAR_ID).toBe('dimension-toolbar');
    });

    it('exposes 11 button definitions', () => {
        expect(DIMENSION_TOOLBAR_BUTTONS.length).toBe(11);
    });

    it('has 6 place + 3 modify + 2 witness buttons', () => {
        expect(DIMENSION_TOOLBAR_BUTTONS.filter(b => b.group === 'place').length).toBe(6);
        expect(DIMENSION_TOOLBAR_BUTTONS.filter(b => b.group === 'modify').length).toBe(3);
        expect(DIMENSION_TOOLBAR_BUTTONS.filter(b => b.group === 'witness').length).toBe(2);
    });

    it('constructs without throwing', () => {
        expect(() => new DimensionToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new DimensionToolbar(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        expect(new DimensionToolbar(makeRuntime()).element.getAttribute('role')).toBe('toolbar');
    });

    it.each(DIMENSION_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches executeCommand on click',
        (commandType) => {
            const rt      = makeRuntime();
            const toolbar = new DimensionToolbar(rt);
            const btn     = toolbar.element.querySelector(`[data-command="${commandType}"]`) as HTMLButtonElement;
            expect(btn).not.toBeNull();
            btn.click();
            expect(rt.bus.executeCommand).toHaveBeenCalledWith(commandType, expect.any(Object));
        },
    );

    it('triggerCommand() dispatches dimension-aligned', () => {
        const rt = makeRuntime();
        new DimensionToolbar(rt).triggerCommand('dimension-aligned');
        expect(rt.bus.executeCommand).toHaveBeenCalledWith('dimension-aligned', expect.any(Object));
    });

    it('constructs without runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new DimensionToolbar(null)).not.toThrow();
        warn.mockRestore();
    });

    it('button click without runtime — warns, does not throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const t    = new DimensionToolbar(null);
        const btn  = t.element.querySelector('[data-command="dimension-aligned"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('renders 2 group separators (between 3 groups)', () => {
        expect(new DimensionToolbar(makeRuntime()).element.querySelectorAll('.dt-separator').length).toBe(2);
    });

    it('all buttons have aria-label', () => {
        for (const btn of new DimensionToolbar(makeRuntime()).element.querySelectorAll('.dt-btn')) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('renders exactly 11 buttons', () => {
        expect(new DimensionToolbar(makeRuntime()).element.querySelectorAll('.dt-btn').length).toBe(11);
    });
});
