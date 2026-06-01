// wave-6-b-d8: Real binding test — ComponentHistoryPanel
//
// Contract: when ComponentHistoryPanel.show() is called the runtime learns
// the panel is visible (activatePanel), and when hide() is called it learns
// the panel is gone (deactivatePanel).  Both transitions are idempotent.
//
// Docs: docs/archive/pryzm3-internal/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import {
    ComponentHistoryPanel,
    COMPONENT_HISTORY_PANEL_ID,
    CHANGE_EVENT_DEFS,
} from '../../ComponentHistoryPanel.js';
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

describe('ComponentHistoryPanel — wave-6-b-d8 binding contract', () => {
    it('has the correct COMPONENT_HISTORY_PANEL_ID constant', () => {
        expect(COMPONENT_HISTORY_PANEL_ID).toBe('component-history-panel');
    });

    it('exports at least 5 change event defs', () => {
        expect(CHANGE_EVENT_DEFS.length).toBeGreaterThanOrEqual(5);
    });

    it('CHANGE_EVENT_DEFS includes a "created" event kind', () => {
        const kinds = CHANGE_EVENT_DEFS.map(d => d.kind);
        expect(kinds).toContain('created');
    });

    it('constructs without throwing (happy-dom DOM available)', () => {
        expect(() => new ComponentHistoryPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const panel = new ComponentHistoryPanel(makeRuntime());
        expect(panel.element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="complementary"', () => {
        const panel = new ComponentHistoryPanel(makeRuntime());
        expect(panel.element.getAttribute('role')).toBe('complementary');
    });

    // ── show() — mount binding ────────────────────────────────────────────────

    it('show() calls activatePanel with panel-id "component-history-panel"', () => {
        const runtime = makeRuntime();
        const panel = new ComponentHistoryPanel(runtime);
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'component-history-panel',
            expect.objectContaining({ label: 'Component History' }),
        );
    });

    it('show(elementId) passes elementId through to activatePanel spec', () => {
        const runtime = makeRuntime();
        const panel = new ComponentHistoryPanel(runtime);
        panel.show('slab-guid-77');
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'component-history-panel',
            expect.objectContaining({ elementId: 'slab-guid-77' }),
        );
    });

    it('show() makes the element visible', () => {
        const panel = new ComponentHistoryPanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    // ── hide() — unmount binding ──────────────────────────────────────────────

    it('hide() calls deactivatePanel with panel-id "component-history-panel"', () => {
        const runtime = makeRuntime();
        const panel = new ComponentHistoryPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('component-history-panel');
    });

    it('hide() hides the element', () => {
        const panel = new ComponentHistoryPanel(makeRuntime());
        panel.show();
        panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    // ── show/hide symmetry ────────────────────────────────────────────────────

    it('show() then hide() produces exactly one activate and one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new ComponentHistoryPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    // ── idempotency ───────────────────────────────────────────────────────────

    it('show() → show() calls activatePanel twice (slot owns idempotency)', () => {
        const runtime = makeRuntime();
        const panel = new ComponentHistoryPanel(runtime);
        panel.show();
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledTimes(2);
    });

    // ── DOM content ───────────────────────────────────────────────────────────

    it('renders an event-kind row for every CHANGE_EVENT_DEFS entry', () => {
        const panel = new ComponentHistoryPanel(makeRuntime());
        const rows = panel.element.querySelectorAll('[data-event-kind]');
        expect(rows.length).toBe(CHANGE_EVENT_DEFS.length);
    });

    it.each(CHANGE_EVENT_DEFS.map(d => d.kind))(
        'event-kind row "%s" is present in the DOM',
        (kind) => {
            const panel = new ComponentHistoryPanel(makeRuntime());
            const row = panel.element.querySelector(`[data-event-kind="${kind}"]`);
            expect(row).not.toBeNull();
        },
    );

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new ComponentHistoryPanel(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('show()/hide() without runtime — no throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new ComponentHistoryPanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warnSpy.mockRestore();
    });
});
