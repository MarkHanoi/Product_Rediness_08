// ViewStore re-export — canonical store for the view plugin.
//
// Wave 12 recipe completion: view plugin store.ts (previously missing).
//
// The view plugin manages ViewDefinitions via the ViewRegistry provided
// by @pryzm/plugin-sdk (L3 — packages/stores/src/ViewRegistry.ts).
// This file re-exports ViewRegistry as the canonical store.ts so the
// Wave 12 verifier finds the file at plugins/view/src/store.ts.
//
// Handlers receive ctx.stores.view: ViewRegistry and call
// .getState() / applyPatch() per the store contract.

export { ViewRegistry, type ViewDefinition, type ViewId } from '@pryzm/plugin-sdk';
