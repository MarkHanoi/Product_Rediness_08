// wave-6-b-d5: Real binding test — ScheduleFilterPanel
import { describe, expect, it, vi } from 'vitest';
import { ScheduleFilterPanel, SCHEDULE_FILTER_PANEL_ID } from '../../ScheduleFilterPanel.js';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

function makeRuntime() {
    return {
        viewRegistry: {
            activeViewId: null,
            activate: vi.fn(),
            list: vi.fn(() => []),
            subscribe: vi.fn(() => ({ dispose: vi.fn() })),
            activatePanel: vi.fn(),
            deactivatePanel: vi.fn(),
            getActivePanelIds: vi.fn(() => new Set<string>()),
            subscribePanelChange: vi.fn(() => ({ dispose: vi.fn() })),
        },
    } as unknown as PryzmRuntime;
}

describe('ScheduleFilterPanel — wave-6-b-d5 binding contract', () => {
    it('SCHEDULE_FILTER_PANEL_ID is "schedule-filter-panel"', () => {
        expect(SCHEDULE_FILTER_PANEL_ID).toBe('schedule-filter-panel');
    });

    it('constructs without throwing', () => {
        expect(() => new ScheduleFilterPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new ScheduleFilterPanel(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('show() calls activatePanel("schedule-filter-panel", { label: "Schedule Filter" })', () => {
        const rt = makeRuntime();
        new ScheduleFilterPanel(rt).show();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'schedule-filter-panel', expect.objectContaining({ label: 'Schedule Filter' }),
        );
    });

    it('show() sets display:block', () => {
        const p = new ScheduleFilterPanel(makeRuntime());
        p.show();
        expect(p.element.style.display).toBe('block');
    });

    it('hide() calls deactivatePanel("schedule-filter-panel")', () => {
        const rt = makeRuntime();
        const p  = new ScheduleFilterPanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('schedule-filter-panel');
    });

    it('hide() sets display:none', () => {
        const p = new ScheduleFilterPanel(makeRuntime());
        p.show(); p.hide();
        expect(p.element.style.display).toBe('none');
    });

    it('exactly one activate and one deactivate per show/hide cycle', () => {
        const rt = makeRuntime();
        const p  = new ScheduleFilterPanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('null runtime — show/hide do not throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const p = new ScheduleFilterPanel(null);
        expect(() => { p.show(); p.hide(); }).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('default operator is "equals"', () => {
        expect(new ScheduleFilterPanel(makeRuntime()).getState().operator).toBe('equals');
    });

    it('default filterSetLogic is "and"', () => {
        expect(new ScheduleFilterPanel(makeRuntime()).getState().filterSetLogic).toBe('and');
    });

    it('default enabled is true', () => {
        expect(new ScheduleFilterPanel(makeRuntime()).getState().enabled).toBe(true);
    });

    it('setState() patches operator to "contains"', () => {
        const p = new ScheduleFilterPanel(makeRuntime());
        p.setState({ operator: 'contains' });
        expect(p.getState().operator).toBe('contains');
    });

    it('setState() patches filterValue', () => {
        const p = new ScheduleFilterPanel(makeRuntime());
        p.setState({ filterValue: 'Concrete' });
        expect(p.getState().filterValue).toBe('Concrete');
    });

    it('renders an input for filterField', () => {
        expect(new ScheduleFilterPanel(makeRuntime()).element.querySelector('[data-sflp-field="filterField"]')).not.toBeNull();
    });

    it('renders a select for operator', () => {
        expect(new ScheduleFilterPanel(makeRuntime()).element.querySelector('[data-sflp-field="operator"]')).not.toBeNull();
    });

    it('renders a checkbox for caseSensitive', () => {
        expect(new ScheduleFilterPanel(makeRuntime()).element.querySelector('[data-sflp-field="caseSensitive"]')).not.toBeNull();
    });

    it('close button triggers hide()', () => {
        const rt = makeRuntime();
        const p  = new ScheduleFilterPanel(rt);
        p.show();
        (p.element.querySelector('.sflp-close-btn') as HTMLButtonElement).click();
        expect(p.element.style.display).toBe('none');
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('schedule-filter-panel');
    });
});
