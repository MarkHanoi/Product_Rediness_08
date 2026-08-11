// C27 INS-α-3 (BIM 3.0 Inspect Model) — intents sub-barrel.
//
// Re-exports the IsolationVisibilityIntent surface for consumption via
// the package root barrel (`@pryzm/visibility`).  Future inspect-driven
// intents (e.g. master-tree pin overrides) land here.

export * from './IsolationIntent.js';

// W3-1 revival — the WRITE side of the visibility domain. `evaluateViewVisibility`
// reads `activeView.hiddenElementIds` / `.temporaryIsolation`; until this store
// landed, nothing in production ever wrote either field.
export * from './ViewVisibilityIntentStore.js';

// W3-2 — the five command handlers that turn a user gesture into a store write.
// Relocated here from `plugins/visibility-intent` (L6): P7 makes visibility intent
// a domain concept, and the composition root (L3) must be able to register these
// without an upward import. See the file header for the full reasoning.
export * from './visibilityIntentCommands.js';
