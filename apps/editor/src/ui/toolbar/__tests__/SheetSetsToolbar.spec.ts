// wave-6-c-d9: Real binding test — SheetSetsToolbar
//
// Contract: each button click dispatches the correct typed command on
// runtime.bus.executeCommand.  The bus receives the command type and an
// object payload ({}). All 7 buttons covered.
//
// Docs: docs/archive/pryzm3-internal/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §3

import { describe, expect, it, vi } from 'vitest';
import {
    SheetSetsToolbar,
    SHEET_SETS_TOOLBAR_ID,
    SHEET_SETS_TOOLBAR_BUTTONS,
} from '../SheetSetsToolbar.js';
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

describe('SheetSetsToolbar — wave-6-c-d9 binding contract', () => {
    it('has the correct SHEET_SETS_TOOLBAR_ID constant', () => {
        expect(SHEET_SETS_TOOLBAR_ID).toBe('sheet-sets-toolbar');
    });

    it('exposes 7 button definitions', () => {
        expect(SHEET_SETS_TOOLBAR_BUTTONS.length).toBe(7);
    });

    it('contains all expected command types', () => {
        const types = SHEET_SETS_TOOLBAR_BUTTONS.map(b => b.commandType);
        expect(types).toContain('sheet-set-new');
        expect(types).toContain('sheet-set-open');
        expect(types).toContain('sheet-set-close');
        expect(types).toContain('sheet-set-add-sheet');
        expect(types).toContain('sheet-set-remove-sheet');
        expect(types).toContain('sheet-set-reorder');
        expect(types).toContain('sheet-set-export');
    });

    it('constructs without throwing', () => {
        expect(() => new SheetSetsToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const toolbar = new SheetSetsToolbar(makeRuntime());
        expect(toolbar.element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        const toolbar = new SheetSetsToolbar(makeRuntime());
        expect(toolbar.element.getAttribute('role')).toBe('toolbar');
    });

    it('element has aria-label="Sheet sets toolbar"', () => {
        const toolbar = new SheetSetsToolbar(makeRuntime());
        expect(toolbar.element.getAttribute('aria-label')).toBe('Sheet sets toolbar');
    });

    // ── Command dispatch — all 7 buttons ──────────────────────────────────────

    it.each(SHEET_SETS_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches executeCommand with type "%s"',
        (commandType) => {
            const runtime = makeRuntime();
            const toolbar = new SheetSetsToolbar(runtime);
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
        const toolbar = new SheetSetsToolbar(runtime);
        toolbar.triggerCommand('sheet-set-new');
        expect(runtime.bus.executeCommand).toHaveBeenCalledWith(
            'sheet-set-new',
            expect.any(Object),
        );
    });

    it('triggerCommand() for unknown command is a noop (no throw)', () => {
        const runtime = makeRuntime();
        const toolbar = new SheetSetsToolbar(runtime);
        expect(() => toolbar.triggerCommand('unknown-cmd')).not.toThrow();
    });

    // ── DOM structure ─────────────────────────────────────────────────────────

    it('renders group separators between button groups', () => {
        const toolbar = new SheetSetsToolbar(makeRuntime());
        const separators = toolbar.element.querySelectorAll('.sst-separator');
        expect(separators.length).toBeGreaterThan(0);
    });

    it('renders exactly 7 buttons in the DOM', () => {
        const toolbar = new SheetSetsToolbar(makeRuntime());
        const btns = toolbar.element.querySelectorAll('[data-command]');
        expect(btns.length).toBe(7);
    });

    it('all buttons have aria-label attributes', () => {
        const toolbar = new SheetSetsToolbar(makeRuntime());
        const btns = toolbar.element.querySelectorAll('.sst-btn');
        for (const btn of btns) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('all button icons have aria-hidden="true"', () => {
        const toolbar = new SheetSetsToolbar(makeRuntime());
        const icons = toolbar.element.querySelectorAll('.sst-btn-icon');
        for (const icon of icons) {
            expect(icon.getAttribute('aria-hidden')).toBe('true');
        }
    });

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new SheetSetsToolbar(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('button click without runtime logs warning, does not throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const toolbar = new SheetSetsToolbar(null);
        const btn = toolbar.element.querySelector(
            '[data-command="sheet-set-new"]',
        ) as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});
