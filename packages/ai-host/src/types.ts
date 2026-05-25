// @pryzm/ai-host — public type surface (S47).
//
// Spec source:
//   • `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S47 lines
//     615-636 ("Implementation Detail — `AiApprovalQueueStore`").
//   • `[strategic ADR-014]` — AI host runs at architectural layer L7.5.
//
// These types are PURE — zero deps on @pryzm/command-bus, @pryzm/stores,
// THREE, DOM, or Node primitives.  That keeps the public surface
// importable from the editor's first-paint bundle without dragging the
// L4 / L5 / L7 layers in.  The L7.5 boundary is enforced at the
// AiHost.impl module which DOES import command-bus types and gets
// tree-shaken out of the cold-start chunk.
//
// The `AiPendingAction` shape is verbatim from spec lines 620-628.

/** AI workflows currently planned for Phase 3.  Frozen now so the
 *  approval queue store, the worker job contract, and the OTel span
 *  attributes all share a single string union. */
export type AiWorkflowKind =
  | 'floorplan'
  | 'generative'
  | 'rules'
  | 'cv'
  | 'voice';

/** Opaque command payload reference.  The real `CommandPayload` lives
 *  in `@pryzm/command-bus` and is structurally typed; the public ai-host
 *  surface keeps it `unknown[]` to avoid pulling the command-bus into
 *  the editor's cold-start chunk. */
export type CommandPayloadRef = Readonly<{
  /** Command name routed by `CommandBus.dispatch`. */
  command: string;
  /** Per-command payload. */
  payload: unknown;
}>;

// ── #51 Apartment Layout — option types re-exported on the LEAN surface ────────
// `workflows/apartmentLayout/types.ts` has ZERO imports (pure types), so this
// re-export keeps `@pryzm/ai-host/types` importable from L3 stores
// (LayoutOptionsStore) WITHOUT dragging the main barrel + core-app-model
// (window-at-load) into a Node store. Type-only edge — no runtime, no cycle.
export type {
  ScoredLayoutOption,
  LayoutOption,
  LayoutRoom,
  LayoutWall,
  LayoutDoor,
  LayoutScore,
  LayoutScoreBreakdown,
  RoomType,
  Vec2mm,
} from './workflows/apartmentLayout/types.js';

/** Preview attached to a pending action so the approval-queue UI can
 *  render before the user accepts.  `image` is for CV / generative
 *  workflows; `json` is for rules / floorplan / voice. */
export type AiPendingActionPreview =
  | Readonly<{ kind: 'image'; url: string }>
  | Readonly<{ kind: 'json'; data: unknown }>;

/** Status lifecycle for AI pending actions.  Transitions:
 *    pending → approved | rejected | expired
 *  Approved/rejected/expired are terminal. */
export type AiPendingActionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired';

/** Spec verbatim, lines 620-628 of S47 plan. */
export interface AiPendingAction {
  readonly id: string;
  /** The run identifier that produced this action.  Set by
   *  `AiPlane.submit()` so the approval-queue UI can group the
   *  single parent action with the per-item / per-option child
   *  actions that sub-workflows (Generate3Options, PlanCritique)
   *  enqueue directly — without parsing the `id` string. */
  readonly runId?: string;
  readonly workflow: AiWorkflowKind;
  readonly proposedCommands: ReadonlyArray<CommandPayloadRef>;
  readonly estimatedCostUsd: number;
  readonly preview?: AiPendingActionPreview;
  readonly createdAt: number;
  readonly status: AiPendingActionStatus;
  /** S54 D1 — when set, every pending action sharing the same
   *  `aiBatchId` is treated as a single undo entry by the command-bus
   *  history.  The plane sets this when callers route through
   *  `AiPlane.executeBatch()`; standalone `submit()` calls leave it
   *  undefined. */
  readonly aiBatchId?: string;
}

/** Bootstrap options for the AI host.  Defaults are deferred-friendly:
 *  every endpoint is a relative URL so tests can pass a stub
 *  `fetch` and production gets the live `/api/ai/*` routes already
 *  shipped in `server.js`. */
export interface AiHostOptions {
  /** Endpoint for the BullMQ-backed AI worker enqueue API.  Default:
   *  `'/api/ai-worker'` (per spec line 602). */
  readonly workerEndpoint?: string;
  /** Cloudflare Worker relay for Anthropic per SPEC-28 §4.  Default:
   *  `'/api/ai/anthropic'` (per spec line 605). */
  readonly anthropicRelay?: string;
  /** Approval queue store hook.  Optional in the L7.5 contract — the
   *  AI host can produce pending actions without a store wired (for
   *  unit tests).  In production the editor wires the singleton from
   *  `@pryzm/stores`. */
  readonly approvalQueue?: AiApprovalQueueLike;
  /** Optional fetch override for tests. */
  readonly fetch?: typeof fetch;
  /** ADR-050 — AI response cache.  When omitted, `AiHost.impl` wires
   *  in an `AiResponseCacheFetchAdapter` if `fetch` is available;
   *  otherwise caching is disabled.  Pass `null` to force-disable. */
  readonly responseCache?: AiResponseCacheLike | null;
}

/** Minimal contract the AI host needs from the approval queue store —
 *  `enqueue` is enough for S47.  Full hook surface lives in
 *  `packages/stores/AiApprovalQueueStore.ts`. */
export interface AiApprovalQueueLike {
  enqueue(action: AiPendingAction): void;
}

/** Public AI host instance (returned by `getAiHost()`). */
export interface AiHost {
  /** Submit a workflow request.  In S47 this short-circuits through
   *  the mock worker and produces an `AiPendingAction` enqueued onto
   *  the approval queue (if wired) — no actual LLM calls.  Full
   *  Anthropic relay invocation lands at S49. */
  submit(req: AiWorkflowRequest): Promise<AiPendingAction>;
  /** Last-written options snapshot, exposed for diagnostics. */
  readonly options: Required<Pick<AiHostOptions, 'workerEndpoint' | 'anthropicRelay'>>;
  /** First-class L7.5 plane the host owns (S49 promotion). The plane
   *  carries the AiBus, the workflow registry, the cost meter, and
   *  the approval-queue handle. Type is `unknown` here so the public
   *  type surface stays decoupled from `AiPlane`'s implementation
   *  imports (`@pryzm/ai-cost`, etc.). Callers cast to `AiPlane` from
   *  `@pryzm/ai-host/AiPlane` after the dynamic import resolves. */
  readonly plane?: unknown;
}

/** Request shape submitted to `AiHost.submit`. */
export interface AiWorkflowRequest {
  readonly workflow: AiWorkflowKind;
  readonly projectId: string;
  /** Free-form workflow input — each handler interprets its own. */
  readonly input?: unknown;
  /** Optional client-supplied id for idempotency.  If omitted the
   *  host generates one. */
  readonly clientRequestId?: string;
}

// ─── S49 — AiPlane / WorkflowRegistry types ───────────────────────────────

/** Stable workflow descriptor surfaced to:
 *   - the editor's command palette (L7),
 *   - the public AI API (S53),
 *   - third-party plugins (3B). */
export interface WorkflowDescriptor {
  /** Unique workflow id, e.g. 'ai.floorplan.draft'. */
  readonly id: string;
  /** Human-readable title for the command palette. */
  readonly title: string;
  /** Maps onto the AiWorkflowKind union for analytics tagging. */
  readonly kind: AiWorkflowKind;
  /** Estimated cost per call (USD). MUST be ≤ SPEC-28 §3 ceiling
   *  (0.18 USD); the registry rejects descriptors that exceed it. */
  readonly estimatedCostUsd: number;
  /** Optional descriptor surface name for cost telemetry tagging
   *  (e.g. 'ai.floorplan.draft'). Defaults to `ai.workflow.${kind}`. */
  readonly surface?: string;
  /** Free-form sentence the UI shows when the workflow is selected. */
  readonly description?: string;
}

/** Execution context handed to a workflow impl. The plane supplies
 *  the bus (so handlers can emit progress) + a clock + the actor +
 *  plan tier (for cost decisions). */
export interface WorkflowExecutionContext {
  readonly runId: string;
  readonly projectId: string;
  readonly actorId: string;
  readonly plan: 'free' | 'personal' | 'team';
  readonly input: unknown;
  /** The AI bus; handlers may emit `workflow.progress` for streaming
   *  workflows. The bus type is intentionally `unknown` here to keep
   *  the type surface decoupled from `AiBus`. */
  readonly bus: unknown;
  readonly now: () => number;
}

/** Output of a workflow impl. The plane wraps this in an
 *  `AiPendingAction` and enqueues it. */
export interface WorkflowRunResult {
  readonly proposedCommands: ReadonlyArray<CommandPayloadRef>;
  /** If known, the actual cost in USD (post-call). The plane records
   *  this against the cost meter; falls back to descriptor estimate. */
  readonly actualCostUsd?: number;
  readonly preview?: AiPendingActionPreview;
}

/** Workflow handler signature — pure I/O is delegated through `ctx`. */
export type WorkflowImpl = (ctx: WorkflowExecutionContext) => Promise<WorkflowRunResult>;

/** Registry entry — descriptor + impl. */
export interface WorkflowRegistryEntry {
  readonly descriptor: WorkflowDescriptor;
  readonly impl: WorkflowImpl;
}

/** Resolves the per-project monthly USD budget. The plane calls this
 *  inside the cost meter's preCheckBudget path. */
export type BudgetResolver = (projectId: string) => Promise<number> | number;

/** Optional callback when a project breaches its budget. Used to
 *  notify the workspace admin (per SPEC-28 §9). */
export type NotifyAdmin = (event: {
  readonly projectId: string;
  readonly reason: string;
  readonly costUsd: number;
}) => void | Promise<void>;

/** Sink that persists one row to the `ai_usage` table per SPEC-28
 *  §5.1. The plane invokes this from `CostMeter.recordCall` after
 *  every successful run. The actual SQL lives server-side; the sink
 *  is a callback so unit tests + bake-worker can supply an in-memory
 *  collector. */
export type AiUsageInsertSink = (row: {
  readonly id: string;
  readonly projectId: string;
  readonly actorId: string;
  readonly actorKind: 'user' | 'ai' | 'plugin';
  readonly workflow: string;
  readonly surface: string;
  readonly model: string;
  readonly plan: 'free' | 'personal' | 'team';
  readonly costUsd: number;
  readonly durationMs: number;
  readonly status: 'ok' | 'budget_stop' | 'cap' | 'error';
  readonly atMs: number;
}) => void | Promise<void>;

// ─── ADR-050 — AI Response Cache ──────────────────────────────────────────────

/** Composite cache key — uniquely identifies one cached workflow result. */
export interface AiCacheKey {
  /** Project/tenant scope — no cross-project sharing (ADR-050 §3). */
  readonly tenantId: string;
  /** SHA-256 hex of `JSON.stringify({ workflow, input })`. */
  readonly contentHash: string;
  /** Workflow descriptor id (e.g. `'plan-critique'`) — used as the
   *  model-version discriminant so a workflow change busts old entries. */
  readonly modelVersion: string;
}

/** Injectable cache contract.  Implementations may be:
 *  - `AiResponseCacheFetchAdapter` — browser-side fetch bridge to BFF
 *  - `PgAiResponseCache` — server-side PostgreSQL implementation
 *  - `MockAiResponseCache` — in-memory stub for unit tests
 *
 *  The cache is PURE at the type level — no DB or fetch imports here. */
export interface AiResponseCacheLike {
  /** Return a cached result or `null` on miss / expired. */
  get(key: AiCacheKey): Promise<WorkflowRunResult | null>;
  /** Store a result with a TTL.  Best-effort — callers `.catch()` failures. */
  set(key: AiCacheKey, value: WorkflowRunResult, ttlDays?: number): Promise<void>;
}

/** Dependencies the AiPlane needs to construct itself. The cost
 *  meter is supplied as `unknown` here to keep the @pryzm/ai-cost
 *  dep out of the public type barrel — concrete `CostMeter` typing
 *  lives in `AiPlane.ts`. */
export interface AiPlaneDeps {
  readonly approvalQueue: AiApprovalQueueLike;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly costMeter: any;
  readonly bus?: any;                  // eslint-disable-line @typescript-eslint/no-explicit-any
  readonly workflowRegistry?: any;     // eslint-disable-line @typescript-eslint/no-explicit-any
  readonly now?: () => number;
  /** ADR-050 — injectable AI response cache. When `undefined` the plane
   *  skips caching and every call goes to the Anthropic relay as before. */
  readonly responseCache?: AiResponseCacheLike;
}

/** Submit-time options handed to `AiPlane.submit`. */
export interface AiSubmitOptions {
  /** The workflow id (matches WorkflowDescriptor.id). */
  readonly workflow: string;
  readonly projectId: string;
  readonly actorId: string;
  readonly input?: unknown;
  /** Plan tier for the calling actor (default 'personal'). */
  readonly plan?: 'free' | 'personal' | 'team';
  /** Optional explicit estimate USD (overrides descriptor estimate). */
  readonly estimatedCostUsd?: number;
  /** Optional client-supplied run id (idempotency). */
  readonly runId?: string;
  /** S54 D1 — when set, the resulting `AiPendingAction` is tagged with
   *  the same `aiBatchId` so the editor's command-bus history can
   *  treat every pending action sharing this id as one undo entry.
   *  `AiPlane.executeBatch()` sets this automatically; callers using
   *  the bare `submit()` path can also opt in. */
  readonly aiBatchId?: string;
}
