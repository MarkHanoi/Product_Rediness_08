// wave-6-c-d8: Real binding test — IfcInspectorToolbar
//
// Contract: each button click dispatches the correct typed command on
// runtime.bus.executeCommand.  The bus receives the command type and an
// object payload ({}). All 8 buttons covered.
//
// Docs: docs/archive/pryzm3-internal/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §3

import { describe, expect, it, vi } from 'vitest';
import {
    IfcInspectorToolbar,
    IFC_INSPECTOR_TOOLBAR_ID,
    IFC_INSPECTOR_TOOLBAR_BUTTONS,
} from '../IfcInspectorToolbar.js';
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

describe('IfcInspectorToolbar — wave-6-c-d8 binding contract', () => {
    it('has the correct IFC_INSPECTOR_TOOLBAR_ID constant', () => {
        expect(IFC_INSPECTOR_TOOLBAR_ID).toBe('ifc-inspector-toolbar');
    });

    it('exposes 8 button definitions', () => {
        expect(IFC_INSPECTOR_TOOLBAR_BUTTONS.length).toBe(8);
    });

    it('contains all expected command types', () => {
        const types = IFC_INSPECTOR_TOOLBAR_BUTTONS.map(b => b.commandType);
        expect(types).toContain('ifc-open-file');
        expect(types).toContain('ifc-inspect-element');
        expect(types).toContain('ifc-export-subset');
        expect(types).toContain('ifc-validate');
        expect(types).toContain('ifc-show-properties');
        expect(types).toContain('ifc-toggle-spatial-tree');
        expect(types).toContain('ifc-copy-guid');
        expect(types).toContain('ifc-filter-by-category');
    });

    it('constructs without throwing', () => {
        expect(() => new IfcInspectorToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const toolbar = new IfcInspectorToolbar(makeRuntime());
        expect(toolbar.element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        const toolbar = new IfcInspectorToolbar(makeRuntime());
        expect(toolbar.element.getAttribute('role')).toBe('toolbar');
    });

    it('element has aria-label="IFC inspector toolbar"', () => {
        const toolbar = new IfcInspectorToolbar(makeRuntime());
        expect(toolbar.element.getAttribute('aria-label')).toBe('IFC inspector toolbar');
    });

    // ── Command dispatch — all 8 buttons ──────────────────────────────────────

    it.each(IFC_INSPECTOR_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" (%s) dispatches executeCommand with type "%s"',
        (commandType) => {
            const runtime = makeRuntime();
            const toolbar = new IfcInspectorToolbar(runtime);
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
        const toolbar = new IfcInspectorToolbar(runtime);
        toolbar.triggerCommand('ifc-validate');
        expect(runtime.bus.executeCommand).toHaveBeenCalledWith(
            'ifc-validate',
            expect.any(Object),
        );
    });

    it('triggerCommand() for unknown command is a noop (no throw)', () => {
        const runtime = makeRuntime();
        const toolbar = new IfcInspectorToolbar(runtime);
        expect(() => toolbar.triggerCommand('unknown-cmd')).not.toThrow();
    });

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new IfcInspectorToolbar(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('button click without runtime logs warning, does not throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const toolbar = new IfcInspectorToolbar(null);
        const btn = toolbar.element.querySelector(
            '[data-command="ifc-open-file"]',
        ) as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    // ── DOM structure ─────────────────────────────────────────────────────────

    it('renders group separators between button groups', () => {
        const toolbar = new IfcInspectorToolbar(makeRuntime());
        const separators = toolbar.element.querySelectorAll('.iit-separator');
        expect(separators.length).toBeGreaterThan(0);
    });

    it('all buttons have aria-label attributes', () => {
        const toolbar = new IfcInspectorToolbar(makeRuntime());
        const btns = toolbar.element.querySelectorAll('.iit-btn');
        for (const btn of btns) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('all button icons have aria-hidden="true"', () => {
        const toolbar = new IfcInspectorToolbar(makeRuntime());
        const icons = toolbar.element.querySelectorAll('.iit-btn-icon');
        for (const icon of icons) {
            expect(icon.getAttribute('aria-hidden')).toBe('true');
        }
    });
});
