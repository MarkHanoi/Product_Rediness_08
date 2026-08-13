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
// ── R5 · METRICS ARE KEPT, NOT STRIPPED (decided 2026-08-12) ────────────────
// `ConsequencePlan.metrics` and `ConsequenceReport.metrics` (the typed
// `{ elementId, metric, before, after, unit }` transitions) fall under the KEEP
// rule, and this is stated explicitly because they are the newest fields and
// the easiest to mis-file as "display metadata".
//
// They are BEHAVIOURAL by the ADR-0324 §3 test: the same command + payload over
// the same state MUST produce the same metrics, because a metric is a pure
// function of the geometry the planner computed. If `wall.move 300 mm` predicts
// `room-kitchen area 12.4 → 10.8 m²` for a human and anything else for the AI,
// the two actors got different GEOMETRY — the most serious parity violation
// there is, and one no other field would reveal (the element SETS would be
// identical in that scenario; only the numbers would differ). Stripping them
// would blind G-REASON-04 to exactly the divergence it most needs to see.
//
// No code change was needed to KEEP them: the projection below strips
// `provenance` and `commandId` by name and passes everything else through, so
// metrics were already retained the moment they landed on the types. This
// comment pins the DECISION so a future "normalize away the display fields"
// edit has to argue with it rather than silently drop them.
//
// ── C78 §8 · UNDETERMINED REASONS AND SUB-REASONS ARE KEPT (decided 2026-08-12) ──
// The consolidated refusal vocabulary — `UndeterminedImpact.reason` (the
// eleven-member C78 §8.1 union), the typed `subReason` beside it (§8.3), and
// `PlanStaleRefusal.liveVerification` (§9.3's sentinel successor) — falls
// under the KEEP rule, and this is stated explicitly because refusals are the
// newest fields and the easiest to mis-file as "diagnostic metadata".
//
// They are BEHAVIOURAL by the ADR-0324 §3 test: the same command + payload
// over the same state MUST refuse for the same reason, because a refusal is a
// pure function of the state the planner read and the rule it applied. If the
// same wall.move yields `GEOMETRY_UNPREDICTABLE/COLLAPSED` for a human and
// `STALE_DERIVED_STATE` for the AI, the two actors got different PLANNERS —
// which is exactly the parity violation G-REASON-04 exists to catch, and one
// the element sets alone would not reveal (both plans would carry one
// undetermined item; only the reason would differ).
//
// No code change was needed to KEEP them: the projection below strips
// `provenance` and `commandId` by name and passes everything else through, so
// `plan.undetermined[].reason` / `.subReason` and every `*Undetermined` field
// were retained the moment they landed on the types. The pin-test lives in
// `__tests__/refusal-vocabulary.test.ts` (parity arm). This comment pins the
// DECISION so a future "normalize away the noise" edit has to argue with it.
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
  /**
   * C80 §1.4 — KEPT, not stripped, and the reason is the parity rule itself:
   * a refusal is BEHAVIOUR. If a human is refused `room.regenerate` and an AI
   * is not, that is the exact asymmetry G-REASON-04 exists to catch — the
   * §5.f header's "the AI gets a shortcut" defect wearing a refusal. It
   * carries no actor, origin, timestamp or approval, so nothing in the
   * ADR-0324 §3 exclusion list rides here.
   */
  readonly refusal?: EventRecord<TPayload>['refusal'];
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
    // C80 §1.4 — a refusal is behaviour, so it is KEPT verbatim (see the
    // field doc). Conditionally spread so records that never refused
    // normalize to objects WITHOUT the key, exactly as before.
    ...(record.refusal !== undefined ? { refusal: record.refusal } : {}),
  };
  return normalized;
}
