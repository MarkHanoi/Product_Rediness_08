// wave-6-b-d2: Real binding test — TagStylePanel
//
// Contract: show() calls activatePanel('tag-style-panel', …);
// hide() calls deactivatePanel('tag-style-panel').
//
// Docs: docs/archive/pryzm3-internal/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import { TagStylePanel, TAG_STYLE_PANEL_ID } from '../../TagStylePanel.js';
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

describe('TagStylePanel — wave-6-b-d2 binding contract', () => {
    it('has the correct TAG_STYLE_PANEL_ID constant', () => {
        expect(TAG_STYLE_PANEL_ID).toBe('tag-style-panel');
    });

    it('constructs without throwing', () => {
        expect(() => new TagStylePanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        const panel = new TagStylePanel(makeRuntime());
        expect(panel.element).toBeInstanceOf(HTMLElement);
    });

    // ── show() — mount binding ────────────────────────────────────────────────

    it('show() calls activatePanel with panel-id "tag-style-panel"', () => {
        const runtime = makeRuntime();
        const panel = new TagStylePanel(runtime);
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'tag-style-panel',
            expect.objectContaining({ label: 'Tag Style Panel' }),
        );
    });

    it('show() makes the element visible', () => {
        const panel = new TagStylePanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    // ── hide() — unmount binding ──────────────────────────────────────────────

    it('hide() calls deactivatePanel with "tag-style-panel"', () => {
        const runtime = makeRuntime();
        const panel = new TagStylePanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('tag-style-panel');
    });

    it('hide() hides the element', () => {
        const panel = new TagStylePanel(makeRuntime());
        panel.show();
        panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    // ── show() / hide() symmetry ──────────────────────────────────────────────

    it('show() then hide() produces exactly one activate and one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new TagStylePanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    // ── Null-runtime resilience ───────────────────────────────────────────────

    it('operates without runtime — no throw (logs a warning)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new TagStylePanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warnSpy.mockRestore();
    });

    // ── Style API ─────────────────────────────────────────────────────────────

    it('getStyle() returns a copy of the default style', () => {
        const panel = new TagStylePanel(makeRuntime());
        const style = panel.getStyle();
        expect(style.leaderType).toBe('straight');
        expect(style.tagShape).toBe('rectangle');
        expect(style.textSize).toBe(2.5);
        expect(style.format).toBe('{Mark}');
        expect(style.showLeaderArrow).toBe(true);
    });

    it('setStyle() updates specific fields without touching others', () => {
        const panel = new TagStylePanel(makeRuntime());
        panel.setStyle({ leaderType: 'arc', textSize: 5 });
        const style = panel.getStyle();
        expect(style.leaderType).toBe('arc');
        expect(style.textSize).toBe(5);
        expect(style.tagShape).toBe('rectangle'); // unchanged
    });

    // ── DOM structure ─────────────────────────────────────────────────────────

    it('renders a tag format input field', () => {
        const panel = new TagStylePanel(makeRuntime());
        const formatInput = panel.element.querySelector('[data-tgp-field="format"]');
        expect(formatInput).not.toBeNull();
    });

    it('close button calls hide()', () => {
        const runtime = makeRuntime();
        const panel = new TagStylePanel(runtime);
        panel.show();
        const closeBtn = panel.element.querySelector('.tgp-close-btn') as HTMLButtonElement;
        closeBtn.click();
        expect(panel.element.style.display).toBe('none');
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('tag-style-panel');
    });

    it('renders leader type select', () => {
        const panel = new TagStylePanel(makeRuntime());
        const leaderSelect = panel.element.querySelector('[data-tgp-field="leaderType"]');
        expect(leaderSelect).not.toBeNull();
        expect(leaderSelect?.tagName.toLowerCase()).toBe('select');
    });
});
