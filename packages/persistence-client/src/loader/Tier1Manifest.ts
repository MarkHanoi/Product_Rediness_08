// loader/Tier1Manifest.ts — Tier 1 manifest fetch (S23 D2).
//
// Spec source: `docs/00_NEW_ARCHITECTURE/phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • §S23 line 1090 — "Fetches the manifest first (< 100 ms — it's
//     a few KB of JSON)."
//   • §S23 D2 (line 1236) — "Implement TierStreamedLoader Tier 1
//     (manifest fetch + parse). Unit test: manifest fetch → returns
//     correctly typed `Manifest` in < 100 ms on a small fixture."
//
// Tier 1 is the only tier that BLOCKS the load.  Without the
// manifest the loader does not know what chunks exist or what the
// stack of levels looks like.  Everything else is parallelisable
// after Tier 1 returns.
//
// The fetch callback is INJECTED — production wires it to a signed-
// URL R2 fetch (Phase 2D), the bench harness wires it to an in-
// memory shortcut, and tests wire it to a `Promise.resolve(...)`
// stub.  No `fetch()` global is referenced from inside the loader,
// keeping it node-portable for the bench harness.
//
// Validation runs inside `parseManifest` (Zod) — corrupt manifests
// throw `ZodError` synchronously and the orchestrator translates
// that into a `LoaderError` with `code: 'manifest-invalid'`.

import { parseManifest, type Manifest } from '../manifest.js';
import { withLoaderSpan } from './otel.js';

/**
 * Pluggable manifest fetcher.  Returns either:
 *   * a `string` (raw JSON the loader will parse + Zod-validate), or
 *   * a `Manifest` (already-parsed; bench harness uses this to
 *     measure pure load timing without including JSON.parse cost).
 *
 * Returning a `Manifest` is allowed at the type level so test
 * harnesses can inject a hand-built object; production fetchers
 * MUST return a string so corruption is caught at parse time.
 */
export type ManifestFetcher = (projectId: string) => Promise<string | Manifest>;

export interface Tier1Result {
  readonly manifest: Manifest;
  readonly fetchedAt: number;
  /** Wall-clock duration from `fetch()` start to validated `Manifest`. */
  readonly durationMs: number;
}

export class Tier1Manifest {
  constructor(private readonly fetcher: ManifestFetcher) {}

  async load(projectId: string): Promise<Tier1Result> {
    return withLoaderSpan(
      'pryzm.loader.tier1',
      { 'pryzm.loader.projectId': projectId },
      async (span) => {
        const t0 = nowMs();
        const raw = await this.fetcher(projectId);
        const manifest = typeof raw === 'string' ? parseManifest(raw) : raw;
        // Defensive: if a test passes a Manifest object that bypasses
        // Zod parse (e.g. cast through `as Manifest`), re-validate.
        const validated = typeof raw === 'string' ? manifest : parseManifest(manifest);
        const durationMs = nowMs() - t0;
        span.setAttribute('pryzm.loader.tier1.duration_ms', durationMs);
        span.setAttribute('pryzm.loader.tier1.chunk_count', validated.chunks.length);
        span.setAttribute('pryzm.loader.tier1.level_count', validated.levels.length);
        span.setAttribute('pryzm.loader.tier1.event_log_length', validated.eventLogLength);
        return { manifest: validated, fetchedAt: t0, durationMs };
      },
    );
  }
}

function nowMs(): number {
  // performance.now() is available in browsers + Node ≥ 8; the
  // import-from-node-perf-hooks form keeps types clean for the
  // node-side bench harness.
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
