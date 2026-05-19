// @pryzm/ai-host — public lazy entry (S47).
//
// Spec source:
//   • `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S47 lines
//     587-611 ("Implementation Detail — `AiHost.ts` lazy bootstrap").
//   • `[strategic ADR-014]` — AI L7.5 placement; lazy-loaded.
//   • Verification gate K3-A (line 611) — if at end of S54 the AI host
//     has > 5% boot impact (loaded eagerly somewhere by accident),
//     Phase 3B halts.
//
// Contract: this module imports ZERO non-type symbols from
// `./AiHost.impl.js`. The first call to `getAiHost()` triggers the
// dynamic import; subsequent calls are O(1).
//
// The Vite/esbuild dynamic-import boundary is `await import('./...')`
// with a string literal — both bundlers tree-shake `AiHost.impl` into
// its own chunk regardless of the editor's import graph. The static
// check in `scripts/check-ai-host-lazy.mjs` enforces that no app code
// imports `AiHost.impl` directly (which would fold it back into the
// caller's chunk).

import type { AiHost, AiHostOptions } from './types.js';

let _host: AiHost | null = null;
let _pending: Promise<AiHost> | null = null;

/** Return the lazily-instantiated singleton AI host.
 *  - First call: dynamically imports `./AiHost.impl.js`, constructs
 *    the host, caches it, returns it.
 *  - Concurrent first calls: the in-flight Promise is shared so we
 *    never double-construct.
 *  - Subsequent calls: O(1) cached return. */
export async function getAiHost(opts?: AiHostOptions): Promise<AiHost> {
  if (_host) return _host;
  if (_pending) return _pending;
  _pending = (async () => {
    // Dynamic import — Vite tree-shakes this out of the editor's main
    // bundle. The string MUST be a literal so the bundler can resolve
    // the chunk at build time.
    const mod = await import('./AiHost.impl.js');
    _host = mod.createAiHost(opts ?? {});
    _pending = null;
    return _host;
  })();
  return _pending;
}

/** Test-only — drop the cached host so a fresh `getAiHost()` re-loads
 *  the impl module (or a mocked one). NOT exported from index.ts —
 *  test code imports it explicitly via `'@pryzm/ai-host/AiHost'`. */
export function _resetAiHostForTests(): void {
  _host = null;
  _pending = null;
}

/** Diagnostic — `true` iff `AiHost.impl` has been loaded (the contract
 *  K3-A polls for during the editor first-paint test). */
export function isAiHostLoaded(): boolean {
  return _host !== null;
}
