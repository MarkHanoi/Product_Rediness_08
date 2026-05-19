// wave-6-c-d10: Real binding test — CDEToolbar
import { describe, expect, it, vi } from 'vitest';
import { CDEToolbar, CDE_TOOLBAR_ID, CDE_TOOLBAR_BUTTONS } from '../CDEToolbar.js';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

function makeBusMock() {
    return { executeCommand: vi.fn(), register: vi.fn(() => ({ dispose: vi.fn() })), registry: new Map() };
}
function makeRuntime() { return { bus: makeBusMock() } as unknown as PryzmRuntime; }

describe('CDEToolbar — wave-6-c-d10 binding contract', () => {
    it('has the correct CDE_TOOLBAR_ID constant', () => {
        expect(CDE_TOOLBAR_ID).toBe('cde-toolbar');
    });

    it('exposes 11 button definitions', () => {
        expect(CDE_TOOLBAR_BUTTONS.length).toBe(11);
    });

    it('contains cde-upload-doc command', () => {
        expect(CDE_TOOLBAR_BUTTONS.map(b => b.commandType)).toContain('cde-upload-doc');
    });

    it('contains cde-transmittal-create command', () => {
        expect(CDE_TOOLBAR_BUTTONS.map(b => b.commandType)).toContain('cde-transmittal-create');
    });

    it('constructs without throwing', () => {
        expect(() => new CDEToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        expect(new CDEToolbar(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        expect(new CDEToolbar(makeRuntime()).element.getAttribute('role')).toBe('toolbar');
    });

    it('element has aria-label="CDE toolbar"', () => {
        expect(new CDEToolbar(makeRuntime()).element.getAttribute('aria-label')).toBe('CDE toolbar');
    });

    it.each(CDE_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches executeCommand',
        (commandType) => {
            const runtime = makeRuntime();
            const toolbar = new CDEToolbar(runtime);
            const btn = toolbar.element.querySelector(`[data-command="${commandType}"]`) as HTMLButtonElement;
            expect(btn).not.toBeNull();
            btn.click();
            expect(runtime.bus.executeCommand).toHaveBeenCalledWith(commandType, expect.any(Object));
        },
    );

    it('triggerCommand() dispatches via runtime.bus.executeCommand', () => {
        const runtime = makeRuntime();
        const toolbar = new CDEToolbar(runtime);
        toolbar.triggerCommand('cde-upload-doc');
        expect(runtime.bus.executeCommand).toHaveBeenCalledWith('cde-upload-doc', expect.any(Object));
    });

    it('triggerCommand() for unknown command is a noop (no throw)', () => {
        expect(() => new CDEToolbar(makeRuntime()).triggerCommand('unknown-cmd')).not.toThrow();
    });

    it('renders group separators', () => {
        expect(new CDEToolbar(makeRuntime()).element.querySelectorAll('.cdetb-separator').length).toBeGreaterThan(0);
    });

    it('renders exactly 11 buttons in the DOM', () => {
        expect(new CDEToolbar(makeRuntime()).element.querySelectorAll('[data-command]').length).toBe(11);
    });

    it('all buttons have aria-label attributes', () => {
        for (const btn of new CDEToolbar(makeRuntime()).element.querySelectorAll('.cdetb-btn')) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('all button icons have aria-hidden="true"', () => {
        for (const icon of new CDEToolbar(makeRuntime()).element.querySelectorAll('.cdetb-btn-icon')) {
            expect(icon.getAttribute('aria-hidden')).toBe('true');
        }
    });

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new CDEToolbar(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('button click without runtime logs warning, does not throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const btn = new CDEToolbar(null).element.querySelector('[data-command="cde-upload-doc"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});
