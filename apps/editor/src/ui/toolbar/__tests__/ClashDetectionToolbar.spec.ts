// wave-6-c-d10: Real binding test — ClashDetectionToolbar
import { describe, expect, it, vi } from 'vitest';
import { ClashDetectionToolbar, CLASH_DETECTION_TOOLBAR_ID, CLASH_DETECTION_TOOLBAR_BUTTONS } from '../ClashDetectionToolbar.js';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

function makeBusMock() {
    return { executeCommand: vi.fn(), register: vi.fn(() => ({ dispose: vi.fn() })), registry: new Map() };
}
function makeRuntime() { return { bus: makeBusMock() } as unknown as PryzmRuntime; }

describe('ClashDetectionToolbar — wave-6-c-d10 binding contract', () => {
    it('has the correct CLASH_DETECTION_TOOLBAR_ID constant', () => {
        expect(CLASH_DETECTION_TOOLBAR_ID).toBe('clash-detection-toolbar');
    });

    it('exposes 12 button definitions', () => {
        expect(CLASH_DETECTION_TOOLBAR_BUTTONS.length).toBe(12);
    });

    it('contains clash-run command', () => {
        expect(CLASH_DETECTION_TOOLBAR_BUTTONS.map(b => b.commandType)).toContain('clash-run');
    });

    it('contains clash-report-export command', () => {
        expect(CLASH_DETECTION_TOOLBAR_BUTTONS.map(b => b.commandType)).toContain('clash-report-export');
    });

    it('constructs without throwing', () => {
        expect(() => new ClashDetectionToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        expect(new ClashDetectionToolbar(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        expect(new ClashDetectionToolbar(makeRuntime()).element.getAttribute('role')).toBe('toolbar');
    });

    it('element has aria-label="Clash detection toolbar"', () => {
        expect(new ClashDetectionToolbar(makeRuntime()).element.getAttribute('aria-label')).toBe('Clash detection toolbar');
    });

    it.each(CLASH_DETECTION_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches executeCommand',
        (commandType) => {
            const runtime = makeRuntime();
            const toolbar = new ClashDetectionToolbar(runtime);
            const btn = toolbar.element.querySelector(`[data-command="${commandType}"]`) as HTMLButtonElement;
            expect(btn).not.toBeNull();
            btn.click();
            expect(runtime.bus.executeCommand).toHaveBeenCalledWith(commandType, expect.any(Object));
        },
    );

    it('triggerCommand() dispatches via runtime.bus.executeCommand', () => {
        const runtime = makeRuntime();
        const toolbar = new ClashDetectionToolbar(runtime);
        toolbar.triggerCommand('clash-run');
        expect(runtime.bus.executeCommand).toHaveBeenCalledWith('clash-run', expect.any(Object));
    });

    it('triggerCommand() for unknown command is a noop', () => {
        expect(() => new ClashDetectionToolbar(makeRuntime()).triggerCommand('unknown-cmd')).not.toThrow();
    });

    it('renders group separators', () => {
        expect(new ClashDetectionToolbar(makeRuntime()).element.querySelectorAll('.cdttb-separator').length).toBeGreaterThan(0);
    });

    it('renders exactly 12 buttons in the DOM', () => {
        expect(new ClashDetectionToolbar(makeRuntime()).element.querySelectorAll('[data-command]').length).toBe(12);
    });

    it('all buttons have aria-label attributes', () => {
        for (const btn of new ClashDetectionToolbar(makeRuntime()).element.querySelectorAll('.cdttb-btn')) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('all button icons have aria-hidden="true"', () => {
        for (const icon of new ClashDetectionToolbar(makeRuntime()).element.querySelectorAll('.cdttb-btn-icon')) {
            expect(icon.getAttribute('aria-hidden')).toBe('true');
        }
    });

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new ClashDetectionToolbar(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('button click without runtime logs warning, does not throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const btn = new ClashDetectionToolbar(null).element.querySelector('[data-command="clash-run"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});
