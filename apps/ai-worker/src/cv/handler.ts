// @pryzm/ai-worker — CV floorplan-segmentation handler (S50 D4 + D6).
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md` §S50
//     lines 244-267 ("processFloorplanSegmentation" reference impl).
//   • `SPEC-45 §2.1`, `§2.2`, `§3` (cost), `§4` (worker placement).
//
// Pipeline per phase doc lines 247-267:
//   1. fetch the page raster (caller supplies via job.input.page).
//   2. classify the page; skip non-plan pages.
//   3. preCheckBudget against the SPEC-45 §3 per-page ceiling.
//   4. run the segmentation model.
//   5. recordCall with the actual cost + duration.
//   6. upload the mask to project-scoped storage.
//   7. return `{ status, maskUrl, classification }`.

import type { HandlerResult, WorkflowHandler, WorkflowJob } from '../types.js';
import type {
  FloorplanSegJob,
  FloorplanSegOutcome,
  ModelRuntime,
  StoragePorter,
} from './types.js';
import { classifyPage, PLAN_ROUTING_THRESHOLD } from './page-classification.js';
import { runSegmentationModel } from './floorplan-segmentation.js';
import { maskKey } from './storage.js';

/** SPEC-45 §3 per-page hard cap. Exposed so the handler + its tests
 *  share the source of truth. */
export const PDF_TO_BIM_PER_PAGE_CEILING_USD = 0.05;

/** Cost-meter contract the handler depends on — a structural subset
 *  of the @pryzm/ai-cost CostMeter so the worker doesn't need a
 *  static import. The plane wires the real meter at construction. */
export interface CostMeterLike {
  preCheckBudget(
    projectId: string,
    estimatedCostUsd: number,
  ): Promise<{ ok: true } | { ok: false; reason: string }>;
  recordCall(
    workflow: string,
    projectId: string,
    costUsd: number,
    latencyMs: number,
    extras?: Record<string, unknown>,
  ): Promise<void> | void;
}

/** Optional sink the handler calls with the structured outcome —
 *  used by the e2e smoke test + the eventual `pdf_jobs` row writer
 *  (server-side). Keeps the handler pure. */
export type FloorplanSegOutcomeSink = (
  outcome: FloorplanSegOutcome,
  job: WorkflowJob,
) => void | Promise<void>;

export interface CreateCvHandlerOpts {
  readonly runtime: ModelRuntime;
  readonly storage: StoragePorter;
  readonly costMeter?: CostMeterLike;
  readonly onOutcome?: FloorplanSegOutcomeSink;
  /** Override per-page ceiling for tests. Defaults to SPEC-45 §3. */
  readonly perPageCeilingUsd?: number;
  /** Mock cost emitter — production path measures actual model spend
   *  via the runtime; the mock returns the per-page ceiling × 0.5 so
   *  recordCall has a non-zero number. */
  readonly mockCostUsd?: number;
}

const FLOORPLAN_SEG_SURFACE = 'cv-floorplan-segmentation';

/** Build a `WorkflowHandler` (matching the registry signature) that
 *  runs the floorplan-segmentation pipeline on the supplied job. */
export function createCvHandler(opts: CreateCvHandlerOpts): WorkflowHandler {
  const ceiling = opts.perPageCeilingUsd ?? PDF_TO_BIM_PER_PAGE_CEILING_USD;
  const mockCost = opts.mockCostUsd ?? ceiling * 0.5;

  return async function processFloorplanSegmentation(
    job: WorkflowJob,
  ): Promise<HandlerResult> {
    const input = job.input as FloorplanSegJob | undefined;
    if (!input || !input.page) {
      const outcome: FloorplanSegOutcome = {
        status: 'rejected',
        reason: 'No page payload supplied to CV handler.',
      };
      await opts.onOutcome?.(outcome, job);
      return zeroProposalResult(outcome, job);
    }

    const page = input.page;
    const tStart = performance.now();

    // 1. Classify.
    const classification = await classifyPage(page, opts.runtime);
    if (
      classification.kind !== 'plan'
      || classification.confidence < PLAN_ROUTING_THRESHOLD
    ) {
      const outcome: FloorplanSegOutcome = {
        status: 'skipped',
        reason: `page classified ${classification.kind} @ ${classification.confidence.toFixed(2)}`,
        classification,
      };
      await opts.onOutcome?.(outcome, job);
      return zeroProposalResult(outcome, job);
    }

    // 2. Pre-call budget check (SPEC-45 §3 per-page ceiling).
    if (opts.costMeter) {
      const budget = await opts.costMeter.preCheckBudget(job.projectId, ceiling);
      if (!budget.ok) {
        const outcome: FloorplanSegOutcome = {
          status: 'rejected',
          reason: budget.reason ?? `per-page ceiling exceeded ($${ceiling.toFixed(3)})`,
        };
        await opts.onOutcome?.(outcome, job);
        return zeroProposalResult(outcome, job);
      }
    }

    // 3. Segmentation model.
    let segResult;
    try {
      segResult = await runSegmentationModel(page, opts.runtime);
    } catch (err) {
      const outcome: FloorplanSegOutcome = {
        status: 'rejected',
        reason: `segmentation failed: ${(err as Error).message}`,
      };
      await opts.onOutcome?.(outcome, job);
      return zeroProposalResult(outcome, job);
    }

    // 4. Upload mask to project-scoped storage.
    const url = await opts.storage.upload({
      projectId: job.projectId,
      key: maskKey(job.projectId, page.id),
      contentType: 'application/octet-stream',
      bytes: segResult.mask.data,
    });

    const durationMs = performance.now() - tStart;
    const costUsd = opts.runtime.mock ? mockCost : segResult.inferenceMs / 1000 * ceiling;

    // 5. Record cost (post-call).
    if (opts.costMeter) {
      await opts.costMeter.recordCall(
        FLOORPLAN_SEG_SURFACE,
        job.projectId,
        costUsd,
        durationMs,
        {
          actorKind: 'ai',
          plan: 'personal',
          pageId: page.id,
          pageNumber: page.pageNumber,
          maskUrl: url,
          wallCoverage: segResult.wallCoverage,
          runtimeKind: opts.runtime.kind,
          runtimeMock: opts.runtime.mock,
        },
      );
    }

    const outcome: FloorplanSegOutcome = {
      status: 'ok',
      maskUrl: url,
      classification,
      costUsd,
      durationMs,
      wallCoverage: segResult.wallCoverage,
    };
    await opts.onOutcome?.(outcome, job);

    // 6. Return a HandlerResult so the caller's onComplete sees a
    //    proposal carrying the mask URL — the next pipeline stage
    //    (vectorization at S55) consumes it. The proposal is a
    //    placeholder command name; S55 swaps in the real one.
    const result: HandlerResult = {
      proposedCommands: [
        {
          command: 'pdf-to-bim.floorplan-segmentation',
          payload: {
            projectId: job.projectId,
            pageId: page.id,
            maskUrl: url,
            classification,
            wallCoverage: segResult.wallCoverage,
          },
        },
      ],
      estimatedCostUsd: costUsd,
      preview: { kind: 'image', url },
    };
    return result;
  };
}

function zeroProposalResult(
  outcome: FloorplanSegOutcome,
  job: WorkflowJob,
): HandlerResult {
  return {
    proposedCommands: [],
    estimatedCostUsd: 0,
    preview: {
      kind: 'json',
      data: { workflow: job.kind, jobId: job.id, outcome },
    },
  };
}
