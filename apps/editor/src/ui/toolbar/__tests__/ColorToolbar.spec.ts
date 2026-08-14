// wave-6-c-d4: Real binding test — ColorToolbar
import { describe, expect, it, vi } from 'vitest';
import { ColorToolbar, COLOR_TOOLBAR_ID, COLOR_TOOLBAR_BUTTONS } from '../ColorToolbar.js';
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
        'button "%s" dispatches when BACKED, refuses visibly when not',
        (commandType) => {
            const rt      = makeRuntime();
            const toolbar = new ColorToolbar(rt);
            const btn     = toolbar.element.querySelector(`[data-command="${commandType}"]`) as HTMLButtonElement;
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

    it('triggerCommand() dispatches color-fill-by-category when BACKED, refuses when not', () => {
        const rt = makeRuntime();
        new ColorToolbar(rt).triggerCommand('color-fill-by-category');
        // §L-MOUNT Phase 3 — triggerCommand is the PROGRAMMATIC door (keyboard
        // shortcuts). `disabled` cannot guard it, so refuseUnbacked() does.
        if (isBacked('color-fill-by-category')) {
            expect(rt.bus.executeCommand).toHaveBeenCalledWith('color-fill-by-category', expect.any(Object));
        } else {
            expect(rt.bus.executeCommand).not.toHaveBeenCalled();
        }
    });

    it('constructs without runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new ColorToolbar(null)).not.toThrow();
        warn.mockRestore();
    });

    it('button click without runtime — warns when BACKED, is inert when refused', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const t    = new ColorToolbar(null);
        const btn  = t.element.querySelector('[data-command="color-fill-by-category"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        // §L-MOUNT Phase 3 — an UNBACKED verb's button is DISABLED, so the click is inert
        // before the null-runtime path is ever reached. The refusal IS the
        // disabled state, named in the title; there is nothing to warn about.
        if (isBacked('color-fill-by-category')) {
            expect(warn).toHaveBeenCalled();
        } else {
            expect(btn.disabled).toBe(true);
            expect(btn.title).toContain('color-fill-by-category');
        }
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
