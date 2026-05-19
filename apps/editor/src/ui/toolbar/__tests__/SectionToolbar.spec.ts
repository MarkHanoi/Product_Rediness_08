// wave-6-c-d6: Real binding test — SectionToolbar
import { describe, expect, it, vi } from 'vitest';
import { SectionToolbar, SECTION_TOOLBAR_ID, SECTION_TOOLBAR_BUTTONS } from '../SectionToolbar.js';
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

describe('SectionToolbar — wave-6-c-d6 binding contract', () => {
    it('SECTION_TOOLBAR_ID is "section-toolbar"', () => {
        expect(SECTION_TOOLBAR_ID).toBe('section-toolbar');
    });

    it('exposes 7 button definitions', () => {
        expect(SECTION_TOOLBAR_BUTTONS.length).toBe(7);
    });

    it('has 2 create + 3 edit + 2 output buttons', () => {
        expect(SECTION_TOOLBAR_BUTTONS.filter(b => b.group === 'create').length).toBe(2);
        expect(SECTION_TOOLBAR_BUTTONS.filter(b => b.group === 'edit').length).toBe(3);
        expect(SECTION_TOOLBAR_BUTTONS.filter(b => b.group === 'output').length).toBe(2);
    });

    it('constructs without throwing', () => {
        expect(() => new SectionToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new SectionToolbar(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        expect(new SectionToolbar(makeRuntime()).element.getAttribute('role')).toBe('toolbar');
    });

    it('element aria-label is "Section Tools"', () => {
        expect(new SectionToolbar(makeRuntime()).element.getAttribute('aria-label')).toBe('Section Tools');
    });

    it.each(SECTION_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches executeCommand on click',
        (commandType) => {
            const rt      = makeRuntime();
            const toolbar = new SectionToolbar(rt);
            const btn     = toolbar.element.querySelector(`[data-command="${commandType}"]`) as HTMLButtonElement;
            expect(btn).not.toBeNull();
            btn.click();
            expect(rt.bus.executeCommand).toHaveBeenCalledWith(commandType, expect.any(Object));
        },
    );

    it('triggerCommand() dispatches section-new', () => {
        const rt = makeRuntime();
        new SectionToolbar(rt).triggerCommand('section-new');
        expect(rt.bus.executeCommand).toHaveBeenCalledWith('section-new', expect.any(Object));
    });

    it('constructs without runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new SectionToolbar(null)).not.toThrow();
        warn.mockRestore();
    });

    it('button click without runtime — warns, does not throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const t    = new SectionToolbar(null);
        const btn  = t.element.querySelector('[data-command="section-new"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('renders 2 group separators (between 3 groups)', () => {
        expect(new SectionToolbar(makeRuntime()).element.querySelectorAll('.stb-separator').length).toBe(2);
    });

    it('all buttons have aria-label', () => {
        for (const btn of new SectionToolbar(makeRuntime()).element.querySelectorAll('.stb-btn')) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('renders exactly 7 buttons', () => {
        expect(new SectionToolbar(makeRuntime()).element.querySelectorAll('.stb-btn').length).toBe(7);
    });
});
