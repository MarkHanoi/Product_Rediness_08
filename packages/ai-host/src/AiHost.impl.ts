// @pryzm/ai-host — implementation chunk (S47).
//
// CRITICAL: this module is the LAZY half of the [strategic ADR-014]
// contract. NO module under `apps/editor` (or any L7-or-below code)
// may import this file directly. The editor's `getAiHost()` call site
// uses `await import('./AiHost.impl.js')` with a string literal so
// Vite emits a separate chunk; the static check in
// `scripts/check-ai-host-lazy.mjs` enforces this at build / CI time.
//
// Spec source: §S47 lines 587-611 ("Implementation Detail — `AiHost.ts`
// lazy bootstrap").

import type {
  AiApprovalQueueLike,
  AiHost,
  AiHostOptions,
  AiPendingAction,
  AiWorkflowRequest,
} from './types.js';
import { withWorkflowSpan } from './tracing.js';
import { AiBus } from './AiBus.js';
import { AiPlane } from './AiPlane.js';
import { WorkflowRegistry } from './WorkflowRegistry.js';
import { CostMeter } from '@pryzm/ai-cost';
import { AiResponseCacheFetchAdapter } from './AiResponseCache.js';

/** S70 D8 — Self-host BYO-key safety cap per SPEC-28 §11 + ADR-0052 §B.6.
 *  Resolves at host-construction time:
 *    - `PRYZM_SELFHOST=1|true|yes` → enable BYO-key mode
 *    - `PRYZM_SELFHOST_PER_CALL_CAP_USD=<N>` → override the $25 default
 *  Anything else → SaaS mode (unchanged from S49+).
 *
 *  Read once at module-evaluation time so the meter ctor sees a
 *  deterministic snapshot.  Operator-side, the env vars are set in the
 *  pryzm-selfhost docker-compose `editor` service env block. */
function resolveSelfHostFromEnv(): { selfHostMode: boolean; selfHostPerCallCapUsd?: number } {
  const env = (typeof process !== 'undefined' && process.env) || {};
  const flag = String(env.PRYZM_SELFHOST ?? '').toLowerCase();
  const selfHostMode = flag === '1' || flag === 'true' || flag === 'yes';
  const capRaw = env.PRYZM_SELFHOST_PER_CALL_CAP_USD;
  const cap = capRaw !== undefined && capRaw !== '' ? Number(capRaw) : NaN;
  if (selfHostMode && Number.isFinite(cap) && cap > 0) {
    return { selfHostMode: true, selfHostPerCallCapUsd: cap };
  }
  return { selfHostMode };
}

const DEFAULT_WORKER_ENDPOINT = '/api/ai-worker';
const DEFAULT_ANTHROPIC_RELAY = '/api/ai/anthropic';

/** Construct the AI host singleton. Called once by `getAiHost()` after
 *  the dynamic import completes. */
export function createAiHost(opts: AiHostOptions): AiHost {
  const workerEndpoint = opts.workerEndpoint ?? DEFAULT_WORKER_ENDPOINT;
  const anthropicRelay = opts.anthropicRelay ?? DEFAULT_ANTHROPIC_RELAY;
  const fetchImpl = opts.fetch ?? globalThis.fetch?.bind(globalThis);
  const approvalQueue: AiApprovalQueueLike | null = opts.approvalQueue ?? null;

  // ADR-050 — resolve the response cache.  Priority order:
  //   1. Caller explicitly passes `responseCache` (including `null` to
  //      force-disable — `null !== undefined` so the branch is skipped).
  //   2. `fetch` is available → auto-wire `AiResponseCacheFetchAdapter`
  //      pointing at the BFF cache routes on `server.js`.
  //   3. No `fetch` (headless / SSR without fetch polyfill) → undefined
  //      (cache disabled, fall-through to relay every call).
  const resolvedCache =
    opts.responseCache !== undefined
      ? (opts.responseCache ?? undefined)   // null → undefined (disabled)
      : typeof fetchImpl === 'function'
        ? new AiResponseCacheFetchAdapter('/api/ai/cache', fetchImpl)
        : undefined;

  // S49 — first-class L7.5 plane. The plane wraps the queue + cost
  // meter + workflow registry behind a single object so the public
  // AI API (S53) and third-party plugins (3B) both target it
  // through the registered AiHost.
  let plane: AiPlane | null = null;
  if (approvalQueue) {
    plane = new AiPlane({
      approvalQueue,
      bus: new AiBus({ otelPrefix: 'pryzm.ai' }),
      costMeter: new CostMeter(resolveSelfHostFromEnv()),
      workflowRegistry: new WorkflowRegistry(),
      ...(resolvedCache ? { responseCache: resolvedCache } : {}),
    });
  }

  // Counter feeds idempotency-fallback ids for clients that don't
  // supply `clientRequestId`. Monotonic per host instance.
  let seq = 0;

  async function submit(req: AiWorkflowRequest): Promise<AiPendingAction> {
    return withWorkflowSpan(req.workflow, async () => {
      const requestId = req.clientRequestId
        ?? `local-${Date.now().toString(36)}-${(++seq).toString(36)}`;

      // S47 contract: enqueue against the worker endpoint and return
      // a synthesised `AiPendingAction`. The real worker lands at
      // S49+; until then the worker route may not exist, so a
      // missing fetch / 404 fails open (we still produce the pending
      // action so the approval-queue UI is exercisable end-to-end
      // per spec D5).
      let workerAck: { id?: string } | null = null;
      if (fetchImpl) {
        try {
          const r = await fetchImpl(workerEndpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              workflow: req.workflow,
              projectId: req.projectId,
              input: req.input ?? null,
              clientRequestId: requestId,
            }),
          });
          if (r.ok) {
            workerAck = (await r.json().catch(() => ({}))) as { id?: string };
          }
        } catch {
          // Fail-open in S47 — worker may not be wired yet.
          workerAck = null;
        }
      }

      const action: AiPendingAction = {
        id: workerAck?.id ?? `pending-${requestId}`,
        runId: requestId,
        workflow: req.workflow,
        proposedCommands: [],
        estimatedCostUsd: 0,
        createdAt: Date.now(),
        status: 'pending',
      };
      approvalQueue?.enqueue(action);
      return action;
    }) as Promise<AiPendingAction>;
  }

  return {
    submit,
    options: { workerEndpoint, anthropicRelay },
    ...(plane ? { plane } : {}),
  };
}

// Re-export the relay default so callers asking
// `import('./AiHost.impl').then(m => m.DEFAULT_ANTHROPIC_RELAY)` get a
// stable answer. Used by `scripts/check-ai-host-lazy.mjs` to verify
// the impl module is reachable but never statically referenced.
export { DEFAULT_WORKER_ENDPOINT, DEFAULT_ANTHROPIC_RELAY };
