// @vitest-environment happy-dom
/**
 * §FEAT-SCHEDULE-VIEW-EDIT (L-80) — Schedule VIEW + EDIT modes.
 *
 * Proves the two halves L-80 asks for:
 *   VIEW  — a schedule renders its rows/columns FROM the persisted store
 *           (resolveVisibleColumns sources columns from scheduleStore.fields;
 *            projectRows turns elements into the exact cell values the panel paints).
 *   EDIT  — a definition edit dispatches the correct bus command
 *           (`schedule.update` with { scheduleId, patch }) and, once the bridge
 *            runs UpdateScheduleCommand, the change lands in the store and is
 *            undoable (P6 — never a direct store write from the UI).
 *
 * The apps/editor vitest env is `node`, so we exercise the DOM-free view-model
 * (scheduleViewModel.ts) plus the real UpdateScheduleCommand rather than mounting
 * the heavy SchedulePanel DOM class — the panel delegates to exactly these units.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { scheduleStore, ScheduleRegistry } from '@pryzm/core-app-model';
import { UpdateScheduleCommand } from '@pryzm/command-registry';
import {
  resolveVisibleColumns,
  allColumns,
  storeFields,
  scheduleName,
  projectRows,
  toggleFieldPatch,
  dispatchScheduleUpdate,
} from '@app/ui/SchedulePanel/scheduleViewModel';

// happy-dom supplies window / CustomEvent (the store dispatches `sched:*`
// events); commands mint ids via crypto.randomUUID (Node ≥20).
beforeEach(() => {
  ScheduleRegistry.registerDefaultSchedules();
  scheduleStore.reset();
  scheduleStore.seedDefaultSchedules();
});

describe('§FEAT-SCHEDULE-VIEW-EDIT — VIEW renders from the store', () => {
  it('resolves visible columns from the persisted store fields (membership + order)', () => {
    const id = 'Doors Schedule';
    const fields = storeFields(id);
    expect(fields).not.toBeNull();

    const cols = resolveVisibleColumns(id);
    // Columns come from the STORE definition, in the stored order…
    expect(cols.map((c) => c.id)).toEqual(fields);
    // …and each is a real registry column carrying a value accessor.
    expect(cols.every((c) => typeof c.value === 'function')).toBe(true);
  });

  it('projects element rows into the exact cells the table renders', () => {
    const cols = resolveVisibleColumns('Doors Schedule'); // mark,type,width,…
    const rows = projectRows(cols, [
      { id: 'd1', mark: 'D01', type: 'Single', width: 0.9 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('d1');
    expect(rows[0].cells[0]).toBe('D01'); // mark = first column
    expect(rows[0].cells[2]).toBe(0.9); // width = third column
    // A missing property renders the em-dash placeholder, not undefined.
    expect(rows[0].cells[cols.findIndex((c) => c.id === 'level')]).toBe('—');
  });

  it('toggleFieldPatch removes and re-adds a column in canonical registry order', () => {
    const id = 'Doors Schedule';
    const order = allColumns(id).map((c) => c.id);
    const current = storeFields(id)!;

    const removed = toggleFieldPatch(current, 'width', order);
    expect(removed).not.toContain('width');
    expect(removed.length).toBe(current.length - 1);

    const readded = toggleFieldPatch(removed, 'width', order);
    expect(readded).toEqual(current); // width lands back in its original slot
  });
});

describe('§FEAT-SCHEDULE-VIEW-EDIT — EDIT dispatches the bus command + updates the store', () => {
  it('dispatchScheduleUpdate emits schedule.update and the bridge lands it in the store', () => {
    const id = 'Windows Schedule';
    const before = storeFields(id)!;
    const calls: Array<{ type: string; payload: unknown }> = [];

    // Fake bus wired exactly like the initBusHandlers `schedule.update` bridge:
    // it forwards to the real UpdateScheduleCommand (P6, undoable).
    const runtime = {
      bus: {
        executeCommand: (type: string, payload: { scheduleId: string; patch: unknown }) => {
          calls.push({ type, payload });
          const cmd = new UpdateScheduleCommand(payload.scheduleId, payload.patch as never);
          expect(cmd.canExecute({} as never).ok).toBe(true);
          cmd.execute({} as never);
          return Promise.resolve({});
        },
      },
    };

    const newFields = ['mark', 'id', 'name', 'width'];
    const ok = dispatchScheduleUpdate(runtime, id, { fields: newFields });

    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].type).toBe('schedule.update');
    expect(calls[0].payload).toEqual({ scheduleId: id, patch: { fields: newFields } });

    // The edit is now PERSISTED in the store and drives the next VIEW render.
    expect(storeFields(id)).toEqual(newFields);
    expect(resolveVisibleColumns(id).map((c) => c.id)).toEqual(newFields);
    expect(storeFields(id)).not.toEqual(before);
  });

  it('renames a schedule through the same bus path', () => {
    const id = 'Windows Schedule';
    const runtime = {
      bus: {
        executeCommand: (_type: string, payload: { scheduleId: string; patch: unknown }) => {
          new UpdateScheduleCommand(payload.scheduleId, payload.patch as never).execute({} as never);
          return Promise.resolve({});
        },
      },
    };
    dispatchScheduleUpdate(runtime, id, { name: 'Glazing Schedule' });
    expect(scheduleName(id)).toBe('Glazing Schedule');
  });

  it('the edit is undoable — UpdateScheduleCommand.undo restores the prior definition', () => {
    const id = 'Rooms Schedule';
    const before = storeFields(id)!;

    const cmd = new UpdateScheduleCommand(id, { fields: ['number', 'name'] });
    cmd.execute({} as never);
    expect(storeFields(id)).toEqual(['number', 'name']);

    cmd.undo({} as never);
    expect(storeFields(id)).toEqual(before);
  });

  it('drops the edit (no throw) when no command bus is available', () => {
    const ok = dispatchScheduleUpdate(null, 'Doors Schedule', { fields: ['mark'] });
    expect(ok).toBe(false);
    // Store untouched.
    expect(storeFields('Doors Schedule')).not.toEqual(['mark']);
  });
});
