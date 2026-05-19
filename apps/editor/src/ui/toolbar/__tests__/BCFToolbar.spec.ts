// wave-6-c-d10: Real binding test — BCFToolbar
import { describe, expect, it, vi } from 'vitest';
import { BCFToolbar, BCF_TOOLBAR_ID, BCF_TOOLBAR_BUTTONS } from '../BCFToolbar.js';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

function makeBusMock() {
    return { executeCommand: vi.fn(), register: vi.fn(() => ({ dispose: vi.fn() })), registry: new Map() };
}
function makeRuntime() { return { bus: makeBusMock() } as unknown as PryzmRuntime; }

describe('BCFToolbar — wave-6-c-d10 binding contract', () => {
    it('has the correct BCF_TOOLBAR_ID constant', () => {
        expect(BCF_TOOLBAR_ID).toBe('bcf-toolbar');
    });

    it('exposes 11 button definitions', () => {
        expect(BCF_TOOLBAR_BUTTONS.length).toBe(11);
    });

    it('contains bcf-issue-new command', () => {
        expect(BCF_TOOLBAR_BUTTONS.map(b => b.commandType)).toContain('bcf-issue-new');
    });

    it('contains bcf-export command', () => {
        expect(BCF_TOOLBAR_BUTTONS.map(b => b.commandType)).toContain('bcf-export');
    });

    it('contains bcf-import command', () => {
        expect(BCF_TOOLBAR_BUTTONS.map(b => b.commandType)).toContain('bcf-import');
    });

    it('constructs without throwing', () => {
        expect(() => new BCFToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        expect(new BCFToolbar(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        expect(new BCFToolbar(makeRuntime()).element.getAttribute('role')).toBe('toolbar');
    });

    it('element has aria-label="BCF toolbar"', () => {
        expect(new BCFToolbar(makeRuntime()).element.getAttribute('aria-label')).toBe('BCF toolbar');
    });

    it.each(BCF_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches executeCommand',
        (commandType) => {
            const runtime = makeRuntime();
            const toolbar = new BCFToolbar(runtime);
            const btn = toolbar.element.querySelector(`[data-command="${commandType}"]`) as HTMLButtonElement;
            expect(btn).not.toBeNull();
            btn.click();
            expect(runtime.bus.executeCommand).toHaveBeenCalledWith(commandType, expect.any(Object));
        },
    );

    it('triggerCommand() dispatches via runtime.bus.executeCommand', () => {
        const runtime = makeRuntime();
        const toolbar = new BCFToolbar(runtime);
        toolbar.triggerCommand('bcf-issue-new');
        expect(runtime.bus.executeCommand).toHaveBeenCalledWith('bcf-issue-new', expect.any(Object));
    });

    it('triggerCommand() for unknown command is a noop', () => {
        expect(() => new BCFToolbar(makeRuntime()).triggerCommand('unknown-cmd')).not.toThrow();
    });

    it('renders group separators', () => {
        expect(new BCFToolbar(makeRuntime()).element.querySelectorAll('.bcftb-separator').length).toBeGreaterThan(0);
    });

    it('renders exactly 11 buttons in the DOM', () => {
        expect(new BCFToolbar(makeRuntime()).element.querySelectorAll('[data-command]').length).toBe(11);
    });

    it('all buttons have aria-label attributes', () => {
        for (const btn of new BCFToolbar(makeRuntime()).element.querySelectorAll('.bcftb-btn')) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('all button icons have aria-hidden="true"', () => {
        for (const icon of new BCFToolbar(makeRuntime()).element.querySelectorAll('.bcftb-btn-icon')) {
            expect(icon.getAttribute('aria-hidden')).toBe('true');
        }
    });

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new BCFToolbar(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('button click without runtime logs warning, does not throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const btn = new BCFToolbar(null).element.querySelector('[data-command="bcf-issue-new"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});
