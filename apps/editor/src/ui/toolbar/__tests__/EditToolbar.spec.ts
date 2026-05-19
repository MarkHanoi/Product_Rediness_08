// wave-6-c-d2: Real binding test — EditToolbar
import { describe, expect, it, vi } from 'vitest';
import { EditToolbar, EDIT_TOOLBAR_ID, EDIT_TOOLBAR_BUTTONS } from '../EditToolbar.js';
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

describe('EditToolbar — wave-6-c-d2 binding contract', () => {
    it('has the correct EDIT_TOOLBAR_ID constant', () => {
        expect(EDIT_TOOLBAR_ID).toBe('edit-toolbar');
    });

    it('exposes 14 button definitions', () => {
        expect(EDIT_TOOLBAR_BUTTONS.length).toBe(14);
    });

    it('constructs without throwing', () => {
        expect(() => new EditToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new EditToolbar(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        expect(new EditToolbar(makeRuntime()).element.getAttribute('role')).toBe('toolbar');
    });

    it.each(EDIT_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches executeCommand',
        (commandType) => {
            const rt = makeRuntime();
            const toolbar = new EditToolbar(rt);
            const btn = toolbar.element.querySelector(`[data-command="${commandType}"]`) as HTMLButtonElement;
            expect(btn).not.toBeNull();
            btn.click();
            expect(rt.bus.executeCommand).toHaveBeenCalledWith(commandType, expect.any(Object));
        },
    );

    it('triggerCommand() dispatches via runtime.bus.executeCommand', () => {
        const rt = makeRuntime();
        const toolbar = new EditToolbar(rt);
        toolbar.triggerCommand('move-selection');
        expect(rt.bus.executeCommand).toHaveBeenCalledWith('move-selection', expect.any(Object));
    });

    it('constructs without runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new EditToolbar(null)).not.toThrow();
        warn.mockRestore();
    });

    it('button click without runtime logs warning, does not throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const toolbar = new EditToolbar(null);
        const btn = toolbar.element.querySelector('[data-command="move-selection"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('renders group separators', () => {
        expect(new EditToolbar(makeRuntime()).element.querySelectorAll('.et-separator').length).toBeGreaterThan(0);
    });

    it('all buttons have aria-label', () => {
        const toolbar = new EditToolbar(makeRuntime());
        for (const btn of toolbar.element.querySelectorAll('.et-btn')) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('renders exactly 14 buttons', () => {
        expect(new EditToolbar(makeRuntime()).element.querySelectorAll('.et-btn').length).toBe(14);
    });
});
