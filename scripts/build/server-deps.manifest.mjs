/**
 * §L-442 — the ONE list of workspace packages the production server imports.
 *
 * Shared by:
 *   • scripts/build/build-server-deps.mjs      (what to precompile)
 *   • scripts/build/check-server-deps.mjs      (the guard: nothing else may appear)
 *   • scripts/build/apply-server-deps-overlay.mjs (what to swap into node_modules)
 *
 * Adding a `@pryzm/*` import to server.js or server/** WITHOUT adding it here is
 * a build FAILURE, not a runtime surprise — see check-server-deps.mjs. That guard
 * is the whole point: the old design tolerated any new workspace import silently
 * (tsx would just transpile it at boot), which is how boot cost grew unnoticed.
 */

/**
 * @typedef {object} ServerDep
 * @property {string} pkg      npm package name, e.g. '@pryzm/file-format'
 * @property {string[]} subpaths  export subpaths actually imported at runtime.
 *                                '.' means the package root. Each becomes one bundle.
 */

/** @type {ServerDep[]} */
export const SERVER_DEPS = [
  // server/telemetry.js → `import { initTracing } from '@pryzm/crash-reporter'`
  { pkg: '@pryzm/crash-reporter', subpaths: ['.'] },
  // server/familyMarketplaceRoutes.js → `from '@pryzm/file-format/server'`
  // NOTE: only './server' is precompiled. The package root ('.') pulls in the
  // browser graph (three.js, pdfjs, web-ifc) and is deliberately NOT shipped —
  // an accidental server-side `import '@pryzm/file-format'` must fail loudly.
  { pkg: '@pryzm/file-format', subpaths: ['./server'] },
];

/** Output slug for a (pkg, subpath) pair → dist/server-deps/<pkg>/<slug>.mjs */
export function bundleSlug(subpath) {
  return subpath === '.' ? 'index' : subpath.replace(/^\.\//, '').replace(/\//g, '__');
}

/** Directories scanned by the guard for `@pryzm/*` import specifiers. */
export const RUNTIME_SOURCE_ROOTS = ['server.js', 'server'];
