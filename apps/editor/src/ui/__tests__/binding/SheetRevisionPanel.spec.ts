// wave-6-b-d9: Real binding test — SheetRevisionPanel
//
// Contract: when SheetRevisionPanel.show() is called the runtime learns the
// panel is visible (activatePanel), and when hide() is called it learns the
// panel is gone (deactivatePanel).  Both transitions are idempotent.
//
// Docs: docs/archive/pryzm3-internal/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import {
    SheetRevisionPanel,
    SHEET_REVISION_PANEL_ID,
    REVISION_SEQUENCES,
    REVISION_COLUMNS,
} from '../../SheetRevisionPanel.js';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeViewRegistryMock() {
    return {
        activeViewId: null,
        activate: vi.fn(),
        list: vi.fn(() => []),
        subscribe: vi.fn(() => ({ dispose: vi.fn() })),
        activatePanel: vi.fn(),
        deactivatePanel: vi.fn(),
        getActivePanelIds: vi.fn(() => new Set<string>()),
        subscribePanelChange: vi.fn(() => ({ dispose: vi.fn() })),
    };
}

function makeRuntime() {
    const viewRegistry = makeViewRegistryMock();
    return { viewRegistry } as unknown as PryzmRuntime;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SheetRevisionPanel — wave-6-b-d9 binding contract', () => {
    it('has the correct SHEET_REVISION_PANEL_ID constant', () => {
        expect(SHEET_REVISION_PANEL_ID).toBe('sheet-revision-panel');
    });

    it('exports at least 3 revision sequence types', () => {
        expect(REVISION_SEQUENCES.length).toBeGreaterThanOrEqual(3);
    });

    it('REVISION_SEQUENCES includes numeric sequence', () => {
        const ids = REVISION_SEQUENCES.map(s => s.sequenceId);
        expect(ids).toContain('numeric');
    });

    it('REVISION_SEQUENCES includes alpha-upper sequence', () => {
        const ids = REVISION_SEQUENCES.map(s => s.sequenceId);
        expect(ids).toContain('alpha-upper');
    });

    it('exports at least 3 revision columns', () => {
        expect(REVISION_COLUMNS.length).toBeGreaterThanOrEqual(3);
    });

    it('REVISION_COLUMNS includes description column', () => {
        const ids = REVISION_COLUMNS.map(c => c.columnId);
        expect(ids).toContain('description');
    });

    it('constructs without throwing (happy-dom DOM available)', () => {
        expect(() => new SheetRevisionPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const panel = new SheetRevisionPanel(makeRuntime());
        expect(panel.element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="complementary"', () => {
        const panel = new SheetRevisionPanel(makeRuntime());
        expect(panel.element.getAttribute('role')).toBe('complementary');
    });

    // ── show() — mount binding ────────────────────────────────────────────────

    it('show() calls activatePanel with panel-id "sheet-revision-panel"', () => {
        const runtime = makeRuntime();
        const panel = new SheetRevisionPanel(runtime);
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'sheet-revision-panel',
            expect.objectContaining({ label: 'Sheet Revisions' }),
        );
    });

    it('show(sheetId) passes sheetId through to activatePanel spec', () => {
        const runtime = makeRuntime();
        const panel = new SheetRevisionPanel(runtime);
        panel.show('sheet-rev-guid-05');
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'sheet-revision-panel',
            expect.objectContaining({ elementId: 'sheet-rev-guid-05' }),
        );
    });

    it('show() makes the element visible', () => {
        const panel = new SheetRevisionPanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    // ── hide() — unmount binding ──────────────────────────────────────────────

    it('hide() calls deactivatePanel with panel-id "sheet-revision-panel"', () => {
        const runtime = makeRuntime();
        const panel = new SheetRevisionPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('sheet-revision-panel');
    });

    it('hide() hides the element', () => {
        const panel = new SheetRevisionPanel(makeRuntime());
        panel.show();
        panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    // ── show/hide symmetry ────────────────────────────────────────────────────

    it('show() then hide() produces exactly one activate and one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new SheetRevisionPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    // ── idempotency ───────────────────────────────────────────────────────────

    it('show() → show() calls activatePanel twice (slot owns idempotency)', () => {
        const runtime = makeRuntime();
        const panel = new SheetRevisionPanel(runtime);
        panel.show();
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledTimes(2);
    });

    // ── DOM content ───────────────────────────────────────────────────────────

    it('renders a schedule header column for every REVISION_COLUMNS entry', () => {
        const panel = new SheetRevisionPanel(makeRuntime());
        const cols = panel.element.querySelectorAll('[data-col-id]');
        expect(cols.length).toBe(REVISION_COLUMNS.length);
    });

    it('renders a sequence select with options for every REVISION_SEQUENCES entry', () => {
        const panel = new SheetRevisionPanel(makeRuntime());
        const select = panel.element.querySelector('[data-srp-sequence]') as HTMLSelectElement;
        expect(select).not.toBeNull();
        expect(select.options.length).toBe(REVISION_SEQUENCES.length);
    });

    it('renders an add-revision button', () => {
        const panel = new SheetRevisionPanel(makeRuntime());
        const btn = panel.element.querySelector('[data-srp-add-btn]');
        expect(btn).not.toBeNull();
    });

    it.each(REVISION_COLUMNS.map(c => c.columnId))(
        'schedule header column "%s" is present in the DOM',
        (columnId) => {
            const panel = new SheetRevisionPanel(makeRuntime());
            const col = panel.element.querySelector(`[data-col-id="${columnId}"]`);
            expect(col).not.toBeNull();
        },
    );

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new SheetRevisionPanel(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('show()/hide() without runtime — no throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new SheetRevisionPanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warnSpy.mockRestore();
    });
});
