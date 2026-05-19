// wave-6-c-d7: Real binding test — FamilyToolbar
//
// Contract: each button click dispatches the correct typed command on
// runtime.bus.executeCommand.  The bus receives the command type and an
// object payload ({}). All 8 buttons covered.
//
// Docs: docs/03_PRYZM3/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §3

import { describe, expect, it, vi } from 'vitest';
import {
    FamilyToolbar,
    FAMILY_TOOLBAR_ID,
    FAMILY_TOOLBAR_BUTTONS,
} from '../FamilyToolbar.js';
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

describe('FamilyToolbar — wave-6-c-d7 binding contract', () => {
    it('has the correct FAMILY_TOOLBAR_ID constant', () => {
        expect(FAMILY_TOOLBAR_ID).toBe('family-toolbar');
    });

    it('exposes 8 button definitions', () => {
        expect(FAMILY_TOOLBAR_BUTTONS.length).toBe(8);
    });

    it('contains all expected command types', () => {
        const types = FAMILY_TOOLBAR_BUTTONS.map(b => b.commandType);
        expect(types).toContain('browse-family-types');
        expect(types).toContain('load-family');
        expect(types).toContain('edit-family');
        expect(types).toContain('create-family');
        expect(types).toContain('reload-family');
        expect(types).toContain('place-family-instance');
        expect(types).toContain('edit-family-type');
        expect(types).toContain('export-family');
    });

    it('constructs without throwing', () => {
        expect(() => new FamilyToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const toolbar = new FamilyToolbar(makeRuntime());
        expect(toolbar.element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        const toolbar = new FamilyToolbar(makeRuntime());
        expect(toolbar.element.getAttribute('role')).toBe('toolbar');
    });

    // ── Command dispatch — all 8 buttons ──────────────────────────────────────

    it.each(FAMILY_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" (%s) dispatches executeCommand with type "%s"',
        (commandType) => {
            const runtime = makeRuntime();
            const toolbar = new FamilyToolbar(runtime);
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
        const toolbar = new FamilyToolbar(runtime);
        toolbar.triggerCommand('browse-family-types');
        expect(runtime.bus.executeCommand).toHaveBeenCalledWith(
            'browse-family-types',
            expect.any(Object),
        );
    });

    it('triggerCommand() logs a warning when runtime is null', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const toolbar = new FamilyToolbar(null);
        toolbar.triggerCommand('load-family');
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new FamilyToolbar(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('button click without runtime logs warning, does not throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const toolbar = new FamilyToolbar(null);
        const btn = toolbar.element.querySelector(
            '[data-command="edit-family"]',
        ) as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    // ── DOM separators ────────────────────────────────────────────────────────

    it('renders group separators between button groups', () => {
        const toolbar = new FamilyToolbar(makeRuntime());
        const separators = toolbar.element.querySelectorAll('.ft-separator');
        expect(separators.length).toBeGreaterThan(0);
    });

    // ── Aria attributes ───────────────────────────────────────────────────────

    it('all buttons have aria-label attributes', () => {
        const toolbar = new FamilyToolbar(makeRuntime());
        const btns = toolbar.element.querySelectorAll('.ft-btn');
        for (const btn of btns) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });
});
