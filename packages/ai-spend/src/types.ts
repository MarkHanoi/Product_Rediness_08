/**
 * @pryzm/ai-spend — types & schemas (S65 work-item 7).
 *
 * Source authority:
 *   - SPEC-28 §9 (Workspace Admin AI Spend view)
 *   - phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md §S65 work-item 7
 *   - ADR-0043 §A (S65 closure)
 *
 * The Workspace Admin AI Spend view is the operator-facing dashboard for
 * AI cost transparency.  This package is the BACKEND of that view: a pure
 * append-only ledger of `AiSpendEntry` records + aggregations that group
 * the ledger along the five operator-relevant axes:
 *
 *   1. workspace          — top-level org spend roll-up
 *   2. project             — per-project breakdown (most operators care)
 *   3. actor (user|plugin) — who is spending the money
 *   4. surface             — where the spend originates (`editor`, `cli`, `api`)
 *   5. day                 — calendar-day time series
 *
 * PURE: no transport, no provider SDKs, no DB.  The api-gateway imports
 * this package and serves aggregated views over `GET /v1/admin/ai-spend`.
 *
 * Why a separate package and not folded into `@pryzm/ai-cost`:
 * `ai-cost` is the per-call BUDGET enforcer (pre-call ceiling check +
 * OTel telemetry sink).  `ai-spend` is the per-period AGGREGATOR that
 * answers "how much did workspace X spend last week".  The two
 * lifecycles are different — budgets are hot-path and runtime-critical,
 * spend aggregation is admin-cold-path and offline-friendly.
 */

import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────
//  Surface enum — mirrors @pryzm/ai-cost AISurface but kept separate to
//  avoid a hard dep on the budget package from the spend package.
// ──────────────────────────────────────────────────────────────────────

/** Where the AI call originated.  Mirrors `AISurface` from `@pryzm/ai-cost`. */
export const AI_SURFACES = ['editor', 'cli', 'api', 'plugin', 'bake-worker'] as const;
export type AiSurface = (typeof AI_SURFACES)[number];

/** Actor kind — human user or plugin. */
export const ACTOR_KINDS = ['user', 'plugin', 'system'] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

// ──────────────────────────────────────────────────────────────────────
//  Schemas — zod is the source of truth; types are inferred from it.
// ──────────────────────────────────────────────────────────────────────

/** A single AI spend ledger entry — one record per AI call. */
export const AiSpendEntrySchema = z.object({
  /** Stable id; ULIDs from `ulid` are recommended (lexicographically sortable). */
  id: z.string().min(1),
  /** Workspace id (org-level container). */
  workspaceId: z.string().min(1),
  /** Project id (within the workspace). */
  projectId: z.string().min(1),
  /** Actor id — user id, plugin id, or `system`. */
  actorId: z.string().min(1),
  /** Actor kind — for grouping users vs plugins separately. */
  actorKind: z.enum(ACTOR_KINDS),
  /** Surface that originated the call. */
  surface: z.enum(AI_SURFACES),
  /** Workflow descriptor id (e.g. `plan.critique`). */
  workflowId: z.string().min(1),
  /** Model class string (`anthropic.claude-sonnet-4`, etc). */
  model: z.string().min(1),
  /** ms since epoch — `Date.now()` from the call site. */
  ts: z.number().int().nonnegative(),
  /** Cost in USD; non-negative; finite. */
  costUsd: z.number().nonnegative().finite(),
  /** Optional run id for cross-correlation with AiBus traces. */
  runId: z.string().min(1).optional(),
});
export type AiSpendEntry = z.infer<typeof AiSpendEntrySchema>;

// ──────────────────────────────────────────────────────────────────────
//  Aggregation result types — what the api-gateway serves on the wire.
// ──────────────────────────────────────────────────────────────────────

export interface AiSpendAggregateRow<K = string> {
  readonly key: K;
  readonly count: number;
  readonly totalCostUsd: number;
  /** ms since epoch — earliest entry in the group. */
  readonly firstSeenTs: number;
  /** ms since epoch — latest entry in the group. */
  readonly lastSeenTs: number;
}

export interface AiSpendQueryRange {
  /** Inclusive lower bound (ms epoch).  Omit for unbounded. */
  readonly fromTs?: number;
  /** Exclusive upper bound (ms epoch).  Omit for unbounded. */
  readonly toTs?: number;
  /** Workspace filter — usually required for tenant isolation. */
  readonly workspaceId?: string;
  /** Project filter — narrow to a single project. */
  readonly projectId?: string;
}

export interface AiSpendTotals {
  readonly count: number;
  readonly totalCostUsd: number;
  readonly distinctProjects: number;
  readonly distinctActors: number;
}
