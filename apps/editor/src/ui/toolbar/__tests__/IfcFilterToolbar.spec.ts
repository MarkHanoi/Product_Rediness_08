// wave-6-c-d8: Real binding test — IfcFilterToolbar
//
// Contract: each button click dispatches the correct typed command on
// runtime.bus.executeCommand.  The bus receives the command type and an
// object payload ({}). All 7 buttons covered.
//
// Docs: docs/03_PRYZM3/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §3

import { describe, expect, it, vi } from 'vitest';
import {
    IfcFilterToolbar,
    IFC_FILTER_TOOLBAR_ID,
    IFC_FILTER_TOOLBAR_BUTTONS,
} from '../IfcFilterToolbar.js';
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

describe('IfcFilterToolbar — wave-6-c-d8 binding contract', () => {
    it('has the correct IFC_FILTER_TOOLBAR_ID constant', () => {
        expect(IFC_FILTER_TOOLBAR_ID).toBe('ifc-filter-toolbar');
    });

    it('exposes 7 button definitions', () => {
        expect(IFC_FILTER_TOOLBAR_BUTTONS.length).toBe(7);
    });

    it('contains all expected command types', () => {
        const types = IFC_FILTER_TOOLBAR_BUTTONS.map(b => b.commandType);
        expect(types).toContain('ifc-filter-clear');
        expect(types).toContain('ifc-filter-by-storey');
        expect(types).toContain('ifc-filter-by-type');
        expect(types).toContain('ifc-filter-by-property');
        expect(types).toContain('ifc-filter-spatial');
        expect(types).toContain('ifc-filter-save');
        expect(types).toContain('ifc-filter-load');
    });

    it('constructs without throwing', () => {
        expect(() => new IfcFilterToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const toolbar = new IfcFilterToolbar(makeRuntime());
        expect(toolbar.element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        const toolbar = new IfcFilterToolbar(makeRuntime());
        expect(toolbar.element.getAttribute('role')).toBe('toolbar');
    });

    it('element has aria-label="IFC filter toolbar"', () => {
        const toolbar = new IfcFilterToolbar(makeRuntime());
        expect(toolbar.element.getAttribute('aria-label')).toBe('IFC filter toolbar');
    });

    // ── Command dispatch — all 7 buttons ──────────────────────────────────────

    it.each(IFC_FILTER_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" (%s) dispatches executeCommand with type "%s"',
        (commandType) => {
            const runtime = makeRuntime();
            const toolbar = new IfcFilterToolbar(runtime);
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
        const toolbar = new IfcFilterToolbar(runtime);
        toolbar.triggerCommand('ifc-filter-clear');
        expect(runtime.bus.executeCommand).toHaveBeenCalledWith(
            'ifc-filter-clear',
            expect.any(Object),
        );
    });

    it('triggerCommand() for unknown command is a noop (no throw)', () => {
        const runtime = makeRuntime();
        const toolbar = new IfcFilterToolbar(runtime);
        expect(() => toolbar.triggerCommand('unknown-cmd')).not.toThrow();
    });

    // ── Persist group boundary ────────────────────────────────────────────────

    it('has exactly 1 separator between filter and persist groups', () => {
        const toolbar = new IfcFilterToolbar(makeRuntime());
        const separators = toolbar.element.querySelectorAll('.ift-separator');
        expect(separators.length).toBe(1);
    });

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new IfcFilterToolbar(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('button click without runtime logs warning, does not throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const toolbar = new IfcFilterToolbar(null);
        const btn = toolbar.element.querySelector(
            '[data-command="ifc-filter-by-storey"]',
        ) as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    // ── DOM structure ─────────────────────────────────────────────────────────

    it('all buttons have aria-label attributes', () => {
        const toolbar = new IfcFilterToolbar(makeRuntime());
        const btns = toolbar.element.querySelectorAll('.ift-btn');
        for (const btn of btns) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('all button icons have aria-hidden="true"', () => {
        const toolbar = new IfcFilterToolbar(makeRuntime());
        const icons = toolbar.element.querySelectorAll('.ift-btn-icon');
        for (const icon of icons) {
            expect(icon.getAttribute('aria-hidden')).toBe('true');
        }
    });

    it('renders exactly 7 buttons in the DOM', () => {
        const toolbar = new IfcFilterToolbar(makeRuntime());
        const btns = toolbar.element.querySelectorAll('[data-command]');
        expect(btns.length).toBe(7);
    });
});
