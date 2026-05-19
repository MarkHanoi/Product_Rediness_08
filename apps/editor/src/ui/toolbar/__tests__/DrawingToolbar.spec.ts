// wave-6-c-d1: Real binding test — DrawingToolbar
//
// Contract: each of the 18 buttons dispatches the correct typed command on
// runtime.bus.executeCommand when clicked.
//
// Docs: docs/03_PRYZM3/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §3

import { describe, expect, it, vi } from 'vitest';
import { DrawingToolbar, DRAWING_TOOLBAR_ID, DRAWING_TOOLBAR_BUTTONS } from '../DrawingToolbar.js';
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

describe('DrawingToolbar — wave-6-c-d1 binding contract', () => {
    it('has the correct DRAWING_TOOLBAR_ID constant', () => {
        expect(DRAWING_TOOLBAR_ID).toBe('drawing-toolbar');
    });

    it('exposes 18 button definitions', () => {
        expect(DRAWING_TOOLBAR_BUTTONS.length).toBe(18);
    });

    it('constructs without throwing', () => {
        expect(() => new DrawingToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const toolbar = new DrawingToolbar(makeRuntime());
        expect(toolbar.element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        const toolbar = new DrawingToolbar(makeRuntime());
        expect(toolbar.element.getAttribute('role')).toBe('toolbar');
    });

    it('element has aria-orientation="vertical"', () => {
        const toolbar = new DrawingToolbar(makeRuntime());
        expect(toolbar.element.getAttribute('aria-orientation')).toBe('vertical');
    });

    // ── Command dispatch — all 18 buttons ─────────────────────────────────────

    it.each(DRAWING_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" (%s) dispatches executeCommand with type "%s"',
        (commandType) => {
            const runtime = makeRuntime();
            const toolbar = new DrawingToolbar(runtime);
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
        const toolbar = new DrawingToolbar(runtime);
        toolbar.triggerCommand('draw-wall');
        expect(runtime.bus.executeCommand).toHaveBeenCalledWith('draw-wall', expect.any(Object));
    });

    it('triggerCommand() logs a warning when runtime is null', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const toolbar = new DrawingToolbar(null);
        toolbar.triggerCommand('draw-wall');
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new DrawingToolbar(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('button click without runtime logs warning, does not throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const toolbar = new DrawingToolbar(null);
        const btn = toolbar.element.querySelector('[data-command="draw-wall"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    // ── DOM layout ────────────────────────────────────────────────────────────

    it('renders group separators between button groups', () => {
        const toolbar = new DrawingToolbar(makeRuntime());
        const separators = toolbar.element.querySelectorAll('.dt-separator');
        expect(separators.length).toBeGreaterThan(0);
    });

    it('all buttons have aria-label attributes', () => {
        const toolbar = new DrawingToolbar(makeRuntime());
        const btns = toolbar.element.querySelectorAll('.dt-btn');
        for (const btn of btns) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('renders exactly 18 button elements', () => {
        const toolbar = new DrawingToolbar(makeRuntime());
        const btns = toolbar.element.querySelectorAll('.dt-btn');
        expect(btns.length).toBe(18);
    });
});
