// L2 contract types — frozen at S02 (ADR-002).
//
// Per `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md §S02-T1` (line 293) the
// canonical handler shape is:
//
//   interface CommandHandler<TCmd, TStores> {
//     canExecute(ctx: HandlerContext<TStores>, cmd: TCmd): ValidationResult;
//     execute(ctx: HandlerContext<TStores>, cmd: TCmd): Promise<HandlerResult>;
//     readonly affectedStores: readonly (keyof TStores)[];
//   }
//
// The `HandlerContext` is generic over the stores the handler declares so
// the bus can prove at compile time that every key in `affectedStores` is
// present in `ctx.stores` (R1A-16 mitigation, spec line 718).

import type { Patch as ImmerPatch } from 'immer';
import type { CommandExecutionContext, ConsequencePlan, ConsequenceReport } from './consequence.js';

/** Identifier of a logical store (`'wall'`, `'slab'`, …). */
export type StoreId = string;

/** Re-export Immer's Patch shape so consumers do not depend on `immer` directly. */
export type Patch = ImmerPatch;

/**
 * Audit metadata attached to every emitted event.  Travels with the patch
 * over the wire so the sync server can rebuild causal order (ADR-002 §4).
 */
export interface AuditMetadata {
  /** Stable user identifier (or `'system'` / `'ai-floorplan'` etc — ADR-002 §4). */
  readonly actorId: string;
  /** Project the event belongs to. */
  readonly projectId: string;
  /** Per-tab client identifier — distinguishes two tabs of the same user. */
  readonly clientId: string;
  /** ISO-8601 timestamp at the moment `executeCommand` started. */
  readonly timestamp: string;
}

/**
 * The caller-supplied subset of {@link AuditMetadata} accepted by the bus
 * constructor (and any boot wrapper that forwards directly to it).
 *
 * The `timestamp` field is INTENTIONALLY excluded — the bus stamps it
 * itself per command at `executeCommand` (`CommandBus.buildContext`),
 * so callers MUST NOT supply it (a single timestamp at boot would lie
 * about every subsequent command's start time, and per-command stamping
 * is the contract recorded in ADR-002 §4).
 */
export type AuditDefaults = Pick<
  AuditMetadata,
  'actorId' | 'projectId' | 'clientId'
>;

/**
 * Default store-map shape used when a handler does not declare a typed
 * `TStores` parameter.  Generic handlers narrow this via the `TStores`
 * type parameter on `CommandHandler<TCmd, TStores>`.
 */
export type AnyStores = Readonly<Record<StoreId, unknown>>;

/**
 * Context handed to every handler.  The handler is `await`ed under this
 * context — it MUST NOT outlive the surrounding `executeCommand`.
 *
 * The `stores` field is generic over `TStores`; the bus throws SYNCHRONOUSLY
 * (`CommandBusError`) if any key in `handler.affectedStores` is absent
 * from the materialised `stores` map (no `(window as any)` fallback —
 * ADR-002 line 38–47 outlaws the PRYZM-1 antipattern).
 */
export interface HandlerContext<TStores extends AnyStores = AnyStores> {
  readonly audit: AuditMetadata;
  readonly stores: TStores;
}

/**
 * Outcome of `canExecute`.  Either valid (the bus proceeds to `execute`)
 * or invalid with a human-readable reason that the bus surfaces as a
 * `CommandBusError` and DOES NOT push to the undo stack.
 */
export type ValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: string };

export interface HandlerResult {
  /** JSON-Patch-shaped forward mutations (Immer). */
  readonly forward: readonly Patch[];
  /** Inverse patches — applied for undo. */
  readonly inverse: readonly Patch[];
  /** Optional next-state snapshots, keyed by store id. */
  readonly nextStates?: Readonly<Record<StoreId, unknown>>;
  /**
   * ADR-0322 §9 (R1) — RESERVED, NEVER POPULATED YET. Once a handler's
   * operation has a `ConsequencePlanner` (R2+) and execution consumes the
   * plan (R4), the post-mutation report rides here. Optional by contract —
   * ~300 handlers are migrated incrementally, never broken simultaneously.
   * No bus code reads this field in R1.
   */
  readonly consequence?: ConsequenceReport;
}

/**
 * Every command handler is a class with this shape.  The
 * `affectedStores` field is REQUIRED — `pryzm/affected-stores-required`
 * (eslint-plugin-pryzm) hard-fails any class that omits it.
 *
 * Parameter order is `(ctx, cmd)` — context first per `§S02-T1`.
 */
export interface CommandHandler<TPayload, TStores extends AnyStores = AnyStores> {
  /**
   * Globally-unique CANONICAL command type, e.g. `'wall.create'`.
   *
   * House style is dot-separated kebab-case (`curtain-wall.batch.create`,
   * `detail-view.create`). `tools/ga-gate/check-command-naming.ts` enforces it
   * for new types against a frozen legacy baseline.
   */
  readonly type: string;
  /**
   * §FIX-COMMAND-NAMESPACE (L-796) — additional type strings that resolve to
   * THIS handler.
   *
   * A command type is a wire identifier: it appears in call sites, in the CRDT
   * payload, in the persisted `project_command_log`, and in replayed history.
   * Renaming one is therefore not a refactor, it is a protocol change, and a
   * flag-day rename would break every unmigrated caller AND every logged command
   * already on disk. Aliases make a rename incremental: register the canonical
   * name, alias the old one, migrate call sites at leisure, drop the alias when
   * the ratchet reaches zero.
   *
   * Mechanically this adds extra keys to the SAME registry pointing at the SAME
   * handler — there is no second dispatch path, no resolution order and no new
   * behaviour for handlers that do not declare aliases.
   *
   * ⚠ An alias is a DEPRECATION, not a synonym. Every alias needs a plan to
   * remove it, or the namespace simply grows two names for one thing forever —
   * which is the defect this field exists to retire.
   */
  readonly aliases?: readonly string[];
  /** The store ids this handler touches; the bus uses it to scope notifications. */
  readonly affectedStores: readonly (keyof TStores & string)[];
  /**
   * Pure pre-flight check.  Runs BEFORE `execute`.  Returning `{ valid:false }`
   * aborts the command — no patches are produced and nothing lands on the
   * undo stack.  Default implementations return `{ valid: true }`.
   */
  canExecute(ctx: HandlerContext<TStores>, cmd: TPayload): ValidationResult;
  /** Apply the command and return its forward + inverse patches. */
  execute(
    ctx: HandlerContext<TStores>,
    cmd: TPayload,
  ): Promise<HandlerResult> | HandlerResult;
}

/**
 * Recorded event — what the PatchEmitter encodes and the UndoStack pushes.
 *
 * Wire shape per spec line 296:
 *   `{ commandId: ULID, actorId, projectId, clientId, timestamp,
 *      patches: PatchSnapshotEntry[] }`
 *
 * The `patches` list is grouped per affected store so the L3 sync engine
 * can fan out per-store updates without re-walking the JSON-Patch path
 * arrays — this matches `src/commands/PatchSnapshot.ts:PatchSnapshotEntry`
 * (spec §1.2, "Copy verbatim into packages/command-bus/types.ts").
 */
export interface PatchSnapshotEntry {
  readonly storeKey: StoreId;
  readonly forwardPatches: readonly Patch[];
  readonly inversePatches: readonly Patch[];
  readonly capturedAt: string;
}

export interface EventRecord<TPayload = unknown> {
  /** ULID — sortable, monotonic-ish, 26 chars (per ADR-001). */
  readonly id: string;
  readonly type: string;
  readonly payload: TPayload;
  /**
   * ADR-0322 §9 — the LEGACY MINIMUM-DIRECT consequence surface: store KEYS
   * the handler declared it touches, not element ids, not indirect impact,
   * not topology/validation/regeneration consequences. Kept for undo routing
   * and sync fan-out; as the consequence contract lands per-operation
   * (R2–R5), `consequence` below becomes the authoritative answer to "what
   * did this command change?" and this field is only the routing minimum.
   */
  readonly affectedStores: readonly StoreId[];
  /** Per-store patch envelopes, ordered by `affectedStores`. */
  readonly patches: readonly PatchSnapshotEntry[];
  readonly audit: AuditMetadata;
  /**
   * Convenience flat views — concatenation of `patches[i].forwardPatches`
   * (resp. `inversePatches`) in declaration order.  Equal to the union
   * of the per-store envelopes; carried so existing tests / consumers
   * that don't care about per-store grouping stay simple.
   */
  readonly forward: readonly Patch[];
  readonly inverse: readonly Patch[];
  /**
   * ADR-0324 §1–2 (R1) — the OPTIONAL invocation envelope: WHO invoked
   * (`actor`), from WHERE (`origin`), under WHAT approval (`approval`).
   * Carried verbatim from `executeCommand(type, payload, { context })`;
   * ABSENT when the caller supplied none (the property is omitted, not set
   * to `undefined`, so wire encodings are byte-identical for legacy calls).
   * R1 STATUS: metadata only — nothing branches on it. G-REASON-04 parity
   * (`normalizeForParity`, ./parity.ts) strips it by construction.
   */
  readonly context?: CommandExecutionContext;
  /**
   * ADR-0322 §2 (R4) — the BOUND plan this execution consumed, carried
   * verbatim from `executeCommand(type, payload, { plan })` exactly as
   * `context` above is (conditional spread; ABSENT for every caller that
   * supplies none, so legacy records stay byte-identical). The bus itself
   * reads NOTHING from it — binding verification (planHash re-computation)
   * happens in the L7 executor BEFORE dispatch, so a plan that reaches this
   * field has already been verified against the live pre-state; a stale plan
   * is refused upstream (`PlanStaleRefusal`) and never rides here.
   * `normalizeForParity` strips it by construction (explicit projection) —
   * whether the plan should be KEPT for the parity comparison is R7's call.
   */
  readonly plan?: ConsequencePlan;
  /**
   * ADR-0322 §9 (R1) — RESERVED, NEVER POPULATED YET. The post-mutation
   * consequence report (plan + actual + predicted-vs-actual) arrives here
   * when R4/R5 land for an operation. Optional forever during migration.
   */
  readonly consequence?: ConsequenceReport;
}
