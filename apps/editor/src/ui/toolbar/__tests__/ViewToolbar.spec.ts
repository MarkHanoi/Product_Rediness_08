// wave-6-c-d2: Real binding test — ViewToolbar
import { describe, expect, it, vi } from 'vitest';
import { ViewToolbar, VIEW_TOOLBAR_ID, VIEW_TOOLBAR_BUTTONS } from '../ViewToolbar.js';
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

describe('ViewToolbar — wave-6-c-d2 binding contract', () => {
    it('has the correct VIEW_TOOLBAR_ID constant', () => {
        expect(VIEW_TOOLBAR_ID).toBe('view-toolbar');
    });

    it('exposes 9 button definitions', () => {
        expect(VIEW_TOOLBAR_BUTTONS.length).toBe(9);
    });

    it('constructs without throwing', () => {
        expect(() => new ViewToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new ViewToolbar(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        expect(new ViewToolbar(makeRuntime()).element.getAttribute('role')).toBe('toolbar');
    });

    it.each(VIEW_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches when BACKED, refuses visibly when not',
        (commandType) => {
            const rt = makeRuntime();
            const toolbar = new ViewToolbar(rt);
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
        const toolbar = new ViewToolbar(rt);
        toolbar.triggerCommand('view-3d');
        // §L-MOUNT Phase 3 — triggerCommand is the PROGRAMMATIC door (keyboard
        // shortcuts). `disabled` cannot guard it, so refuseUnbacked() does.
        if (isBacked('view-3d')) {
            expect(rt.bus.executeCommand).toHaveBeenCalledWith('view-3d', expect.any(Object));
        } else {
            expect(rt.bus.executeCommand).not.toHaveBeenCalled();
        }
    });

    it('constructs without runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new ViewToolbar(null)).not.toThrow();
        warn.mockRestore();
    });

    it('button click without runtime logs warning, does not throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const toolbar = new ViewToolbar(null);
        const btn = toolbar.element.querySelector('[data-command="view-3d"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        // §L-MOUNT Phase 3 — an UNBACKED verb's button is DISABLED, so the click is inert
        // before the null-runtime path is ever reached. The refusal IS the
        // disabled state, named in the title; there is nothing to warn about.
        if (isBacked('view-3d')) {
            expect(warn).toHaveBeenCalled();
        } else {
            expect(btn.disabled).toBe(true);
            expect(btn.title).toContain('view-3d');
        }
        warn.mockRestore();
    });

    it('renders group separators between camera/render/output groups', () => {
        expect(new ViewToolbar(makeRuntime()).element.querySelectorAll('.vt-separator').length).toBeGreaterThan(0);
    });

    it('all buttons have aria-label', () => {
        const toolbar = new ViewToolbar(makeRuntime());
        for (const btn of toolbar.element.querySelectorAll('.vt-btn')) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('renders exactly 9 buttons', () => {
        expect(new ViewToolbar(makeRuntime()).element.querySelectorAll('.vt-btn').length).toBe(9);
    });
});
