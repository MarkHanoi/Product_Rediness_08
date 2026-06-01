// wave-6-c-d9: Real binding test — PrintSetupToolbar
//
// Contract: each button click dispatches the correct typed command on
// runtime.bus.executeCommand.  The bus receives the command type and an
// object payload ({}). All 7 buttons covered.
//
// Docs: docs/archive/pryzm3-internal/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §3

import { describe, expect, it, vi } from 'vitest';
import {
    PrintSetupToolbar,
    PRINT_SETUP_TOOLBAR_ID,
    PRINT_SETUP_TOOLBAR_BUTTONS,
} from '../PrintSetupToolbar.js';
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

describe('PrintSetupToolbar — wave-6-c-d9 binding contract', () => {
    it('has the correct PRINT_SETUP_TOOLBAR_ID constant', () => {
        expect(PRINT_SETUP_TOOLBAR_ID).toBe('print-setup-toolbar');
    });

    it('exposes 7 button definitions', () => {
        expect(PRINT_SETUP_TOOLBAR_BUTTONS.length).toBe(7);
    });

    it('contains all expected command types', () => {
        const types = PRINT_SETUP_TOOLBAR_BUTTONS.map(b => b.commandType);
        expect(types).toContain('print-setup-paper-size');
        expect(types).toContain('print-setup-orientation');
        expect(types).toContain('print-setup-scale');
        expect(types).toContain('print-setup-margin');
        expect(types).toContain('print-plot-preview');
        expect(types).toContain('print-plot-execute');
        expect(types).toContain('print-setup-save-preset');
    });

    it('constructs without throwing', () => {
        expect(() => new PrintSetupToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const toolbar = new PrintSetupToolbar(makeRuntime());
        expect(toolbar.element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        const toolbar = new PrintSetupToolbar(makeRuntime());
        expect(toolbar.element.getAttribute('role')).toBe('toolbar');
    });

    it('element has aria-label="Print setup toolbar"', () => {
        const toolbar = new PrintSetupToolbar(makeRuntime());
        expect(toolbar.element.getAttribute('aria-label')).toBe('Print setup toolbar');
    });

    // ── Command dispatch — all 7 buttons ──────────────────────────────────────

    it.each(PRINT_SETUP_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches executeCommand with type "%s"',
        (commandType) => {
            const runtime = makeRuntime();
            const toolbar = new PrintSetupToolbar(runtime);
            const btn = toolbar.element.querySelector(
                `[data-command="${commandType}"]`,
            ) as HTMLButtonElement | null;
            expect(btn).not.toBeNull();
            btn!.click();
            expect(runtime.bus.executeCommand).toHaveBeenCalledWith(
                commandType,
                expect.any(Object),
            );
        },
    );

    // ── triggerCommand API ────────────────────────────────────────────────────

    it('triggerCommand() dispatches via runtime.bus.executeCommand', () => {
        const runtime = makeRuntime();
        const toolbar = new PrintSetupToolbar(runtime);
        toolbar.triggerCommand('print-plot-execute');
        expect(runtime.bus.executeCommand).toHaveBeenCalledWith(
            'print-plot-execute',
            expect.any(Object),
        );
    });

    it('triggerCommand() for unknown command is a noop (no throw)', () => {
        const runtime = makeRuntime();
        const toolbar = new PrintSetupToolbar(runtime);
        expect(() => toolbar.triggerCommand('unknown-cmd')).not.toThrow();
    });

    // ── DOM structure ─────────────────────────────────────────────────────────

    it('renders group separators between button groups (config|plot|preset)', () => {
        const toolbar = new PrintSetupToolbar(makeRuntime());
        const separators = toolbar.element.querySelectorAll('.pst-separator');
        expect(separators.length).toBe(2);
    });

    it('renders exactly 7 buttons in the DOM', () => {
        const toolbar = new PrintSetupToolbar(makeRuntime());
        const btns = toolbar.element.querySelectorAll('[data-command]');
        expect(btns.length).toBe(7);
    });

    it('all buttons have aria-label attributes', () => {
        const toolbar = new PrintSetupToolbar(makeRuntime());
        const btns = toolbar.element.querySelectorAll('.pst-btn');
        for (const btn of btns) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('all button icons have aria-hidden="true"', () => {
        const toolbar = new PrintSetupToolbar(makeRuntime());
        const icons = toolbar.element.querySelectorAll('.pst-btn-icon');
        for (const icon of icons) {
            expect(icon.getAttribute('aria-hidden')).toBe('true');
        }
    });

    // ── Group breakdown ───────────────────────────────────────────────────────

    it('has 4 buttons in the config group', () => {
        const configBtns = PRINT_SETUP_TOOLBAR_BUTTONS.filter(b => b.group === 'config');
        expect(configBtns.length).toBe(4);
    });

    it('has 2 buttons in the plot group', () => {
        const plotBtns = PRINT_SETUP_TOOLBAR_BUTTONS.filter(b => b.group === 'plot');
        expect(plotBtns.length).toBe(2);
    });

    it('has 1 button in the preset group', () => {
        const presetBtns = PRINT_SETUP_TOOLBAR_BUTTONS.filter(b => b.group === 'preset');
        expect(presetBtns.length).toBe(1);
    });

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new PrintSetupToolbar(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('button click without runtime logs warning, does not throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const toolbar = new PrintSetupToolbar(null);
        const btn = toolbar.element.querySelector(
            '[data-command="print-plot-preview"]',
        ) as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});
