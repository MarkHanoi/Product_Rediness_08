// @pryzm/ai-host — AiPlane (S49 D1, D2, D3).
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md` §S49
//     lines 102-135 ("Implementation Detail — L7.5 Promotion").
//   • SPEC-07 §3 + [strategic ADR-014] — first-class L7.5 plane with
//     its own bus, its own observability prefix, its own descriptor
//     schema for plugin discovery.
//   • ADR-050 · C09 §2.3 — AI response cache (Task 4.5).
//
// The AiPlane is the FIRST-CLASS L7.5 architectural unit. The lazy
// `getAiHost()` from S47 still returns an `AiHost`, but the host now
// owns an `AiPlane` instance — `host.plane`. Workflows submitted via
// `host.submit()` flow through the plane's pipeline:
//
//   submit() →
//     0. (ADR-050) compute content hash; check AiResponseCache
//        → on HIT: return cached action; skip steps 1-4 (no quota charged)
//     1. validate workflow registered + descriptor
//     2. preCheckBudget (CostMeter, $0.18 ceiling)
//     3. AiBus.emit('workflow.start')
//     4. workflow.impl(ctx) → proposed commands + actuals
//     5. CostMeter.recordCall(actual)
//     6. (ADR-050) store result in AiResponseCache (best-effort)
//     7. AiBus.emit('workflow.propose') with the AiPendingAction
//     8. enqueue on the approval queue
//     9. (later) human approve → AiBus.emit('workflow.commit') → command bus
//
// Only step 9's commit hits the command bus; steps 3-8 stay on the
// AiBus per SPEC-07 §3 ("AI workflows do not pollute the command bus's
// event log with intermediate proposals").

import type {
  AiApprovalQueueLike,
  AiPendingAction,
  AiPlaneDeps,
  AiSubmitOptions,
  WorkflowExecutionContext,
  WorkflowRunResult,
} from './types.js';
import type { CostMeter, BudgetCheck } from '@pryzm/ai-cost';
import { AiBus } from './AiBus.js';
import { WorkflowRegistry } from './WorkflowRegistry.js';
import { withWorkflowSpan } from './tracing.js';
import { hashWorkflowRequest } from './AiResponseCache.js';

/** First-class L7.5 architectural plane. Composed of:
 *  - `bus`              — independent message bus (otelPrefix `pryzm.ai`)
 *  - `approvalQueue`    — pending action store (L7.5 → L7 surface)
 *  - `costMeter`        — SPEC-28 budget enforcement + telemetry
 *  - `workflowRegistry` — descriptor registry for plugin discovery
 *  - `responseCache`    — ADR-050 content-addressed result cache (optional)
 *
 *  PURE in the sense that all I/O is delegated to the deps; the plane
 *  itself is bake-worker safe.
 *
 *  Sequence counters (`_runSeq`, `_batchSeq`) are instance-level so
 *  multiple `AiPlane` instances (e.g. in parallel test suites) never
 *  share a counter and produce identical IDs. */
export class AiPlane {
  readonly bus: AiBus;
  readonly approvalQueue: AiApprovalQueueLike;
  readonly costMeter: CostMeter;
  readonly workflowRegistry: WorkflowRegistry;
  private readonly deps: AiPlaneDeps;
  private _runSeq = 0;
  private _batchSeq = 0;

  constructor(deps: AiPlaneDeps) {
    this.deps = deps;
    this.bus = deps.bus ?? new AiBus({ otelPrefix: 'pryzm.ai' });
    this.approvalQueue = deps.approvalQueue;
    this.costMeter = deps.costMeter;
    this.workflowRegistry = deps.workflowRegistry ?? new WorkflowRegistry();
  }

  /** Register a workflow with the plane. Convenience pass-through to
   *  the workflow registry; matches the spec API on §S49 line 129. */
  registerWorkflow(
    descriptor: Parameters<WorkflowRegistry['register']>[0],
    impl: Parameters<WorkflowRegistry['register']>[1],
  ): void {
    this.workflowRegistry.register(descriptor, impl);
  }

  /** Submit a workflow run. Returns the resulting AiPendingAction
   *  (which may have `status: 'rejected'` if the budget gate denied
   *  the call pre-flight).
   *
   *  ADR-050 cache path (inserted BEFORE step 1 — budget check):
   *  1. Compute SHA-256 of `{workflow, input}` → contentHash.
   *  2. Check `deps.responseCache` for a matching entry.
   *  3. Cache HIT → emit `workflow.cacheHit`, build synthetic pending
   *     action, enqueue, return.  No budget check; no impl call;
   *     no `CostMeter.recordCall`; no `ai_usage` row (C09 §2.3).
   *  4. Cache MISS → run normal pipeline; store result after success.
   *
   *  The entire budget→impl→record→enqueue pipeline runs inside a
   *  `withWorkflowSpan` span so every `AiBus.emit()` call during the
   *  pipeline annotates the SAME span via `addEvent` (correct OTel
   *  semantics — bus events are sub-ms and belong as span events, not
   *  zero-duration child spans). */
  async submit(opts: AiSubmitOptions): Promise<AiPendingAction> {
    const entry = this.workflowRegistry.get(opts.workflow);
    if (!entry) {
      throw new Error(`[ai-host/AiPlane] workflow '${opts.workflow}' is not registered.`);
    }

    return withWorkflowSpan(entry.descriptor.kind, async () => {
      const runId = opts.runId ?? this.nextRunId();
      const projectId = opts.projectId;
      const actorId = opts.actorId;
      const plan = opts.plan ?? 'personal';

      // 0. ADR-050 — Cache check (BEFORE budget check so cache hits are
      //    never charged against quota per C09 §2.3).
      let cacheHash: string | null = null;
      if (this.deps.responseCache) {
        try {
          cacheHash = await hashWorkflowRequest(opts.workflow, opts.input);
          const cacheKey = {
            tenantId: projectId,
            contentHash: cacheHash,
            modelVersion: entry.descriptor.id,
          };
          const cached = await this.deps.responseCache.get(cacheKey);

          if (cached !== null) {
            // Cache hit — return immediately without touching budget / impl.
            this.bus.emit({
              kind: 'workflow.cacheHit',
              workflow: opts.workflow,
              projectId,
              runId,
              payload: { contentHash: cacheHash, modelVersion: entry.descriptor.id },
            });
            const cachedAction: AiPendingAction = {
              id: `${runId}-pending`,
              runId,
              workflow: entry.descriptor.kind,
              proposedCommands: cached.proposedCommands,
              estimatedCostUsd: 0,
              ...(cached.preview ? { preview: cached.preview } : {}),
              createdAt: this.now(),
              status: 'pending',
              ...(opts.aiBatchId ? { aiBatchId: opts.aiBatchId } : {}),
            };
            this.approvalQueue.enqueue(cachedAction);
            return cachedAction;
          }
        } catch (cacheErr) {
          // Cache lookup failure is non-fatal — fall through to normal path.
          if (typeof console !== 'undefined') {
            console.warn('[ai-host/AiPlane] cache lookup failed (non-fatal):', cacheErr);
          }
          cacheHash = null;
        }
      }

      // 1. Pre-call budget check (SPEC-28 §6).
      const estimated = opts.estimatedCostUsd ?? entry.descriptor.estimatedCostUsd;
      const budget = await this.costMeter.preCheckBudget(projectId, estimated);
      if (!budget.ok) {
        this.bus.emit({
          kind: 'workflow.reject',
          workflow: opts.workflow,
          projectId,
          runId,
          payload: { reason: budget.reason ?? 'budget exceeded', estimatedCostUsd: estimated },
        });
        const rejected: AiPendingAction = {
          id: `rej-${runId}`,
          runId,
          workflow: entry.descriptor.kind,
          proposedCommands: [],
          estimatedCostUsd: estimated,
          createdAt: this.now(),
          status: 'rejected',
        };
        this.approvalQueue.enqueue(rejected);
        return rejected;
      }

      // 2. workflow.start.
      this.bus.emit({
        kind: 'workflow.start',
        workflow: opts.workflow,
        projectId,
        runId,
        payload: { input: opts.input ?? null, plan, actorId },
      });

      const ctx: WorkflowExecutionContext = {
        runId,
        projectId,
        actorId,
        plan,
        input: opts.input ?? null,
        bus: this.bus,
        now: () => this.now(),
      };

      // 3. Run the workflow impl. Catch + emit error so the bus stays
      //    a faithful audit log even on failure.
      let result: WorkflowRunResult;
      const t0 = this.now();
      try {
        result = await entry.impl(ctx);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.bus.emit({
          kind: 'workflow.error',
          workflow: opts.workflow,
          projectId,
          runId,
          // S54 D1 — when the run is part of a batch, propagate the
          // `aiBatchId` so subscribers can correlate the failure with
          // the rest of the batch.
          payload: { error: message, ...(opts.aiBatchId ? { aiBatchId: opts.aiBatchId } : {}) },
        });
        throw err;
      }
      const latencyMs = this.now() - t0;

      // 4. Record cost (post-call actual). Best-effort — record errors
      //    must not nuke the workflow output.
      try {
        await this.costMeter.recordCall(
          opts.workflow,
          projectId,
          result.actualCostUsd ?? estimated,
          latencyMs,
          {
            actorId,
            plan,
            surface: entry.descriptor.surface ?? `ai.workflow.${entry.descriptor.kind}`,
          },
        );
      } catch (err) {
        // Cost record failure is loud in logs but never blocks the
        // approval queue handoff (per SPEC-28 §10 anti-pattern: "no
        // spend without a row in ai_usage" applies to the GATEWAY, not
        // the plane).
        if (typeof console !== 'undefined') {
          console.warn('[ai-host/AiPlane] CostMeter.recordCall failed (non-fatal):', err);
        }
      }

      // 5. ADR-050 — Store result in cache (after successful impl + recordCall,
      //    before enqueue).  Best-effort: failure must not block the approval
      //    queue handoff.  Only store on a fresh hash (hash is null when the
      //    cache lookup itself failed earlier).
      if (cacheHash && this.deps.responseCache) {
        this.deps.responseCache
          .set(
            { tenantId: projectId, contentHash: cacheHash, modelVersion: entry.descriptor.id },
            result,
            7,
          )
          .catch((storeErr: unknown) => {
            if (typeof console !== 'undefined') {
              console.warn('[ai-host/AiPlane] cache store failed (non-fatal):', storeErr);
            }
          });
      }

      // 6. Synthesise the AiPendingAction.
      const action: AiPendingAction = {
        id: `${runId}-pending`,
        runId,
        workflow: entry.descriptor.kind,
        proposedCommands: result.proposedCommands,
        estimatedCostUsd: result.actualCostUsd ?? estimated,
        ...(result.preview ? { preview: result.preview } : {}),
        createdAt: this.now(),
        status: 'pending',
        ...(opts.aiBatchId ? { aiBatchId: opts.aiBatchId } : {}),
      };

      // 7. workflow.propose + enqueue.
      this.bus.emit({
        kind: 'workflow.propose',
        workflow: opts.workflow,
        projectId,
        runId,
        payload: { actionId: action.id, latencyMs, costUsd: action.estimatedCostUsd },
      });
      this.approvalQueue.enqueue(action);

      return action;
    }) as Promise<AiPendingAction>;
  }

  /** Helper for the host integration — exposes the bus for `getAiHost()`
   *  callers wiring approval-queue committers. */
  emitCommit(workflow: string, projectId: string, runId: string, payload: unknown): void {
    this.bus.emit({ kind: 'workflow.commit', workflow, projectId, runId, payload });
  }

  /** S54 D1 — submit multiple workflow runs as one undo batch.
   *
   *  Every resulting `AiPendingAction` carries the same `aiBatchId`
   *  so the editor's command-bus history can collapse them into a
   *  single undo entry on commit.  Runs execute serially to preserve
   *  cost-meter ordering + bus event order; if one run throws, prior
   *  pending actions are still returned (partial-success — the caller
   *  decides whether to commit or discard them).
   *
   *  The plane emits `workflow.batchStart` before the first submit
   *  and `workflow.batchEnd` after the last (with a `succeeded` /
   *  `failed` count summary).  Both events carry `aiBatchId` in their
   *  payload so subscribers can correlate per-workflow events that
   *  share the id.
   *
   *  Spec source: `docs/00_NEW_ARCHITECTURE/10-MASTER-IMPLEMENTATION-PLAN-36M.md`
   *  §6.1 row S54 — "All AI mutations are command batches; appear as
   *  one undo entry; audit trail complete". */
  async executeBatch(
    batch: ReadonlyArray<AiSubmitOptions>,
    opts: { readonly aiBatchId?: string; readonly projectId?: string } = {},
  ): Promise<ReadonlyArray<AiPendingAction>> {
    if (batch.length === 0) return [];
    const aiBatchId = opts.aiBatchId ?? this.nextBatchId();
    // Use the first run's projectId as the batch's "owning" project
    // for the bus envelope (every run carries its own projectId in
    // the per-run events).
    const batchProjectId = opts.projectId ?? batch[0]!.projectId;
    const batchRunId = `batch-${aiBatchId}`;

    this.bus.emit({
      kind: 'workflow.batchStart',
      workflow: 'ai.batch',
      projectId: batchProjectId,
      runId: batchRunId,
      payload: { aiBatchId, runCount: batch.length },
    });

    const out: AiPendingAction[] = [];
    let succeeded = 0;
    let failed = 0;
    for (const submitOpts of batch) {
      try {
        const action = await this.submit({ ...submitOpts, aiBatchId });
        out.push(action);
        succeeded += 1;
      } catch (err: unknown) {
        // submit() already emitted a `workflow.error` event tagged
        // with `aiBatchId` on this code path; we deliberately do NOT
        // re-emit here.  We swallow the throw so the caller still
        // receives the prior pending actions and can decide whether
        // to commit or roll back the batch (partial-success contract,
        // per the S54 D1 spec note "appear as one undo entry").
        const msg = err instanceof Error ? err.message : String(err);
        if (typeof console !== 'undefined') {
          console.warn(
            `[ai-host/AiPlane] executeBatch: submit('${submitOpts.workflow}') threw (partial-batch failure):`,
            msg,
          );
        }
        failed += 1;
      }
    }

    this.bus.emit({
      kind: 'workflow.batchEnd',
      workflow: 'ai.batch',
      projectId: batchProjectId,
      runId: batchRunId,
      payload: { aiBatchId, succeeded, failed, runCount: batch.length },
    });

    return out;
  }

  private now(): number { return this.deps.now ? this.deps.now() : Date.now(); }

  private nextRunId(): string {
    return `run-${Date.now().toString(36)}-${(++this._runSeq).toString(36)}`;
  }

  private nextBatchId(): string {
    return `batch-${Date.now().toString(36)}-${(++this._batchSeq).toString(36)}`;
  }
}

// Re-export the dep types so callers can `import type { ... } from '@pryzm/ai-host/AiPlane'`.
export type { BudgetCheck };
