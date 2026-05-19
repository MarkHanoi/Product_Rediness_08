// @pryzm/ai-worker — workflow handler registry (S47).
//
// Spec: §S47 D5 (line 661) — "end-to-end smoke (mock AI batch →
// approval queue → manual accept → command commit)". The mock
// `floorplan` handler below is the unit of that smoke. Real handlers
// for `generative`, `rules`, `cv`, `voice` land at S49-S52.

import type {
  HandlerResult,
  WorkflowHandler,
  WorkflowJob,
} from './types.js';
import type { AiWorkflowKind } from '@pryzm/ai-host/types';

/** Registry maps workflow kind → handler. Unknown kinds throw at
 *  dispatch time so a missing handler is loud, not silent. */
export class HandlerRegistry {
  private readonly map = new Map<AiWorkflowKind, WorkflowHandler>();

  register(kind: AiWorkflowKind, handler: WorkflowHandler): void {
    if (this.map.has(kind)) {
      throw new Error(`[ai-worker] Handler for '${kind}' already registered.`);
    }
    this.map.set(kind, handler);
  }

  has(kind: AiWorkflowKind): boolean {
    return this.map.has(kind);
  }

  async dispatch(job: WorkflowJob): Promise<HandlerResult> {
    const handler = this.map.get(job.kind);
    if (!handler) {
      throw new Error(`[ai-worker] No handler registered for '${job.kind}'.`);
    }
    return handler(job);
  }
}

/** Mock floorplan handler. Produces a single placeholder command
 *  payload so the approval-queue UI has something to render. The real
 *  handler wires Anthropic via the CF Worker relay at S49. */
export const mockFloorplanHandler: WorkflowHandler = async (job) => {
  const result: HandlerResult = {
    proposedCommands: [
      {
        command: 'floorplan.draft',
        payload: {
          projectId: job.projectId,
          inputDigest: digestInput(job.input),
        },
      },
    ],
    estimatedCostUsd: 0,
    preview: { kind: 'json', data: { workflow: job.kind, jobId: job.id } },
  };
  return result;
};

function digestInput(input: unknown): string {
  if (input == null) return 'empty';
  try {
    return `len:${JSON.stringify(input).length}`;
  } catch {
    return 'unserialisable';
  }
}

/** Build a registry pre-populated with all S47 mock handlers. */
export function createDefaultRegistry(): HandlerRegistry {
  const r = new HandlerRegistry();
  r.register('floorplan', mockFloorplanHandler);
  return r;
}

// ─── S50 — CV registry ────────────────────────────────────────────
//
// Spec source: `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md`
// §S50 lines 244-267 ("processFloorplanSegmentation" reference
// impl). The CV handler is constructed via a factory because it
// owns three injected deps (runtime, storage, costMeter) — keeping
// the factory + the registry-builder together gives callers a
// single entrypoint for the CV-enabled worker.

import { createCvHandler } from './cv/handler.js';
import type { CreateCvHandlerOpts } from './cv/handler.js';
import { MOCK_RUNTIME } from './cv/runtime.js';
import { InMemoryStorage } from './cv/storage.js';

/** Build a registry pre-populated with all S47 mock handlers AND
 *  the S50 CV floorplan-segmentation handler. The CV handler needs
 *  injected deps; callers can pass partials and the helper fills in
 *  the in-memory / mock defaults so dev + tests just work. */
export function createCvRegistry(
  opts: Partial<CreateCvHandlerOpts> = {},
): HandlerRegistry {
  const r = createDefaultRegistry();
  const cvOpts: CreateCvHandlerOpts = {
    runtime: opts.runtime ?? MOCK_RUNTIME,
    storage: opts.storage ?? new InMemoryStorage(),
    ...(opts.costMeter ? { costMeter: opts.costMeter } : {}),
    ...(opts.onOutcome ? { onOutcome: opts.onOutcome } : {}),
    ...(opts.perPageCeilingUsd !== undefined
      ? { perPageCeilingUsd: opts.perPageCeilingUsd }
      : {}),
    ...(opts.mockCostUsd !== undefined ? { mockCostUsd: opts.mockCostUsd } : {}),
  };
  r.register('cv', createCvHandler(cvOpts));
  return r;
}
