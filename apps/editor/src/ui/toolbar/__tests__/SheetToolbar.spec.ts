// wave-6-c-d5: Real binding test — SheetToolbar
import { describe, expect, it, vi } from 'vitest';
import { SheetToolbar, SHEET_TOOLBAR_ID, SHEET_TOOLBAR_BUTTONS } from '../SheetToolbar.js';
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

describe('SheetToolbar — wave-6-c-d5 binding contract', () => {
    it('SHEET_TOOLBAR_ID is "sheet-toolbar"', () => {
        expect(SHEET_TOOLBAR_ID).toBe('sheet-toolbar');
    });

    it('exposes 7 button definitions', () => {
        expect(SHEET_TOOLBAR_BUTTONS.length).toBe(7);
    });

    it('has 2 create + 2 content + 1 revision + 2 output buttons', () => {
        expect(SHEET_TOOLBAR_BUTTONS.filter(b => b.group === 'create').length).toBe(2);
        expect(SHEET_TOOLBAR_BUTTONS.filter(b => b.group === 'content').length).toBe(2);
        expect(SHEET_TOOLBAR_BUTTONS.filter(b => b.group === 'revision').length).toBe(1);
        expect(SHEET_TOOLBAR_BUTTONS.filter(b => b.group === 'output').length).toBe(2);
    });

    it('constructs without throwing', () => {
        expect(() => new SheetToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new SheetToolbar(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        expect(new SheetToolbar(makeRuntime()).element.getAttribute('role')).toBe('toolbar');
    });

    it('element aria-label is "Sheet Tools"', () => {
        expect(new SheetToolbar(makeRuntime()).element.getAttribute('aria-label')).toBe('Sheet Tools');
    });

    it.each(SHEET_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches when BACKED, refuses visibly when not',
        (commandType) => {
            const rt      = makeRuntime();
            const toolbar = new SheetToolbar(rt);
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

    it('triggerCommand() dispatches sheet-new when BACKED, refuses when not', () => {
        const rt = makeRuntime();
        new SheetToolbar(rt).triggerCommand('sheet-new');
        // §L-MOUNT Phase 3 — triggerCommand is the PROGRAMMATIC door (keyboard
        // shortcuts). `disabled` cannot guard it, so refuseUnbacked() does.
        if (isBacked('sheet-new')) {
            expect(rt.bus.executeCommand).toHaveBeenCalledWith('sheet-new', expect.any(Object));
        } else {
            expect(rt.bus.executeCommand).not.toHaveBeenCalled();
        }
    });

    it('constructs without runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new SheetToolbar(null)).not.toThrow();
        warn.mockRestore();
    });

    it('button click without runtime — warns when BACKED, is inert when refused', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const t    = new SheetToolbar(null);
        const btn  = t.element.querySelector('[data-command="sheet-new"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        // §L-MOUNT Phase 3 — an UNBACKED verb's button is DISABLED, so the click is inert
        // before the null-runtime path is ever reached. The refusal IS the
        // disabled state, named in the title; there is nothing to warn about.
        if (isBacked('sheet-new')) {
            expect(warn).toHaveBeenCalled();
        } else {
            expect(btn.disabled).toBe(true);
            expect(btn.title).toContain('sheet-new');
        }
        warn.mockRestore();
    });

    it('renders 3 group separators (between 4 groups)', () => {
        expect(new SheetToolbar(makeRuntime()).element.querySelectorAll('.sht-separator').length).toBe(3);
    });

    it('all buttons have aria-label', () => {
        for (const btn of new SheetToolbar(makeRuntime()).element.querySelectorAll('.sht-btn')) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('renders exactly 7 buttons', () => {
        expect(new SheetToolbar(makeRuntime()).element.querySelectorAll('.sht-btn').length).toBe(7);
    });
});
