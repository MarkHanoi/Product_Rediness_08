// wave-6-b-d10: Real binding test — ClashDetectionPanel
//
// Contract: show() calls activatePanel; hide() calls deactivatePanel.
// Docs: docs/archive/pryzm3-internal/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import {
    ClashDetectionPanel,
    CLASH_DETECTION_PANEL_ID,
    CLASH_TYPES,
    CLASH_SEVERITIES,
} from '../../ClashDetectionPanel.js';
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

describe('ClashDetectionPanel — wave-6-b-d10 binding contract', () => {
    it('has the correct CLASH_DETECTION_PANEL_ID constant', () => {
        expect(CLASH_DETECTION_PANEL_ID).toBe('clash-detection-panel');
    });

    it('exports CLASH_TYPES with at least 2 entries', () => {
        expect(CLASH_TYPES.length).toBeGreaterThanOrEqual(2);
    });

    it('CLASH_TYPES includes hard clash', () => {
        expect(CLASH_TYPES.map(t => t.typeId)).toContain('hard');
    });

    it('CLASH_TYPES includes clearance', () => {
        expect(CLASH_TYPES.map(t => t.typeId)).toContain('clearance');
    });

    it('exports CLASH_SEVERITIES with at least 2 entries', () => {
        expect(CLASH_SEVERITIES.length).toBeGreaterThanOrEqual(2);
    });

    it('CLASH_SEVERITIES includes critical', () => {
        expect(CLASH_SEVERITIES.map(s => s.severityId)).toContain('critical');
    });

    it('CLASH_SEVERITIES includes major', () => {
        expect(CLASH_SEVERITIES.map(s => s.severityId)).toContain('major');
    });

    it('constructs without throwing', () => {
        expect(() => new ClashDetectionPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        expect(new ClashDetectionPanel(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="complementary"', () => {
        expect(new ClashDetectionPanel(makeRuntime()).element.getAttribute('role')).toBe('complementary');
    });

    it('show() calls activatePanel with panel-id "clash-detection-panel"', () => {
        const runtime = makeRuntime();
        const panel = new ClashDetectionPanel(runtime);
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'clash-detection-panel',
            expect.objectContaining({ label: 'Clash Detection' }),
        );
    });

    it('show() makes the element visible', () => {
        const panel = new ClashDetectionPanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('flex');
    });

    it('hide() calls deactivatePanel with panel-id "clash-detection-panel"', () => {
        const runtime = makeRuntime();
        const panel = new ClashDetectionPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('clash-detection-panel');
    });

    it('hide() hides the element', () => {
        const panel = new ClashDetectionPanel(makeRuntime());
        panel.show();
        panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    it('show() then hide() produces exactly one activate and one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new ClashDetectionPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('renders a clash-type chip for every CLASH_TYPES entry', () => {
        const panel = new ClashDetectionPanel(makeRuntime());
        const chips = panel.element.querySelectorAll('[data-clash-type]');
        expect(chips.length).toBe(CLASH_TYPES.length);
    });

    it('renders a severity chip for every CLASH_SEVERITIES entry', () => {
        const panel = new ClashDetectionPanel(makeRuntime());
        const chips = panel.element.querySelectorAll('[data-severity-id]');
        expect(chips.length).toBe(CLASH_SEVERITIES.length);
    });

    it('renders a tolerance input', () => {
        const panel = new ClashDetectionPanel(makeRuntime());
        expect(panel.element.querySelector('[data-cdp-tolerance]')).not.toBeNull();
    });

    it('renders a run button', () => {
        const panel = new ClashDetectionPanel(makeRuntime());
        expect(panel.element.querySelector('[data-cdp-run]')).not.toBeNull();
    });

    it.each(CLASH_TYPES.map(t => t.typeId))(
        'clash-type chip "%s" is present in the DOM',
        (typeId) => {
            const panel = new ClashDetectionPanel(makeRuntime());
            expect(panel.element.querySelector(`[data-clash-type="${typeId}"]`)).not.toBeNull();
        },
    );

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new ClashDetectionPanel(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('show()/hide() without runtime — no throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new ClashDetectionPanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warnSpy.mockRestore();
    });
});
