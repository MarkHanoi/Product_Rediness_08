// wave-6-b-d10: Real binding test — CoordinationReviewPanel
//
// Contract: show() calls activatePanel; hide() calls deactivatePanel.
// Docs: docs/archive/pryzm3-internal/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import {
    CoordinationReviewPanel,
    COORDINATION_REVIEW_PANEL_ID,
    COORD_DISCIPLINES,
    COORD_ISSUE_STATUSES,
} from '../../CoordinationReviewPanel.js';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

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
    return { viewRegistry: makeViewRegistryMock() } as unknown as PryzmRuntime;
}

describe('CoordinationReviewPanel — wave-6-b-d10 binding contract', () => {
    it('has the correct COORDINATION_REVIEW_PANEL_ID constant', () => {
        expect(COORDINATION_REVIEW_PANEL_ID).toBe('coordination-review-panel');
    });

    it('exports at least 4 coordination disciplines', () => {
        expect(COORD_DISCIPLINES.length).toBeGreaterThanOrEqual(4);
    });

    it('COORD_DISCIPLINES includes arch', () => {
        expect(COORD_DISCIPLINES.map(d => d.disciplineId)).toContain('arch');
    });

    it('COORD_DISCIPLINES includes structure', () => {
        expect(COORD_DISCIPLINES.map(d => d.disciplineId)).toContain('structure');
    });

    it('exports at least 3 issue statuses', () => {
        expect(COORD_ISSUE_STATUSES.length).toBeGreaterThanOrEqual(3);
    });

    it('COORD_ISSUE_STATUSES includes open', () => {
        expect(COORD_ISSUE_STATUSES.map(s => s.statusId)).toContain('open');
    });

    it('COORD_ISSUE_STATUSES includes resolved', () => {
        expect(COORD_ISSUE_STATUSES.map(s => s.statusId)).toContain('resolved');
    });

    it('constructs without throwing', () => {
        expect(() => new CoordinationReviewPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        expect(new CoordinationReviewPanel(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="complementary"', () => {
        expect(new CoordinationReviewPanel(makeRuntime()).element.getAttribute('role')).toBe('complementary');
    });

    it('show() calls activatePanel with panel-id "coordination-review-panel"', () => {
        const runtime = makeRuntime();
        const panel = new CoordinationReviewPanel(runtime);
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'coordination-review-panel',
            expect.objectContaining({ label: 'Coordination Review' }),
        );
    });

    it('show() makes the element visible', () => {
        const panel = new CoordinationReviewPanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('flex');
    });

    it('hide() calls deactivatePanel with panel-id "coordination-review-panel"', () => {
        const runtime = makeRuntime();
        const panel = new CoordinationReviewPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('coordination-review-panel');
    });

    it('hide() hides the element', () => {
        const panel = new CoordinationReviewPanel(makeRuntime());
        panel.show();
        panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    it('show() then hide() produces exactly one activate and one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new CoordinationReviewPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('renders a discipline chip for every COORD_DISCIPLINES entry', () => {
        const panel = new CoordinationReviewPanel(makeRuntime());
        const chips = panel.element.querySelectorAll('[data-discipline-id]');
        expect(chips.length).toBe(COORD_DISCIPLINES.length);
    });

    it('renders a status chip for every COORD_ISSUE_STATUSES entry', () => {
        const panel = new CoordinationReviewPanel(makeRuntime());
        const chips = panel.element.querySelectorAll('[data-status-id]');
        expect(chips.length).toBe(COORD_ISSUE_STATUSES.length);
    });

    it('renders stats section', () => {
        const panel = new CoordinationReviewPanel(makeRuntime());
        expect(panel.element.querySelector('[data-crp-stats]')).not.toBeNull();
    });

    it.each(COORD_DISCIPLINES.map(d => d.disciplineId))(
        'discipline chip "%s" is present in the DOM',
        (disciplineId) => {
            const panel = new CoordinationReviewPanel(makeRuntime());
            expect(panel.element.querySelector(`[data-discipline-id="${disciplineId}"]`)).not.toBeNull();
        },
    );

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new CoordinationReviewPanel(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('show()/hide() without runtime — no throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new CoordinationReviewPanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warnSpy.mockRestore();
    });
});
