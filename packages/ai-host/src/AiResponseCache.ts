// @pryzm/ai-host — AI Response Cache (ADR-050 · C09 §2.3).
//
// Spec source:
//   • `docs/archive/pryzm3-internal/04-PLAN-FORWARD/46-IMPLEMENTATION-PLAN-2026-05-08.md`
//     Task 4.5 — "AI response cache (ADR-050 · C09 §2.3)".
//
// Three exports:
//   • `hashWorkflowRequest(workflow, input)` — pure Web-Crypto SHA-256
//     of the canonical request payload.  Available in browsers, Node 18+,
//     and Web Workers (globalThis.crypto.subtle).
//   • `AiResponseCacheFetchAdapter` — browser-side bridge to the BFF
//     cache routes (`POST /api/ai/cache/lookup` + `/api/ai/cache/store`).
//     Used by `AiHost.impl.ts` as the default cache in production.
//   • `MockAiResponseCache` — in-memory stub for unit tests.
//
// PURE: no DOM-only APIs beyond `crypto.subtle` (Web Crypto is available
// everywhere the ai-host package runs).  No DB imports.

import type { AiCacheKey, AiResponseCacheLike, WorkflowRunResult } from './types.js';

// ── Hash ────────────────────────────────────────────────────────────────────

/** Compute the SHA-256 content hash for a workflow request.
 *  The hash is over `JSON.stringify({ workflow, input })` — deterministic
 *  for identical inputs regardless of actorId or plan tier, matching
 *  ADR-050 §2 ("same floor plan geometry, same model version → same hash").
 *
 *  Uses `globalThis.crypto.subtle` (Web Crypto API), available in:
 *    - Browsers (all modern)
 *    - Node.js 18+ (built-in, no polyfill needed)
 *    - Web Workers / Service Workers */
export async function hashWorkflowRequest(workflow: string, input: unknown): Promise<string> {
  const canonical = JSON.stringify({ workflow, input: input ?? null });
  const encoded = new TextEncoder().encode(canonical);
  const hashBuf = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Fetch adapter (browser → BFF) ───────────────────────────────────────────

/** Browser-side cache adapter.  Bridges to the BFF cache routes:
 *    POST /api/ai/cache/lookup  → { hit: boolean; result?: WorkflowRunResult }
 *    POST /api/ai/cache/store   → { ok: boolean }
 *
 *  Both calls are best-effort: failures are swallowed so a degraded
 *  cache never blocks an AI workflow from completing (ADR-050 §6). */
export class AiResponseCacheFetchAdapter implements AiResponseCacheLike {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    base = '/api/ai/cache',
    fetchImpl?: typeof fetch,
  ) {
    this.base = base;
    this.fetchImpl = fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async get(key: AiCacheKey): Promise<WorkflowRunResult | null> {
    try {
      const r = await this.fetchImpl(`${this.base}/lookup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(key),
      });
      if (!r.ok) return null;
      const data = (await r.json()) as { hit: boolean; result?: WorkflowRunResult };
      return data.hit && data.result != null ? data.result : null;
    } catch {
      return null;
    }
  }

  async set(key: AiCacheKey, value: WorkflowRunResult, ttlDays = 7): Promise<void> {
    try {
      await this.fetchImpl(`${this.base}/store`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...key, result: value, ttlDays }),
      });
    } catch {
      // Best-effort — never block the caller.
    }
  }
}

// ── Mock (unit tests) ────────────────────────────────────────────────────────

/** In-memory cache implementation for unit tests.  Thread-safe within
 *  a single Node.js event-loop turn (synchronous operations under the
 *  async interface). */
export class MockAiResponseCache implements AiResponseCacheLike {
  private readonly store = new Map<string, WorkflowRunResult>();
  readonly getCalls: AiCacheKey[] = [];
  readonly setCalls: Array<{ key: AiCacheKey; value: WorkflowRunResult; ttlDays: number }> = [];

  private static makeKey(k: AiCacheKey): string {
    return `${k.tenantId}::${k.modelVersion}::${k.contentHash}`;
  }

  /** Seed the cache with a pre-existing entry (test helper). */
  prime(key: AiCacheKey, value: WorkflowRunResult): void {
    this.store.set(MockAiResponseCache.makeKey(key), value);
  }

  async get(key: AiCacheKey): Promise<WorkflowRunResult | null> {
    this.getCalls.push(key);
    return this.store.get(MockAiResponseCache.makeKey(key)) ?? null;
  }

  async set(key: AiCacheKey, value: WorkflowRunResult, ttlDays = 7): Promise<void> {
    this.setCalls.push({ key, value, ttlDays });
    this.store.set(MockAiResponseCache.makeKey(key), value);
  }

  /** Snapshot of currently stored keys (for assertions). */
  keys(): string[] {
    return [...this.store.keys()];
  }
}
