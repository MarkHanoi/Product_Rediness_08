// SheetStore re-export — canonical store for the sheets plugin.
//
// Wave 12 recipe completion: sheets plugin store.ts (previously missing).
//
// The sheets plugin manages sheet definitions via SheetStore and
// ActiveSheetStore from @pryzm/plugin-sdk (L3 —
// packages/stores/src/SheetStore.ts). This file re-exports them as
// the canonical store.ts so the Wave 12 verifier finds the file at
// plugins/sheets/src/store.ts.
//
// Handlers receive ctx.stores.sheet: SheetStore and
// ctx.stores.activeSheet: ActiveSheetStore.

export {
  SheetStore,
  ActiveSheetStore,
} from '@pryzm/plugin-sdk';
