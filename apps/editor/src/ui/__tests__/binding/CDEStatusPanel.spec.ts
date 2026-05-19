// wave-6-b-d10: Real binding test — CDEStatusPanel
//
// Contract: show() calls activatePanel; hide() calls deactivatePanel.
// Docs: docs/03_PRYZM3/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import {
    CDEStatusPanel,
    CDE_STATUS_PANEL_ID,
    CDE_WORKFLOW_STATES,
} from '../../CDEStatusPanel.js';
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

describe('CDEStatusPanel — wave-6-b-d10 binding contract', () => {
    it('has the correct CDE_STATUS_PANEL_ID constant', () => {
        expect(CDE_STATUS_PANEL_ID).toBe('cde-status-panel');
    });

    it('exports at least 4 workflow states', () => {
        expect(CDE_WORKFLOW_STATES.length).toBeGreaterThanOrEqual(4);
    });

    it('CDE_WORKFLOW_STATES includes wip state', () => {
        expect(CDE_WORKFLOW_STATES.map(s => s.stateId)).toContain('wip');
    });

    it('CDE_WORKFLOW_STATES includes approved state', () => {
        expect(CDE_WORKFLOW_STATES.map(s => s.stateId)).toContain('approved');
    });

    it('CDE_WORKFLOW_STATES includes published state', () => {
        expect(CDE_WORKFLOW_STATES.map(s => s.stateId)).toContain('published');
    });

    it('constructs without throwing', () => {
        expect(() => new CDEStatusPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        expect(new CDEStatusPanel(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="complementary"', () => {
        expect(new CDEStatusPanel(makeRuntime()).element.getAttribute('role')).toBe('complementary');
    });

    it('show() calls activatePanel with panel-id "cde-status-panel"', () => {
        const runtime = makeRuntime();
        const panel = new CDEStatusPanel(runtime);
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'cde-status-panel',
            expect.objectContaining({ label: 'CDE Status' }),
        );
    });

    it('show() passes optional docId in spec', () => {
        const runtime = makeRuntime();
        const panel = new CDEStatusPanel(runtime);
        panel.show('doc-abc');
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'cde-status-panel',
            expect.objectContaining({ docId: 'doc-abc' }),
        );
    });

    it('show() makes the element visible', () => {
        const panel = new CDEStatusPanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('block');
    });

    it('hide() calls deactivatePanel with panel-id "cde-status-panel"', () => {
        const runtime = makeRuntime();
        const panel = new CDEStatusPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('cde-status-panel');
    });

    it('hide() hides the element', () => {
        const panel = new CDEStatusPanel(makeRuntime());
        panel.show();
        panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    it('show() then hide() produces exactly one activate and one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new CDEStatusPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('renders a state button for each CDE_WORKFLOW_STATES entry', () => {
        const panel = new CDEStatusPanel(makeRuntime());
        const buttons = panel.element.querySelectorAll('[data-state-id]');
        expect(buttons.length).toBe(CDE_WORKFLOW_STATES.length);
    });

    it('renders assigned-to input', () => {
        const panel = new CDEStatusPanel(makeRuntime());
        expect(panel.element.querySelector('[data-csp-assigned-to]')).not.toBeNull();
    });

    it('renders due-date input', () => {
        const panel = new CDEStatusPanel(makeRuntime());
        expect(panel.element.querySelector('[data-csp-due-date]')).not.toBeNull();
    });

    it.each(CDE_WORKFLOW_STATES.map(s => s.stateId))(
        'state button "%s" is present in the DOM',
        (stateId) => {
            const panel = new CDEStatusPanel(makeRuntime());
            expect(panel.element.querySelector(`[data-state-id="${stateId}"]`)).not.toBeNull();
        },
    );

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new CDEStatusPanel(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('show()/hide() without runtime — no throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new CDEStatusPanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warnSpy.mockRestore();
    });
});
