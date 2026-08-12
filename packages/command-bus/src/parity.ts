// normalizeForParity — the G-REASON-04 normalize rule (ADR-0324 §3).
//
// R1 of docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md. The parity
// GATE itself lands in R7; this helper is written now so the exclusion list
// is a reviewed, tested artefact BEFORE anything depends on it, and so the
// gate later imports the rule instead of re-deriving it.
//
// THE RULE (ADR-0324 §3, verbatim intent): `normalize(result.human) ===
// normalize(result.ai)` for identical command + payload. `normalize` excludes
// EXACTLY the actor / origin / timestamp / approval metadata — everything
// else (validation, refusal, plan, mutation patches, affected set, undo
// semantics) must be identical, because actor/channel may affect
// AUTHORIZATION POLICY but must not alter behavioural semantics.
//
// The exclusion list, mapped onto the concrete `EventRecord` fields:
//   ACTOR      → `audit.actorId`, `audit.clientId` (per-tab actor identity),
//                `context.actor`
//   ORIGIN     → `context.origin`
//   TIMESTAMP  → `audit.timestamp`, `patches[].capturedAt`, and `id` (a ULID
//                embeds its mint time, so two otherwise-identical executions
//                can never share one)
//   APPROVAL   → `context.approval`
//   …and `consequence.provenance` (the report's copy of actor/origin/
//   approval) plus `consequence.commandId` (a ULID reference). The report's
//   BEHAVIOURAL sections (plan, actual, predictedVsActual, validation) are
//   KEPT — a plan that differs between human and AI is precisely the parity
//   violation the gate exists to catch.
//
// KEPT deliberately: `audit.projectId` (which document was edited is
// behavioural — cross-project "parity" would be meaningless), `type`,
// `payload`, `affectedStores`, all patch content, and per-store grouping.

import type { EventRecord, PatchSnapshotEntry } from './types.js';
import type { ConsequenceReport } from './consequence.js';

/** `PatchSnapshotEntry` minus its capture timestamp. */
export type NormalizedPatchEntry = Omit<PatchSnapshotEntry, 'capturedAt'>;

/** `ConsequenceReport` minus provenance and the record-id reference. */
export type NormalizedConsequence = Omit<ConsequenceReport, 'provenance' | 'commandId'>;

/**
 * The behavioural residue of an {@link EventRecord} — what MUST be equal
 * across actors for the same command + payload (G-REASON-04).
 */
export interface NormalizedEventRecord<TPayload = unknown> {
  readonly type: string;
  readonly payload: TPayload;
  readonly projectId: string;
  readonly affectedStores: EventRecord<TPayload>['affectedStores'];
  readonly patches: readonly NormalizedPatchEntry[];
  readonly forward: EventRecord<TPayload>['forward'];
  readonly inverse: EventRecord<TPayload>['inverse'];
  /** Present only when the record carried a report; provenance stripped. */
  readonly consequence?: NormalizedConsequence;
}

/**
 * Project an {@link EventRecord} onto its behavioural residue, excluding
 * exactly actor / origin / timestamp / approval metadata (ADR-0324 §3).
 *
 * PURE — never mutates the input; returns a fresh plain object suitable for
 * deep/structural equality (`expect(a).toEqual(b)`, JSON comparison).
 * ADR-0324 §3's future G-REASON-04 gate asserts
 * `normalizeForParity(humanRecord)` deep-equals `normalizeForParity(aiRecord)`.
 */
export function normalizeForParity<TPayload>(
  record: EventRecord<TPayload>,
): NormalizedEventRecord<TPayload> {
  const normalized: NormalizedEventRecord<TPayload> = {
    type: record.type,
    payload: record.payload,
    projectId: record.audit.projectId,
    affectedStores: record.affectedStores,
    patches: record.patches.map(({ capturedAt: _capturedAt, ...rest }) => rest),
    forward: record.forward,
    inverse: record.inverse,
    // `context` (actor/origin/approval) is dropped entirely — it IS the
    // exclusion list. Conditionally spread so records that never carried a
    // report normalize to objects WITHOUT the key.
    ...(record.consequence !== undefined
      ? {
          consequence: (({ provenance: _p, commandId: _c, ...keep }) => keep)(
            record.consequence,
          ),
        }
      : {}),
  };
  return normalized;
}
