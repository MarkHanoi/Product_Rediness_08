// wave-6-c-d6: Real binding test — PlanToolbar
import { describe, expect, it, vi } from 'vitest';
import { PlanToolbar, PLAN_TOOLBAR_ID, PLAN_TOOLBAR_BUTTONS } from '../PlanToolbar.js';
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
        'button "%s" dispatches executeCommand on click',
        (commandType) => {
            const rt      = makeRuntime();
            const toolbar = new PlanToolbar(rt);
            const btn     = toolbar.element.querySelector(`[data-command="${commandType}"]`) as HTMLButtonElement;
            expect(btn).not.toBeNull();
            btn.click();
            expect(rt.bus.executeCommand).toHaveBeenCalledWith(commandType, expect.any(Object));
        },
    );

    it('triggerCommand() dispatches plan-floor', () => {
        const rt = makeRuntime();
        new PlanToolbar(rt).triggerCommand('plan-floor');
        expect(rt.bus.executeCommand).toHaveBeenCalledWith('plan-floor', expect.any(Object));
    });

    it('constructs without runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new PlanToolbar(null)).not.toThrow();
        warn.mockRestore();
    });

    it('button click without runtime — warns, does not throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const t    = new PlanToolbar(null);
        const btn  = t.element.querySelector('[data-command="plan-floor"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warn).toHaveBeenCalled();
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
