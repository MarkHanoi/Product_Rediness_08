// wave-6-c-d10: Real binding test — AnalysisToolbar
import { describe, expect, it, vi } from 'vitest';
import { AnalysisToolbar, ANALYSIS_TOOLBAR_ID, ANALYSIS_TOOLBAR_BUTTONS } from '../AnalysisToolbar.js';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

function makeBusMock() {
    return { executeCommand: vi.fn(), register: vi.fn(() => ({ dispose: vi.fn() })), registry: new Map() };
}
function makeRuntime() { return { bus: makeBusMock() } as unknown as PryzmRuntime; }

describe('AnalysisToolbar — wave-6-c-d10 binding contract', () => {
    it('has the correct ANALYSIS_TOOLBAR_ID constant', () => {
        expect(ANALYSIS_TOOLBAR_ID).toBe('analysis-toolbar');
    });

    it('exposes 11 button definitions', () => {
        expect(ANALYSIS_TOOLBAR_BUTTONS.length).toBe(11);
    });

    it('contains analysis-energy-run command', () => {
        expect(ANALYSIS_TOOLBAR_BUTTONS.map(b => b.commandType)).toContain('analysis-energy-run');
    });

    it('contains analysis-gbxml-export command', () => {
        expect(ANALYSIS_TOOLBAR_BUTTONS.map(b => b.commandType)).toContain('analysis-gbxml-export');
    });

    it('constructs without throwing', () => {
        expect(() => new AnalysisToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        expect(new AnalysisToolbar(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        expect(new AnalysisToolbar(makeRuntime()).element.getAttribute('role')).toBe('toolbar');
    });

    it('element has aria-label="Analysis toolbar"', () => {
        expect(new AnalysisToolbar(makeRuntime()).element.getAttribute('aria-label')).toBe('Analysis toolbar');
    });

    it.each(ANALYSIS_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches executeCommand',
        (commandType) => {
            const runtime = makeRuntime();
            const toolbar = new AnalysisToolbar(runtime);
            const btn = toolbar.element.querySelector(`[data-command="${commandType}"]`) as HTMLButtonElement;
            expect(btn).not.toBeNull();
            btn.click();
            expect(runtime.bus.executeCommand).toHaveBeenCalledWith(commandType, expect.any(Object));
        },
    );

    it('triggerCommand() dispatches via runtime.bus.executeCommand', () => {
        const runtime = makeRuntime();
        const toolbar = new AnalysisToolbar(runtime);
        toolbar.triggerCommand('analysis-energy-run');
        expect(runtime.bus.executeCommand).toHaveBeenCalledWith('analysis-energy-run', expect.any(Object));
    });

    it('triggerCommand() for unknown command is a noop', () => {
        expect(() => new AnalysisToolbar(makeRuntime()).triggerCommand('unknown-cmd')).not.toThrow();
    });

    it('renders group separators', () => {
        expect(new AnalysisToolbar(makeRuntime()).element.querySelectorAll('.atb-separator').length).toBeGreaterThan(0);
    });

    it('renders exactly 11 buttons in the DOM', () => {
        expect(new AnalysisToolbar(makeRuntime()).element.querySelectorAll('[data-command]').length).toBe(11);
    });

    it('all buttons have aria-label attributes', () => {
        for (const btn of new AnalysisToolbar(makeRuntime()).element.querySelectorAll('.atb-btn')) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('all button icons have aria-hidden="true"', () => {
        for (const icon of new AnalysisToolbar(makeRuntime()).element.querySelectorAll('.atb-btn-icon')) {
            expect(icon.getAttribute('aria-hidden')).toBe('true');
        }
    });

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new AnalysisToolbar(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('button click without runtime logs warning, does not throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const btn = new AnalysisToolbar(null).element.querySelector('[data-command="analysis-energy-run"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});
