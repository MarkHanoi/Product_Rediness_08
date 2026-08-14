// wave-6-c-d2: Real binding test — EditToolbar
import { describe, expect, it, vi } from 'vitest';
import { EditToolbar, EDIT_TOOLBAR_ID, EDIT_TOOLBAR_BUTTONS } from '../EditToolbar.js';
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
        'button "%s" dispatches when BACKED, refuses visibly when not',
        (commandType) => {
            const rt = makeRuntime();
            const toolbar = new EditToolbar(rt);
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
        const toolbar = new EditToolbar(rt);
        toolbar.triggerCommand('move-selection');
        // §L-MOUNT Phase 3 — triggerCommand is the PROGRAMMATIC door (keyboard
        // shortcuts). `disabled` cannot guard it, so refuseUnbacked() does.
        if (isBacked('move-selection')) {
            expect(rt.bus.executeCommand).toHaveBeenCalledWith('move-selection', expect.any(Object));
        } else {
            expect(rt.bus.executeCommand).not.toHaveBeenCalled();
        }
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
        // §L-MOUNT Phase 3 — an UNBACKED verb's button is DISABLED, so the click is inert
        // before the null-runtime path is ever reached. The refusal IS the
        // disabled state, named in the title; there is nothing to warn about.
        if (isBacked('move-selection')) {
            expect(warn).toHaveBeenCalled();
        } else {
            expect(btn.disabled).toBe(true);
            expect(btn.title).toContain('move-selection');
        }
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
