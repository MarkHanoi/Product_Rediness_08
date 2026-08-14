// wave-6-c-d6: Real binding test — PlanToolbar
import { describe, expect, it, vi } from 'vitest';
import { PlanToolbar, PLAN_TOOLBAR_ID, PLAN_TOOLBAR_BUTTONS } from '../PlanToolbar.js';
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

describe('PlanToolbar — wave-6-c-d6 binding contract', () => {
    it('PLAN_TOOLBAR_ID is "plan-toolbar"', () => {
        expect(PLAN_TOOLBAR_ID).toBe('plan-toolbar');
    });

    it('exposes 7 button definitions', () => {
        expect(PLAN_TOOLBAR_BUTTONS.length).toBe(7);
    });

    it('has 3 create + 2 edit + 2 display buttons', () => {
        expect(PLAN_TOOLBAR_BUTTONS.filter(b => b.group === 'create').length).toBe(3);
        expect(PLAN_TOOLBAR_BUTTONS.filter(b => b.group === 'edit').length).toBe(2);
        expect(PLAN_TOOLBAR_BUTTONS.filter(b => b.group === 'display').length).toBe(2);
    });

    it('constructs without throwing', () => {
        expect(() => new PlanToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new PlanToolbar(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        expect(new PlanToolbar(makeRuntime()).element.getAttribute('role')).toBe('toolbar');
    });

    it('element aria-label is "Plan Tools"', () => {
        expect(new PlanToolbar(makeRuntime()).element.getAttribute('aria-label')).toBe('Plan Tools');
    });

    it.each(PLAN_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches when BACKED, refuses visibly when not',
        (commandType) => {
            const rt      = makeRuntime();
            const toolbar = new PlanToolbar(rt);
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

    it('triggerCommand() dispatches plan-floor when BACKED, refuses when not', () => {
        const rt = makeRuntime();
        new PlanToolbar(rt).triggerCommand('plan-floor');
        // §L-MOUNT Phase 3 — triggerCommand is the PROGRAMMATIC door (keyboard
        // shortcuts). `disabled` cannot guard it, so refuseUnbacked() does.
        if (isBacked('plan-floor')) {
            expect(rt.bus.executeCommand).toHaveBeenCalledWith('plan-floor', expect.any(Object));
        } else {
            expect(rt.bus.executeCommand).not.toHaveBeenCalled();
        }
    });

    it('constructs without runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new PlanToolbar(null)).not.toThrow();
        warn.mockRestore();
    });

    it('button click without runtime — warns when BACKED, is inert when refused', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const t    = new PlanToolbar(null);
        const btn  = t.element.querySelector('[data-command="plan-floor"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        // §L-MOUNT Phase 3 — an UNBACKED verb's button is DISABLED, so the click is inert
        // before the null-runtime path is ever reached. The refusal IS the
        // disabled state, named in the title; there is nothing to warn about.
        if (isBacked('plan-floor')) {
            expect(warn).toHaveBeenCalled();
        } else {
            expect(btn.disabled).toBe(true);
            expect(btn.title).toContain('plan-floor');
        }
        warn.mockRestore();
    });

    it('renders 2 group separators (between 3 groups)', () => {
        expect(new PlanToolbar(makeRuntime()).element.querySelectorAll('.pltb-separator').length).toBe(2);
    });

    it('all buttons have aria-label', () => {
        for (const btn of new PlanToolbar(makeRuntime()).element.querySelectorAll('.pltb-btn')) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('renders exactly 7 buttons', () => {
        expect(new PlanToolbar(makeRuntime()).element.querySelectorAll('.pltb-btn').length).toBe(7);
    });
});
