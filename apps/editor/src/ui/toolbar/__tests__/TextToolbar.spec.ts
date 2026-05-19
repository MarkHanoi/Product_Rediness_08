// wave-6-c-d3: Real binding test — TextToolbar
import { describe, expect, it, vi } from 'vitest';
import { TextToolbar, TEXT_TOOLBAR_ID, TEXT_TOOLBAR_BUTTONS } from '../TextToolbar.js';
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

describe('TextToolbar — wave-6-c-d3 binding contract', () => {
    it('TEXT_TOOLBAR_ID is "text-toolbar"', () => {
        expect(TEXT_TOOLBAR_ID).toBe('text-toolbar');
    });

    it('exposes 8 button definitions', () => {
        expect(TEXT_TOOLBAR_BUTTONS.length).toBe(8);
    });

    it('has 2 place + 4 format + 2 edit buttons', () => {
        expect(TEXT_TOOLBAR_BUTTONS.filter(b => b.group === 'place').length).toBe(2);
        expect(TEXT_TOOLBAR_BUTTONS.filter(b => b.group === 'format').length).toBe(4);
        expect(TEXT_TOOLBAR_BUTTONS.filter(b => b.group === 'edit').length).toBe(2);
    });

    it('constructs without throwing', () => {
        expect(() => new TextToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new TextToolbar(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        expect(new TextToolbar(makeRuntime()).element.getAttribute('role')).toBe('toolbar');
    });

    it.each(TEXT_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches executeCommand on click',
        (commandType) => {
            const rt      = makeRuntime();
            const toolbar = new TextToolbar(rt);
            const btn     = toolbar.element.querySelector(`[data-command="${commandType}"]`) as HTMLButtonElement;
            expect(btn).not.toBeNull();
            btn.click();
            expect(rt.bus.executeCommand).toHaveBeenCalledWith(commandType, expect.any(Object));
        },
    );

    it('triggerCommand() dispatches text-place', () => {
        const rt = makeRuntime();
        new TextToolbar(rt).triggerCommand('text-place');
        expect(rt.bus.executeCommand).toHaveBeenCalledWith('text-place', expect.any(Object));
    });

    it('constructs without runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new TextToolbar(null)).not.toThrow();
        warn.mockRestore();
    });

    it('button click without runtime — warns, does not throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const t    = new TextToolbar(null);
        const btn  = t.element.querySelector('[data-command="text-place"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('renders 2 group separators (between 3 groups)', () => {
        expect(new TextToolbar(makeRuntime()).element.querySelectorAll('.tt-separator').length).toBe(2);
    });

    it('all buttons have aria-label', () => {
        for (const btn of new TextToolbar(makeRuntime()).element.querySelectorAll('.tt-btn')) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('renders exactly 8 buttons', () => {
        expect(new TextToolbar(makeRuntime()).element.querySelectorAll('.tt-btn').length).toBe(8);
    });
});
