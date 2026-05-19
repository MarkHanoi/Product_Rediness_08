// wave-6-c-d2: Real binding test — LayerToolbar
import { describe, expect, it, vi } from 'vitest';
import { LayerToolbar, LAYER_TOOLBAR_ID, LAYER_TOOLBAR_BUTTONS } from '../LayerToolbar.js';
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

describe('LayerToolbar — wave-6-c-d2 binding contract', () => {
    it('has the correct LAYER_TOOLBAR_ID constant', () => {
        expect(LAYER_TOOLBAR_ID).toBe('layer-toolbar');
    });

    it('exposes 7 button definitions', () => {
        expect(LAYER_TOOLBAR_BUTTONS.length).toBe(7);
    });

    it('constructs without throwing', () => {
        expect(() => new LayerToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new LayerToolbar(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        expect(new LayerToolbar(makeRuntime()).element.getAttribute('role')).toBe('toolbar');
    });

    it.each(LAYER_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches executeCommand',
        (commandType) => {
            const rt = makeRuntime();
            const toolbar = new LayerToolbar(rt);
            const btn = toolbar.element.querySelector(`[data-command="${commandType}"]`) as HTMLButtonElement;
            expect(btn).not.toBeNull();
            btn.click();
            expect(rt.bus.executeCommand).toHaveBeenCalledWith(commandType, expect.any(Object));
        },
    );

    it('triggerCommand() dispatches via runtime.bus.executeCommand', () => {
        const rt = makeRuntime();
        const toolbar = new LayerToolbar(rt);
        toolbar.triggerCommand('new-layer');
        expect(rt.bus.executeCommand).toHaveBeenCalledWith('new-layer', expect.any(Object));
    });

    it('constructs without runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new LayerToolbar(null)).not.toThrow();
        warn.mockRestore();
    });

    it('button click without runtime logs warning, does not throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const toolbar = new LayerToolbar(null);
        const btn = toolbar.element.querySelector('[data-command="new-layer"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('renders group separators', () => {
        expect(new LayerToolbar(makeRuntime()).element.querySelectorAll('.lt-separator').length).toBeGreaterThan(0);
    });

    it('all buttons have aria-label', () => {
        const toolbar = new LayerToolbar(makeRuntime());
        for (const btn of toolbar.element.querySelectorAll('.lt-btn')) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('renders exactly 7 buttons', () => {
        expect(new LayerToolbar(makeRuntime()).element.querySelectorAll('.lt-btn').length).toBe(7);
    });
});
