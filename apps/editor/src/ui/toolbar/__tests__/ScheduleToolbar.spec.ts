// wave-6-c-d5: Real binding test — ScheduleToolbar
import { describe, expect, it, vi } from 'vitest';
import { ScheduleToolbar, SCHEDULE_TOOLBAR_ID, SCHEDULE_TOOLBAR_BUTTONS } from '../ScheduleToolbar.js';
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

describe('ScheduleToolbar — wave-6-c-d5 binding contract', () => {
    it('SCHEDULE_TOOLBAR_ID is "schedule-toolbar"', () => {
        expect(SCHEDULE_TOOLBAR_ID).toBe('schedule-toolbar');
    });

    it('exposes 8 button definitions', () => {
        expect(SCHEDULE_TOOLBAR_BUTTONS.length).toBe(8);
    });

    it('has 2 create + 1 fields + 1 filters + 1 sort + 2 export + 1 edit buttons', () => {
        expect(SCHEDULE_TOOLBAR_BUTTONS.filter(b => b.group === 'create').length).toBe(2);
        expect(SCHEDULE_TOOLBAR_BUTTONS.filter(b => b.group === 'fields').length).toBe(1);
        expect(SCHEDULE_TOOLBAR_BUTTONS.filter(b => b.group === 'filters').length).toBe(1);
        expect(SCHEDULE_TOOLBAR_BUTTONS.filter(b => b.group === 'sort').length).toBe(1);
        expect(SCHEDULE_TOOLBAR_BUTTONS.filter(b => b.group === 'export').length).toBe(2);
        expect(SCHEDULE_TOOLBAR_BUTTONS.filter(b => b.group === 'edit').length).toBe(1);
    });

    it('constructs without throwing', () => {
        expect(() => new ScheduleToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new ScheduleToolbar(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        expect(new ScheduleToolbar(makeRuntime()).element.getAttribute('role')).toBe('toolbar');
    });

    it('element aria-label is "Schedule Tools"', () => {
        expect(new ScheduleToolbar(makeRuntime()).element.getAttribute('aria-label')).toBe('Schedule Tools');
    });

    it.each(SCHEDULE_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches executeCommand on click',
        (commandType) => {
            const rt      = makeRuntime();
            const toolbar = new ScheduleToolbar(rt);
            const btn     = toolbar.element.querySelector(`[data-command="${commandType}"]`) as HTMLButtonElement;
            expect(btn).not.toBeNull();
            btn.click();
            expect(rt.bus.executeCommand).toHaveBeenCalledWith(commandType, expect.any(Object));
        },
    );

    it('triggerCommand() dispatches schedule-new', () => {
        const rt = makeRuntime();
        new ScheduleToolbar(rt).triggerCommand('schedule-new');
        expect(rt.bus.executeCommand).toHaveBeenCalledWith('schedule-new', expect.any(Object));
    });

    it('constructs without runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new ScheduleToolbar(null)).not.toThrow();
        warn.mockRestore();
    });

    it('button click without runtime — warns, does not throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const t    = new ScheduleToolbar(null);
        const btn  = t.element.querySelector('[data-command="schedule-new"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('renders 5 group separators (between 6 groups)', () => {
        expect(new ScheduleToolbar(makeRuntime()).element.querySelectorAll('.sct-separator').length).toBe(5);
    });

    it('all buttons have aria-label', () => {
        for (const btn of new ScheduleToolbar(makeRuntime()).element.querySelectorAll('.sct-btn')) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('renders exactly 8 buttons', () => {
        expect(new ScheduleToolbar(makeRuntime()).element.querySelectorAll('.sct-btn').length).toBe(8);
    });
});
