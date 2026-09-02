// @pryzm/family-loader/bytes — the BROWSER-SAFE surface of the one loader.
//
// ⚠ WHY THIS ENTRY EXISTS (lane U0, 2026-09-02).  The root entry re-exports
//   `loadFamily(path)`, whose module imports `node:fs/promises` at module scope.
//   The editor's component catalogue (`apps/editor/src/services/componentCatalog/`)
//   runs in the Vite client graph and consumes ONLY the bytes leg — a file-open
//   `<input type=file>` and the marketplace `GET /api/v1/families/:id/download`
//   both hand it bytes.  Importing this subpath keeps the client graph free of
//   Node builtins WITHOUT minting a second loader: `loadFamilyFromBytes` here IS
//   the function `loadFamily(path)` delegates to (audit R1 — one loader).
//
// ⛔ Do not add anything here that is not a re-export of the loader's own
//   browser-safe modules.  A helper written "just for the browser" would be the
//   start of the rival pipeline this file's whole purpose is to prevent.

export { loadFamilyFromBytes } from './loadFamilyFromBytes.js';
export {
  createFamilyCache,
  defaultFamilyCache,
  type FamilyCache,
  type FamilyCacheOptions,
} from './cache.js';
export type {
  LoadedFamily,
  PreflightResult,
  LoadFamilyOptions,
  LoadFamilyResult,
  LoadFamilyErrorReason,
} from './types.js';
