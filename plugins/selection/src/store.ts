// SelectionStore re-export — canonical store for the selection plugin.
//
// Wave 12 recipe completion: selection plugin store.ts (previously missing).
//
// The selection store is provided by @pryzm/plugin-sdk as SelectionStore
// (L3 — packages/stores/src/SelectionStore.ts). This file re-exports it
// as the canonical store.ts for the selection plugin so the Wave 12
// verifier finds the file at plugins/selection/src/store.ts.
//
// Handlers receive ctx.stores.selection: SelectionStore and call
// .select() / .deselect() / .clear() — see handlers/Select.ts etc.

export {
  SelectionStore,
  type SelectionMode,
  type SelectionTarget,
} from '@pryzm/plugin-sdk';
