// @vitest-environment happy-dom
//
// §FIX-IMPORT-MANAGER-SOUND (L-88) — the Import Manager must be sound across a project
// close→re-open, and every row action must work in ALL states (including after reopen, where
// the underlay was recreated by UnderlayPersistence.restore, NOT the live import panel).
//
// These tests drive the real ImportManagerPanel:
//   • a fresh import (pryzm-floor-plan-underlay-placed) registers a row;
//   • after a project switch→load, the panel REBUILDS its list from the restored live tool
//     (window.floorPlanUnderlayTool) — proving it doesn't only populate on live import;
//   • the visibility / pin / delete row actions dispatch the correct runtime events.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ImportManagerPanel } from '../src/ui/import-manager/ImportManagerPanel';

// A fake runtime event bus (on/emit) shared by the panel + the test.
function makeEvents() {
    const listeners: Record<string, Array<(p?: unknown) => void>> = {};
    const emit = vi.fn((e: string, p?: unknown) => { (listeners[e] ?? []).slice().forEach((cb) => cb(p)); });
    const on = (e: string, cb: (p?: unknown) => void) => { (listeners[e] ??= []).push(cb); return { dispose: () => {} }; };
    return { on, emit };
}

/** A fake restored FloorPlanUnderlayTool (what UnderlayPersistence.restore recreates). */
function fakeRestoredTool(fileName = 'restored-plan.pdf') {
    const setLocked = vi.fn();
    const setVisible = vi.fn();
    const mesh = { uuid: 'mesh-123', visible: true, userData: { fileName } };
    return { setLocked, setVisible, getState: () => ({ mesh, locked: false }) };
}

let events: ReturnType<typeof makeEvents>;
let panel: ImportManagerPanel;

beforeEach(() => {
    vi.useFakeTimers();
    events = makeEvents();
    (window as unknown as { runtime?: unknown }).runtime = { events };
    delete (window as unknown as { floorPlanUnderlayTool?: unknown }).floorPlanUnderlayTool;
});
afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    delete (window as unknown as { floorPlanUnderlayTool?: unknown }).floorPlanUnderlayTool;
});

describe('§FIX-IMPORT-MANAGER-SOUND — registration + persistence-driven rehydration', () => {
    it('a fresh import registers a row', () => {
        panel = new ImportManagerPanel(null);
        events.emit('pryzm-floor-plan-underlay-placed', { underlayId: 'fp-1', fileName: 'plan.pdf' });
        expect(panel.count).toBe(1);
        expect(document.querySelector('.im-row')).toBeTruthy();
        expect(document.querySelector('.im-row-name')?.textContent).toBe('plan.pdf');
    });

    it('REBUILDS the list from the restored live tool on project (re-)open (not only on live import)', () => {
        panel = new ImportManagerPanel(null);
        expect(panel.count).toBe(0);

        // Simulate a project switch (clears) then a re-open where UnderlayPersistence.restore
        // has recreated the tool (window.floorPlanUnderlayTool), but its placed-event was missed.
        window.dispatchEvent(new Event('pryzm-project-switch'));
        (window as unknown as { floorPlanUnderlayTool?: unknown }).floorPlanUnderlayTool = fakeRestoredTool();
        events.emit('pryzm-project-loaded', { projectId: 'proj-A' });

        // The panel reconciles on a short delay (after the async restore) → the row appears.
        vi.advanceTimersByTime(700);
        expect(panel.count).toBe(1);
        expect(document.querySelector('.im-row-name')?.textContent).toBe('restored-plan.pdf');
    });
});

describe('§FIX-IMPORT-MANAGER-SOUND — row actions work in ALL states (incl. after reopen)', () => {
    beforeEach(() => {
        panel = new ImportManagerPanel(null);
        // Register a restored underlay (as after reopen) and open the panel.
        (window as unknown as { floorPlanUnderlayTool?: unknown }).floorPlanUnderlayTool = fakeRestoredTool();
        events.emit('pryzm-project-loaded', { projectId: 'proj-A' });
        vi.advanceTimersByTime(700);
        events.emit.mockClear();
    });

    it('visibility toggle dispatches pryzm-floor-plan-underlay-set-visibility', () => {
        (document.querySelector('.im-row [data-action="toggle-visibility"]') as HTMLButtonElement).click();
        const call = events.emit.mock.calls.find((c) => c[0] === 'pryzm-floor-plan-underlay-set-visibility');
        expect(call).toBeTruthy();
        expect(typeof (call![1] as { visible: boolean }).visible).toBe('boolean');
    });

    it('pin dispatches pryzm-floor-plan-underlay-set-locked (locked=true)', () => {
        (document.querySelector('.im-row [data-action="pin"]') as HTMLButtonElement).click();
        const call = events.emit.mock.calls.find((c) => c[0] === 'pryzm-floor-plan-underlay-set-locked');
        expect(call).toBeTruthy();
        expect((call![1] as { locked: boolean }).locked).toBe(true);
    });

    it('delete dispatches pryzm-floor-plan-underlay-remove and drops the row', () => {
        (document.querySelector('.im-row [data-action="delete"]') as HTMLButtonElement).click();
        const call = events.emit.mock.calls.find((c) => c[0] === 'pryzm-floor-plan-underlay-remove');
        expect(call).toBeTruthy();
        expect(panel.count).toBe(0);
    });
});
