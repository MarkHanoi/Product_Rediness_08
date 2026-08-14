// wave-6-c-d2: Real binding test — LayerToolbar
import { describe, expect, it, vi } from 'vitest';
import { LayerToolbar, LAYER_TOOLBAR_ID, LAYER_TOOLBAR_BUTTONS } from '../LayerToolbar.js';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import { isBacked } from '../commandBacking.js';

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
        'button "%s" dispatches when BACKED, refuses visibly when not',
        (commandType) => {
            const rt = makeRuntime();
            const toolbar = new LayerToolbar(rt);
            const btn = toolbar.element.querySelector(`[data-command="${commandType}"]`) as HTMLButtonElement;
            expect(btn).not.toBeNull();
            btn.click();
            // §L-MOUNT Phase 3 — THE CONTRACT CHANGED, and it changed because the old
            // one was false. These specs used to assert that EVERY button dispatches;
            // the H6 probe + the Phase-1 census measured that 276 of the 280 declared
            // verbs have no handler anywhere, so "dispatches" meant "dispatches into
            // nothing" — the §C-B1 silent no-op, asserted as a feature. A backed verb
            // must still dispatch; an unbacked one must REFUSE, visibly.
            if (isBacked(commandType)) {
                expect(btn.disabled).toBe(false);
                expect(rt.bus.executeCommand).toHaveBeenCalledWith(commandType, expect.any(Object));
            } else {
                expect(btn.disabled).toBe(true);
                expect(btn.getAttribute('data-unbacked')).toBe('1');
                expect(btn.getAttribute('aria-disabled')).toBe('true');
                expect(btn.title).toContain(commandType);
                expect(rt.bus.executeCommand).not.toHaveBeenCalled();
            }
        },
    );

    it('triggerCommand() dispatches when BACKED, refuses when not', () => {
        const rt = makeRuntime();
        const toolbar = new LayerToolbar(rt);
        toolbar.triggerCommand('new-layer');
        // §L-MOUNT Phase 3 — triggerCommand is the PROGRAMMATIC door (keyboard
        // shortcuts). `disabled` cannot guard it, so refuseUnbacked() does.
        if (isBacked('new-layer')) {
            expect(rt.bus.executeCommand).toHaveBeenCalledWith('new-layer', expect.any(Object));
        } else {
            expect(rt.bus.executeCommand).not.toHaveBeenCalled();
        }
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
        // §L-MOUNT Phase 3 — an UNBACKED verb's button is DISABLED, so the click is inert
        // before the null-runtime path is ever reached. The refusal IS the
        // disabled state, named in the title; there is nothing to warn about.
        if (isBacked('new-layer')) {
            expect(warn).toHaveBeenCalled();
        } else {
            expect(btn.disabled).toBe(true);
            expect(btn.title).toContain('new-layer');
        }
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
