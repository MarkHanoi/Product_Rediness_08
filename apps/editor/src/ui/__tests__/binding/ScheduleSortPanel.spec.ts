// wave-6-b-d5: Real binding test — ScheduleSortPanel
import { describe, expect, it, vi } from 'vitest';
import { ScheduleSortPanel, SCHEDULE_SORT_PANEL_ID } from '../../ScheduleSortPanel.js';
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

describe('ScheduleSortPanel — wave-6-b-d5 binding contract', () => {
    it('SCHEDULE_SORT_PANEL_ID is "schedule-sort-panel"', () => {
        expect(SCHEDULE_SORT_PANEL_ID).toBe('schedule-sort-panel');
    });

    it('constructs without throwing', () => {
        expect(() => new ScheduleSortPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new ScheduleSortPanel(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('show() calls activatePanel("schedule-sort-panel", { label: "Schedule Sort" })', () => {
        const rt = makeRuntime();
        new ScheduleSortPanel(rt).show();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'schedule-sort-panel', expect.objectContaining({ label: 'Schedule Sort' }),
        );
    });

    it('show() sets display:block', () => {
        const p = new ScheduleSortPanel(makeRuntime());
        p.show();
        expect(p.element.style.display).toBe('block');
    });

    it('hide() calls deactivatePanel("schedule-sort-panel")', () => {
        const rt = makeRuntime();
        const p  = new ScheduleSortPanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('schedule-sort-panel');
    });

    it('hide() sets display:none', () => {
        const p = new ScheduleSortPanel(makeRuntime());
        p.show(); p.hide();
        expect(p.element.style.display).toBe('none');
    });

    it('exactly one activate and one deactivate per show/hide cycle', () => {
        const rt = makeRuntime();
        const p  = new ScheduleSortPanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('null runtime — show/hide do not throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const p = new ScheduleSortPanel(null);
        expect(() => { p.show(); p.hide(); }).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('default sortOrder is "ascending"', () => {
        expect(new ScheduleSortPanel(makeRuntime()).getState().sortOrder).toBe('ascending');
    });

    it('default groupBy is false', () => {
        expect(new ScheduleSortPanel(makeRuntime()).getState().groupBy).toBe(false);
    });

    it('default showGrandTotal is true', () => {
        expect(new ScheduleSortPanel(makeRuntime()).getState().showGrandTotal).toBe(true);
    });

    it('setState() patches sortOrder to "descending"', () => {
        const p = new ScheduleSortPanel(makeRuntime());
        p.setState({ sortOrder: 'descending' });
        expect(p.getState().sortOrder).toBe('descending');
    });

    it('setState() patches groupBy to true', () => {
        const p = new ScheduleSortPanel(makeRuntime());
        p.setState({ groupBy: true });
        expect(p.getState().groupBy).toBe(true);
    });

    it('renders an input for sortField', () => {
        expect(new ScheduleSortPanel(makeRuntime()).element.querySelector('[data-ssp-field="sortField"]')).not.toBeNull();
    });

    it('renders a select for sortOrder', () => {
        expect(new ScheduleSortPanel(makeRuntime()).element.querySelector('[data-ssp-field="sortOrder"]')).not.toBeNull();
    });

    it('renders a checkbox for blankLineBetweenGroups', () => {
        expect(new ScheduleSortPanel(makeRuntime()).element.querySelector('[data-ssp-field="blankLineBetweenGroups"]')).not.toBeNull();
    });

    it('close button triggers hide()', () => {
        const rt = makeRuntime();
        const p  = new ScheduleSortPanel(rt);
        p.show();
        (p.element.querySelector('.ssp-close-btn') as HTMLButtonElement).click();
        expect(p.element.style.display).toBe('none');
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('schedule-sort-panel');
    });
});
