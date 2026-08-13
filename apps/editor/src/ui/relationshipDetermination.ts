// ─── relationshipDetermination — the ui-side generic sibling of core-app-model's
//     `determineBoundingWalls` (C75 §1.4 · C78 §1.4/§8.1 · C71 §4.4) ───────────
//
// THE DEFECT FAMILY THIS EXISTS TO END (GR-10, the `[]`-means-unknown ledger).
// Three different facts arrive at a reader wearing the same value:
//   1. the relationship genuinely has ZERO members (a real, determined answer);
//   2. the field is ABSENT because no producer ever wrote it;
//   3. the record/substrate is missing or unreadable.
// C71 §4.4: "`[]` may only ever mean zero results." C75 §1.4: "Failure and
// emptiness are never the same value." C78 §1.4: an absent field and a `?? []`
// are UNDETERMINED, never DETERMINED-unaffected.
//
// NO RIVAL VOCABULARY. Unlike `boundingWallDetermination.ts` (which restates the
// two literals because core-app-model does not hold a command-bus dependency),
// this module lives in `apps/editor` — which DOES declare `@pryzm/command-bus` —
// so the closed eleven-member C78 §8.1 union is IMPORTED, type-only, from its
// single authority (`packages/command-bus/src/consequence.ts`). A fork of the
// union is unrepresentable here by construction (C75 §2.8: unrepresentable
// beats checked).
//
// SHAPE PARITY. `RelationshipDetermination<string>` is structurally assignable
// to core-app-model's `BoundingWallDetermination` (same arm names, same field
// names, same meanings) — `RelationshipDetermination.test.ts` pins that
// assignability at compile time, so the two discriminators cannot drift into
// rival dialects.
//
// PURE: no store access, no I/O, no DOM, no throw. Type-only runtime footprint.

import type { UndeterminedReason } from '@pryzm/command-bus';

/**
 * The answer to a relationship question ("which X relate to this element?"),
 * with its determination status carried in the type rather than inferred from
 * a length. `[]` is representable ONLY through the `determined` arm, so
 * "I found nothing" and "I could not look" are unrepresentable as the same
 * value (ADR-0322 §5, C71 §4.4).
 */
export type RelationshipDetermination<T> =
    | {
          readonly kind: 'determined';
          /** MAY be empty — an empty DETERMINED set is a real answer: the
           *  relationship was examined and has zero members. */
          readonly elements: readonly T[];
      }
    | {
          readonly kind: 'undetermined';
          /** WHAT question went unanswered, for a card / log line to render. */
          readonly scope: string;
          /** WHY, in the closed C78 §8.1 vocabulary (imported, never restated). */
          readonly reason: UndeterminedReason;
          readonly detail?: string;
      };

/**
 * THE generic discriminator. Replaces `expr ?? []` at a relationship reader.
 *
 * - a **present array** → `determined`, whatever its length;
 * - **absent / null / not an array** → `undetermined`, defaulting to
 *   `RELATIONSHIP_NOT_RECORDED` (C78 §8.1: the relationship is known to exist
 *   as a concept but no producer wrote it). Pass `RELATIONSHIP_NOT_READABLE`
 *   when the SUBSTRATE (a store / index / method) failed to answer, as opposed
 *   to a field nobody wrote — the distinction is load-bearing (see the
 *   WorldModelAdapter strike note in the ledger).
 */
export function determineRelationshipArray<T>(
    raw: unknown,
    scope: string,
    opts?: { readonly reason?: UndeterminedReason; readonly detail?: string },
): RelationshipDetermination<T> {
    if (Array.isArray(raw)) {
        return { kind: 'determined', elements: raw as readonly T[] };
    }
    return {
        kind: 'undetermined',
        scope,
        reason: opts?.reason ?? 'RELATIONSHIP_NOT_RECORDED',
        detail:
            opts?.detail ??
            'the field naming this relationship is absent — no producer wrote it. ' +
                'Zero members was NOT determined (C75 §1.4 / C78 §1.4).',
    };
}

/**
 * The members, or `null` when they could not be determined.
 *
 * The migration affordance for readers whose whole use of the relationship is
 * to iterate it: `?? []` becomes this, and the `null` arm forces the caller to
 * write down what it does when the answer is unknown. It is NOT a shorthand
 * for `?? []` — returning `null` where the old code returned `[]` is exactly
 * the observable difference the GR-10 ledger exists to create.
 */
export function relationshipArrayOrUnknown<T>(raw: unknown): readonly T[] | null {
    return Array.isArray(raw) ? (raw as readonly T[]) : null;
}

/** The `undetermined` arm as a constructor, for failure paths that are not
 *  field reads (a caught throw → `PLANNER_THREW`; an unreadable substrate →
 *  `RELATIONSHIP_NOT_READABLE`). Never a silent empty collection. */
export function relationshipUndetermined(
    scope: string,
    reason: UndeterminedReason,
    detail?: string,
): Extract<RelationshipDetermination<never>, { kind: 'undetermined' }> {
    return detail !== undefined
        ? { kind: 'undetermined', scope, reason, detail }
        : { kind: 'undetermined', scope, reason };
}

/** Is this determination a known-unknown? Sugar for UI branches that must
 *  render a "cannot determine" state rather than an empty list (C78 §5 —
 *  discovery must be able to refuse). */
export function isRelationshipUndetermined<T>(
    d: RelationshipDetermination<T>,
): d is Extract<RelationshipDetermination<T>, { kind: 'undetermined' }> {
    return d.kind === 'undetermined';
}

/** One-line human-readable refusal for a log line / row / tooltip. */
export function relationshipUndeterminedLabel(
    d: Extract<RelationshipDetermination<unknown>, { kind: 'undetermined' }>,
): string {
    return `${d.scope}: undetermined (${d.reason})${d.detail ? ` — ${d.detail}` : ''}`;
}
