// wave-6-c-d3: Real binding test — AnnotationToolbar
import { describe, expect, it, vi } from 'vitest';
import { AnnotationToolbar, ANNOTATION_TOOLBAR_ID, ANNOTATION_TOOLBAR_BUTTONS } from '../AnnotationToolbar.js';
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

describe('AnnotationToolbar — wave-6-c-d3 binding contract', () => {
    it('ANNOTATION_TOOLBAR_ID is "annotation-toolbar"', () => {
        expect(ANNOTATION_TOOLBAR_ID).toBe('annotation-toolbar');
    });

    it('exposes 10 button definitions', () => {
        expect(ANNOTATION_TOOLBAR_BUTTONS.length).toBe(10);
    });

    it('has 5 tag + 2 spot + 3 fill-cloud buttons', () => {
        expect(ANNOTATION_TOOLBAR_BUTTONS.filter(b => b.group === 'tag').length).toBe(5);
        expect(ANNOTATION_TOOLBAR_BUTTONS.filter(b => b.group === 'spot').length).toBe(2);
        expect(ANNOTATION_TOOLBAR_BUTTONS.filter(b => b.group === 'fill-cloud').length).toBe(3);
    });

    it('constructs without throwing', () => {
        expect(() => new AnnotationToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new AnnotationToolbar(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        expect(new AnnotationToolbar(makeRuntime()).element.getAttribute('role')).toBe('toolbar');
    });

    it.each(ANNOTATION_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches when BACKED, refuses visibly when not',
        (commandType) => {
            const rt      = makeRuntime();
            const toolbar = new AnnotationToolbar(rt);
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

    it('triggerCommand() dispatches tag-all-elements when BACKED, refuses when not', () => {
        const rt = makeRuntime();
        new AnnotationToolbar(rt).triggerCommand('tag-all-elements');
        // §L-MOUNT Phase 3 — triggerCommand is the PROGRAMMATIC door (keyboard
        // shortcuts). `disabled` cannot guard it, so refuseUnbacked() does.
        if (isBacked('tag-all-elements')) {
            expect(rt.bus.executeCommand).toHaveBeenCalledWith('tag-all-elements', expect.any(Object));
        } else {
            expect(rt.bus.executeCommand).not.toHaveBeenCalled();
        }
    });

    it('constructs without runtime — no throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new AnnotationToolbar(null)).not.toThrow();
        warn.mockRestore();
    });

    it('button click without runtime — warns when BACKED, is inert when refused', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const t    = new AnnotationToolbar(null);
        const btn  = t.element.querySelector('[data-command="tag-all-elements"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        // §L-MOUNT Phase 3 — an UNBACKED verb's button is DISABLED, so the click is inert
        // before the null-runtime path is ever reached. The refusal IS the
        // disabled state, named in the title; there is nothing to warn about.
        if (isBacked('tag-all-elements')) {
            expect(warn).toHaveBeenCalled();
        } else {
            expect(btn.disabled).toBe(true);
            expect(btn.title).toContain('tag-all-elements');
        }
        warn.mockRestore();
    });

    it('renders 2 group separators (between 3 groups)', () => {
        expect(new AnnotationToolbar(makeRuntime()).element.querySelectorAll('.at-separator').length).toBe(2);
    });

    it('all buttons have aria-label', () => {
        for (const btn of new AnnotationToolbar(makeRuntime()).element.querySelectorAll('.at-btn')) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('renders exactly 10 buttons', () => {
        expect(new AnnotationToolbar(makeRuntime()).element.querySelectorAll('.at-btn').length).toBe(10);
    });
});
