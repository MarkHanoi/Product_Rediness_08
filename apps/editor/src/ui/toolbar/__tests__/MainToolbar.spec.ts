// wave-6-c-d1: Real binding test — MainToolbar
//
// Contract: each button click dispatches the correct typed command on
// runtime.bus.executeCommand.  The bus receives the command type and an
// object payload ({}). 12 buttons covered.
//
// Docs: docs/archive/pryzm3-internal/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §3

import { describe, expect, it, vi } from 'vitest';
import { MainToolbar, MAIN_TOOLBAR_ID, MAIN_TOOLBAR_BUTTONS } from '../MainToolbar.js';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeBusMock() {
    return {
        executeCommand: vi.fn(),
        register: vi.fn(() => ({ dispose: vi.fn() })),
        registry: new Map(),
    };
}

function makeRuntime() {
    const bus = makeBusMock();
    return { bus } as unknown as PryzmRuntime;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MainToolbar — wave-6-c-d1 binding contract', () => {
    it('has the correct MAIN_TOOLBAR_ID constant', () => {
        expect(MAIN_TOOLBAR_ID).toBe('main-toolbar');
    });

    it('exposes 12 button definitions', () => {
        expect(MAIN_TOOLBAR_BUTTONS.length).toBe(12);
    });

    it('constructs without throwing', () => {
        expect(() => new MainToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const toolbar = new MainToolbar(makeRuntime());
        expect(toolbar.element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        const toolbar = new MainToolbar(makeRuntime());
        expect(toolbar.element.getAttribute('role')).toBe('toolbar');
    });

    // ── Command dispatch — all 12 buttons ─────────────────────────────────────

    it.each(MAIN_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" (%s) dispatches executeCommand with type "%s"',
        (commandType) => {
            const runtime = makeRuntime();
            const toolbar = new MainToolbar(runtime);
            const btn = toolbar.element.querySelector(
                `[data-command="${commandType}"]`,
            ) as HTMLButtonElement | null;
            expect(btn).not.toBeNull();
            btn!.click();
            expect(runtime.bus.executeCommand).toHaveBeenCalledWith(commandType, expect.any(Object));
        },
    );

    // ── triggerCommand API ────────────────────────────────────────────────────

    it('triggerCommand() dispatches via runtime.bus.executeCommand', () => {
        const runtime = makeRuntime();
        const toolbar = new MainToolbar(runtime);
        toolbar.triggerCommand('undo');
        expect(runtime.bus.executeCommand).toHaveBeenCalledWith('undo', expect.any(Object));
    });

    it('triggerCommand() logs a warning when runtime is null', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const toolbar = new MainToolbar(null);
        toolbar.triggerCommand('undo');
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new MainToolbar(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('button click without runtime logs warning, does not throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const toolbar = new MainToolbar(null);
        const btn = toolbar.element.querySelector('[data-command="undo"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    // ── DOM separators ────────────────────────────────────────────────────────

    it('renders group separators between button groups', () => {
        const toolbar = new MainToolbar(makeRuntime());
        const separators = toolbar.element.querySelectorAll('.mt-separator');
        expect(separators.length).toBeGreaterThan(0);
    });

    // ── Aria attributes ───────────────────────────────────────────────────────

    it('all buttons have aria-label attributes', () => {
        const toolbar = new MainToolbar(makeRuntime());
        const btns = toolbar.element.querySelectorAll('.mt-btn');
        for (const btn of btns) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });
});
