// SheetList — read-model + dispatch helpers for the sheet sidebar
// (S37 / ADR-0031 / Phase 2C).
//
// The UI surface (React component, drag handle DOM, etc.) lives in
// `apps/editor`.  This file is pure VIEW-MODEL logic — what the
// sidebar needs to display and the dispatcher functions it calls when
// the user clicks "+", "delete", drag-drops, etc.  Keeping this file
// pure (no DOM imports) means tests run in the Node environment with
// no jsdom required.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • `getSheetListItems(sheetStore, activeSheetStore)` — sorted items
//   in canonical display order, with `isActive` precomputed for the
//   sidebar to render in one pass.
// • `subscribeSheetList(sheetStore, activeSheetStore, onChange)` —
//   merge the two stores' dirty signals into a single `onChange()`
//   listener; returns a single Disposer that unsubscribes both.
// • `dispatch*` helpers wrap the `commandBus.execute({ type, payload })`
//   call with positional arguments so the sidebar caller doesn't need
//   to know the command-bus payload shape.

import type { CommandBus } from '@pryzm/plugin-sdk';
import type { SheetStore, ActiveSheetStore } from '@pryzm/plugin-sdk';
import type { SheetData } from '@pryzm/plugin-sdk';

export interface SheetListItem {
  readonly id: string;
  readonly name: string;
  readonly number: string;
  readonly seq: number;
  readonly isActive: boolean;
}

export type SheetListChangeListener = () => void;

export interface SheetListDisposer {
  (): void;
}

/** Build the sidebar item list in canonical display order. */
export function getSheetListItems(
  sheetStore: SheetStore,
  activeSheetStore: ActiveSheetStore,
): readonly SheetListItem[] {
  const activeId = activeSheetStore.getActive().activeSheetId;
  const items = sheetStore.list().map<SheetListItem>((s: SheetData) => ({
    id: s.id,
    name: s.name,
    number: s.number,
    seq: s.seq,
    isActive: s.id === activeId,
  }));
  return Object.freeze(items);
}

/** Subscribe to either sheet-store mutations or active-sheet changes;
 *  the sidebar re-renders on either signal.  Idempotent disposer. */
export function subscribeSheetList(
  sheetStore: SheetStore,
  activeSheetStore: ActiveSheetStore,
  onChange: SheetListChangeListener,
): SheetListDisposer {
  const d1 = sheetStore.subscribeDirty(() => onChange());
  const d2 = activeSheetStore.subscribeDirty(() => onChange());
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    d1();
    d2();
  };
}

/** Activate a sheet (or clear by passing `null`).  This goes through
 *  the ActiveSheetStore directly — the same ephemeral semantics as
 *  view.switch (see ADR-0016). */
export function activateSheet(
  activeSheetStore: ActiveSheetStore,
  sheetId: string | null,
): void {
  activeSheetStore.setActive(sheetId);
}

/** Dispatch `sheet.create` via the bus.  Returns the bus' Promise<EventRecord>. */
export function dispatchCreateSheet(
  bus: CommandBus,
  payload: Readonly<Record<string, unknown>> = {},
): unknown {
  return bus.executeCommand('sheet.create', payload);
}

export function dispatchDeleteSheet(bus: CommandBus, sheetId: string): unknown {
  return bus.executeCommand('sheet.delete', { sheetId });
}

export function dispatchRenameSheet(
  bus: CommandBus,
  sheetId: string,
  changes: Readonly<{ name?: string; number?: string }>,
): unknown {
  return bus.executeCommand('sheet.rename', { sheetId, ...changes });
}

export function dispatchReorderSheet(
  bus: CommandBus,
  sheetId: string,
  newIndex: number,
): unknown {
  return bus.executeCommand('sheet.reorder', { sheetId, newIndex });
}
