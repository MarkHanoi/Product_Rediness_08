// @pryzm/persistence-client/node — node-only sub-entry.
//
// Holds the backends that import `node:fs/promises` / `node:path` so they
// never enter the browser bundle by way of the main barrel.  Vite + Rollup
// fail to externalise `node:path` cleanly when the symbol set drifts (see
// `__vite-browser-external` "resolve is not exported" error before
// 2026-04-28); the fix is to keep the node-touching code on a sub-path
// that the browser never imports.
//
// Browser code must import `EventLog`, `InMemoryBackend`, `IndexedDbBackend`
// from the package root.  Node code imports `FileSystemBackend` here.

export {
  FileSystemBackend,
  type FileSystemBackendOptions,
} from './backends/FileSystemBackend.js';
