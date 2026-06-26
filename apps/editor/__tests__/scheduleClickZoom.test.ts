// §SCHEDULE-CLICK-ZOOM — characterization test for the shared schedule
// row-click "select + zoom" reaction (apps/editor/src/engine/scheduleClickZoom.ts).
//
// Verifies that a schedule row click both SELECTS the element and dispatches
// the existing `zoom-selected` command — for ANY element type (room, door,
// window, wall, …), not just rooms — and that the edge cases stay graceful.
import { describe, expect, it, vi } from 'vitest';
import {
  reactToScheduleSelection,
  type ScheduleSelectionDetail,
} from '../src/engine/scheduleClickZoom.js';

function makeSelection(found: boolean) {
  return { selectById: vi.fn((_id: string) => found) };
}
function makeBus() {
  return { executeCommand: vi.fn((_type: string, _payload: Record<string, unknown>) => undefined) };
}
function detail(over: Partial<ScheduleSelectionDetail> = {}): ScheduleSelectionDetail {
  return { elementId: 'r-1', elementType: 'room', source: 'schedule', ...over };
}

describe('§SCHEDULE-CLICK-ZOOM reactToScheduleSelection', () => {
  it('schedule row click → selects AND dispatches zoom-selected', () => {
    const sel = makeSelection(true);
    const bus = makeBus();
    const res = reactToScheduleSelection(detail(), sel, bus);

    expect(sel.selectById).toHaveBeenCalledWith('r-1');
    expect(bus.executeCommand).toHaveBeenCalledWith('zoom-selected', {});
    expect(res).toEqual({ selected: true, zoomed: true });
  });

  it('works for a NON-room element type (door) — generalises to every schedule', () => {
    const sel = makeSelection(true);
    const bus = makeBus();
    const res = reactToScheduleSelection(
      detail({ elementId: 'd-7', elementType: 'door' }), sel, bus,
    );

    expect(sel.selectById).toHaveBeenCalledWith('d-7');
    expect(bus.executeCommand).toHaveBeenCalledWith('zoom-selected', {});
    expect(res.selected).toBe(true);
    expect(res.zoomed).toBe(true);
  });

  it('works for a wall element type too', () => {
    const sel = makeSelection(true);
    const bus = makeBus();
    reactToScheduleSelection(detail({ elementId: 'w-3', elementType: 'wall' }), sel, bus);
    expect(bus.executeCommand).toHaveBeenCalledWith('zoom-selected', {});
  });

  it('element not in scene (off-level / no geometry) → selects fails → NO zoom, no throw', () => {
    const sel = makeSelection(false); // selectById returns false
    const bus = makeBus();
    const res = reactToScheduleSelection(detail(), sel, bus);

    expect(sel.selectById).toHaveBeenCalledWith('r-1');
    expect(bus.executeCommand).not.toHaveBeenCalled();
    expect(res).toEqual({ selected: false, zoomed: false });
  });

  it('non-schedule source (living-graph) → selects only, never zooms', () => {
    const sel = makeSelection(true);
    const bus = makeBus();
    const res = reactToScheduleSelection(detail({ source: 'living-graph' }), sel, bus);

    expect(sel.selectById).toHaveBeenCalledWith('r-1');
    expect(bus.executeCommand).not.toHaveBeenCalled();
    expect(res.zoomed).toBe(false);
  });

  it("3d source is ignored entirely (no re-select, no zoom)", () => {
    const sel = makeSelection(true);
    const bus = makeBus();
    const res = reactToScheduleSelection(detail({ source: '3d' }), sel, bus);

    expect(sel.selectById).not.toHaveBeenCalled();
    expect(bus.executeCommand).not.toHaveBeenCalled();
    expect(res).toEqual({ selected: false, zoomed: false });
  });

  it('missing elementType → ignored', () => {
    const sel = makeSelection(true);
    const bus = makeBus();
    const res = reactToScheduleSelection(
      { elementId: 'r-1', source: 'schedule' } as ScheduleSelectionDetail, sel, bus,
    );
    expect(sel.selectById).not.toHaveBeenCalled();
    expect(res).toEqual({ selected: false, zoomed: false });
  });

  it('zoom dispatch throwing is non-fatal — selection is preserved', () => {
    const sel = makeSelection(true);
    const bus = { executeCommand: vi.fn(() => { throw new Error('bus down'); }) };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const res = reactToScheduleSelection(detail(), sel, bus);

    expect(res.selected).toBe(true);
    expect(res.zoomed).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
