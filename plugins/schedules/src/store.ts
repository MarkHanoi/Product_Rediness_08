// ScheduleStore re-export — canonical store for the schedules plugin.
//
// Wave 12 recipe completion: schedules plugin store.ts (previously missing).
//
// The schedules plugin manages schedule definitions via ScheduleStore
// and ActiveScheduleStore from @pryzm/plugin-sdk (L3 —
// packages/stores/src/ScheduleStore.ts). This file re-exports them as
// the canonical store.ts so the Wave 12 verifier finds the file at
// plugins/schedules/src/store.ts.
//
// Handlers receive ctx.stores.schedule: ScheduleStore and
// ctx.stores.activeSchedule: ActiveScheduleStore.

export {
  ScheduleStore,
  ActiveScheduleStore,
} from '@pryzm/plugin-sdk';
