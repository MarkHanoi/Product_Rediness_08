// ScheduleStore — domain store for schedules (S41 / Phase 2C).
//
// Spec: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S41 lines
// 725–905 ("Schedule Store + Schedule View").  6 handlers in S41
// (CreateSchedule, DeleteSchedule, AddColumn, RemoveColumn,
// SetGroupBy, SetFilter) — see `plugins/schedules/src/handlers/`.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// Mirrors `SheetStore`:
//   • Map<ScheduleId, ScheduleData> indexed by the schedule's stable id.
//   • Mutations land via `applyPatch(immerPatches)` only.
//   • Display order is the canonical `ScheduleData.seq` field — `list()`
//     returns schedules sorted by `seq` ascending, ties broken by id.
//   • Active-schedule tracking lives in the SEPARATE `ActiveScheduleStore`
//     (singleton-on-Store pattern matching `ActiveSheetStore`).
//
// The handler layer (`plugins/schedules/src/handlers/*`) is the only legal
// mutation surface; this file exposes pure read selectors only.

import { Store } from './Store.js';
import type { ScheduleData, ScheduleId } from '@pryzm/schemas/schedule';

export type SchedulesState = Record<string, ScheduleData>;

export class ScheduleStore extends Store<ScheduleData> {
  constructor() { super('schedule'); }

  ids(): readonly ScheduleId[] { return [...this.state.keys()]; }

  get(id: ScheduleId): Readonly<ScheduleData> | undefined { return this.state.get(id); }

  /** All schedules in canonical display order (ascending `seq`).
   *  Returns a fresh frozen array on every call — listeners use
   *  `subscribeDirty` to know when to re-fetch. */
  list(): ReadonlyArray<ScheduleData> {
    const arr = [...this.state.values()];
    arr.sort((a, b) => a.seq - b.seq || a.id.localeCompare(b.id));
    return Object.freeze(arr);
  }

  /** Maximum `seq` value in the store, or `-1` if the store is empty.
   *  CreateSchedule uses `nextSeq() + 1` to append at the end. */
  nextSeq(): number {
    let max = -1;
    for (const s of this.state.values()) if (s.seq > max) max = s.seq;
    return max;
  }

  /** All schedules bound to a given element family (e.g. 'door').
   *  Returns a fresh frozen array, sorted by seq.  Useful for the
   *  "Schedules of: <family>" sidebar grouping in the editor. */
  byElementType(elementType: string): ReadonlyArray<ScheduleData> {
    const arr: ScheduleData[] = [];
    for (const s of this.state.values()) {
      if (s.elementType === elementType) arr.push(s);
    }
    arr.sort((a, b) => a.seq - b.seq || a.id.localeCompare(b.id));
    return Object.freeze(arr);
  }

  /** Find a schedule by user-facing name (first match, case-sensitive).
   *  Names are NOT enforced unique — two schedules can carry identical
   *  display names if they bind to different element types. */
  byName(name: string): Readonly<ScheduleData> | undefined {
    for (const s of this.state.values()) if (s.name === name) return s;
    return undefined;
  }
}
