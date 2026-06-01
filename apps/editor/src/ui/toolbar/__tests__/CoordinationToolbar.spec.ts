// wave-6-c-d10: Real binding test — CoordinationToolbar
//
// Contract: each button click dispatches the correct typed command on
// runtime.bus.executeCommand.  All 12 buttons covered.
//
// Docs: docs/archive/pryzm3-internal/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §3

import { describe, expect, it, vi } from 'vitest';
import {
    CoordinationToolbar,
    COORDINATION_TOOLBAR_ID,
    COORDINATION_TOOLBAR_BUTTONS,
} from '../CoordinationToolbar.js';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

function makeBusMock() {
    return { executeCommand: vi.fn(), register: vi.fn(() => ({ dispose: vi.fn() })), registry: new Map() };
}
function makeRuntime() {
    return { bus: makeBusMock() } as unknown as PryzmRuntime;
}

describe('CoordinationToolbar — wave-6-c-d10 binding contract', () => {
    it('has the correct COORDINATION_TOOLBAR_ID constant', () => {
        expect(COORDINATION_TOOLBAR_ID).toBe('coordination-toolbar');
    });

    it('exposes 12 button definitions', () => {
        expect(COORDINATION_TOOLBAR_BUTTONS.length).toBe(12);
    });

    it('contains coordination-review-new command', () => {
        const types = COORDINATION_TOOLBAR_BUTTONS.map(b => b.commandType);
        expect(types).toContain('coordination-review-new');
    });

    it('contains coordination-clash-detect command', () => {
        const types = COORDINATION_TOOLBAR_BUTTONS.map(b => b.commandType);
        expect(types).toContain('coordination-clash-detect');
    });

    it('constructs without throwing', () => {
        expect(() => new CoordinationToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        expect(new CoordinationToolbar(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        expect(new CoordinationToolbar(makeRuntime()).element.getAttribute('role')).toBe('toolbar');
    });

    it('element has aria-label="Coordination toolbar"', () => {
        expect(new CoordinationToolbar(makeRuntime()).element.getAttribute('aria-label')).toBe('Coordination toolbar');
    });

    it.each(COORDINATION_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches executeCommand',
        (commandType) => {
            const runtime = makeRuntime();
            const toolbar = new CoordinationToolbar(runtime);
            const btn = toolbar.element.querySelector(`[data-command="${commandType}"]`) as HTMLButtonElement;
            expect(btn).not.toBeNull();
            btn.click();
            expect(runtime.bus.executeCommand).toHaveBeenCalledWith(commandType, expect.any(Object));
        },
    );

    it('triggerCommand() dispatches via runtime.bus.executeCommand', () => {
        const runtime = makeRuntime();
        const toolbar = new CoordinationToolbar(runtime);
        toolbar.triggerCommand('coordination-review-new');
        expect(runtime.bus.executeCommand).toHaveBeenCalledWith('coordination-review-new', expect.any(Object));
    });

    it('triggerCommand() for unknown command is a noop (no throw)', () => {
        const runtime = makeRuntime();
        const toolbar = new CoordinationToolbar(runtime);
        expect(() => toolbar.triggerCommand('unknown-cmd')).not.toThrow();
    });

    it('renders group separators between button groups', () => {
        const toolbar = new CoordinationToolbar(makeRuntime());
        expect(toolbar.element.querySelectorAll('.ctb-separator').length).toBeGreaterThan(0);
    });

    it('renders exactly 12 buttons in the DOM', () => {
        const toolbar = new CoordinationToolbar(makeRuntime());
        expect(toolbar.element.querySelectorAll('[data-command]').length).toBe(12);
    });

    it('all buttons have aria-label attributes', () => {
        const toolbar = new CoordinationToolbar(makeRuntime());
        for (const btn of toolbar.element.querySelectorAll('.ctb-btn')) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('all button icons have aria-hidden="true"', () => {
        const toolbar = new CoordinationToolbar(makeRuntime());
        for (const icon of toolbar.element.querySelectorAll('.ctb-btn-icon')) {
            expect(icon.getAttribute('aria-hidden')).toBe('true');
        }
    });

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new CoordinationToolbar(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('button click without runtime logs warning, does not throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const toolbar = new CoordinationToolbar(null);
        const btn = toolbar.element.querySelector('[data-command="coordination-review-new"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});
