// §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — THE GENERIC TAG LIFECYCLE.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS (and why it is not a second tag engine)
// ─────────────────────────────────────────────────────────────────────────────
// PRYZM already auto-tags ROOMS in a plan view — idempotently, per view + per
// level, removing duplicates and orphans — inside `RoomTagAutoPopulator`
// (@pryzm/room-topology, DOC-2.5b). That lifecycle is CORRECT and battle-proven;
// what it is not is REUSABLE: the decision logic ("which rooms still need a tag,
// which tag has drifted, which tag now points at nothing") was interleaved with
// the room store, the command manager, and the room's own label rules.
//
// L-265 asked for doors/windows/walls in plan AND elevation. Writing a second
// populator per category would have been four more copies of the same four
// decisions. So the DECISION is extracted here — pure, category-parameterised —
// and `RoomTagAutoPopulator` becomes its FIRST consumer, with the auto-tag
// executor (`autoTagActiveView`) the second. One engine, N categories.
//
// PURE: no stores, no commands, no window, no THREE. It takes the tags that
// exist and the elements that are live, and returns the four sets. Every
// impure step (executing commands, minting ids, building AnnotationElements)
// belongs to the caller — which is what makes the lifecycle unit-testable and
// what stops the next category from forking it again.
//
// Contract map: C03 (an annotation is an ELEMENT), C16 (its creation is a
// COMMAND; one batch = ONE undo — enforced by the CALLER via commitAnnotationSet),
// C24.1 §1.2 (auto-documentation sets), C28 (the tag is the drawing's join to the
// schedule — see `elementMarks.ts` for why the MARK, not the id, is the join).

import { withAutoTagSpan } from './tracing.js';

// ─────────────────────────────────────────────────────────────────────────────
// Categories — the closed set of taggable element kinds
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The element categories the tag engine can tag. Closed on purpose: each entry
 * needs an annotation type, a target-id parameter key, and an anchor rule, and
 * every one of those is a deliberate documentation decision, not a free string.
 */
export type TagCategory = 'room' | 'door' | 'window' | 'wall';

export const TAG_CATEGORIES: readonly TagCategory[] = ['room', 'door', 'window', 'wall'];

/** The `AnnotationElement.type` each category is rendered as. */
export const TAG_ANNOTATION_TYPE: Readonly<Record<TagCategory, string>> = Object.freeze({
    room:   'room-tag',
    door:   'door-tag',
    window: 'window-tag',
    wall:   'wall-tag',
});

/**
 * The `parameters` keys that may carry the tagged element's id, in priority order.
 *
 * Two keys per opening category is not sloppiness — it is the REAL state of the
 * store. The manual `DoorTagPlanToolHandler` writes `parameters.elementId`; the
 * annotation parameters schema documents `targetElementId`. A reconciler that
 * only knew one of them would treat a hand-placed tag as missing and create a
 * DUPLICATE next to it. Reading both is what lets the auto-tagger ADOPT the
 * user's own tags instead of fighting them.
 */
const TAG_TARGET_KEYS: Readonly<Record<TagCategory, readonly string[]>> = Object.freeze({
    room:   ['roomId', 'elementId', 'targetElementId'],
    door:   ['elementId', 'targetElementId'],
    window: ['elementId', 'targetElementId'],
    wall:   ['elementId', 'targetElementId'],
});

/** The canonical `parameters` key this engine WRITES for a category. */
export function tagTargetKey(category: TagCategory): string {
    return TAG_TARGET_KEYS[category][0]!;
}

/** Read the tagged element's id out of an existing tag's parameters (any known key). */
export function readTagTargetId(
    category: TagCategory,
    parameters: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
    if (!parameters) return undefined;
    for (const key of TAG_TARGET_KEYS[category]) {
        const v = parameters[key];
        if (typeof v === 'string' && v.length > 0) return v;
    }
    return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inputs / outputs
// ─────────────────────────────────────────────────────────────────────────────

/** The minimum an existing tag must expose for the lifecycle to reason about it. */
export interface ExistingTagLike {
    readonly id: string;
    readonly type: string;
    readonly parameters?: Readonly<Record<string, unknown>>;
}

/** The minimum a live element must expose to be tagged. */
export interface TagTargetLike {
    /** The id of the ELEMENT being tagged (never the tag's own id). */
    readonly targetId: string;
}

// §FEAT-SET-OUT-LIVE-DIMENSIONS (L-286b) — no longer constrained to `TagTargetLike`. The
// reconciler is generic over IDENTITY now, and a dimension's identity is not "the element I
// name" (see reconcileAnnotationSet). The four decisions never depended on the constraint.
export interface TagReconciliation<T> {
    /** Live elements with no tag yet → CREATE one each. */
    readonly toCreate: readonly T[];
    /** Live elements whose kept tag has drifted → UPDATE it in place. */
    readonly toRefresh: readonly { readonly tagId: string; readonly target: T }[];
    /** Second-and-later tags on the same element → DELETE (idempotency). */
    readonly duplicateTagIds: readonly string[];
    /** Tags whose element no longer exists → DELETE (the element was deleted). */
    readonly orphanTagIds: readonly string[];
    /** Live elements considered (for reporting). */
    readonly liveCount: number;
    /** Live elements already carrying an up-to-date tag — the true no-op count. */
    readonly unchangedCount: number;
}

export interface ReconcileTagSetArgs<T extends TagTargetLike> {
    readonly category: TagCategory;
    /** Every annotation currently owned by the view (any type — we filter). */
    readonly existing: readonly ExistingTagLike[];
    /** Every live element of this category in the view's scope. */
    readonly live: readonly T[];
    /**
     * Drift test for a KEPT tag. Return true only when the tag's stored parameters
     * no longer match the live element. Default: never refresh (create-only).
     *
     * This is the guard that makes a second run a genuine NO-OP: no command, no
     * store event, and therefore no re-projection feedback loop (§A.21.D25 — the
     * same rule `roomTagNeedsRefresh` enforces for rooms).
     */
    readonly needsRefresh?: (
        parameters: Readonly<Record<string, unknown>> | undefined,
        target: T,
    ) => boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// The lifecycle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reconcile ONE category of tags in ONE view against the live model.
 *
 * The four decisions, unchanged from the room populator that proved them:
 *   1. an element with NO tag            → CREATE
 *   2. an element with a DRIFTED tag     → REFRESH (only when `needsRefresh` says so)
 *   3. an element with 2+ tags           → DELETE all but the first (idempotency)
 *   4. a tag whose element is gone       → DELETE (orphan)
 *
 * Deterministic: tags are grouped in the order given, and the FIRST tag for an
 * element is always the one kept, so running twice over a settled view yields
 * empty create/refresh/delete sets.
 *
 * P8 — opens `pryzm.autotag.reconcile`.
 */
export function reconcileTagSet<T extends TagTargetLike>(
    args: ReconcileTagSetArgs<T>,
): TagReconciliation<T> {
    const { category, existing, live, needsRefresh } = args;
    // §FEAT-SET-OUT-LIVE-DIMENSIONS (L-286b) — tags are the KEYED reconciler with a
    // particular key: "the element I name". Everything below is the generic engine.
    return reconcileAnnotationSet<T>({
        annotationType: TAG_ANNOTATION_TYPE[category],
        existing,
        live,
        keyOfExisting: (a) => readTagTargetId(category, a.parameters),
        keyOfLive: (t) => t.targetId,
        needsRefresh,
    });
}

/**
 * §FEAT-SET-OUT-LIVE-DIMENSIONS (L-286b) — THE FOUR DECISIONS, OVER ANY KEY.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A SECOND RECONCILER.
 *
 * `reconcileTagSet` made ONE assumption beyond the four decisions: that an annotation's
 * IDENTITY is "the element it names" — one tag per element. That is true of a tag and FALSE
 * of a dimension: a wall carries many dimensions, and a dimension is identified by the
 * (rule + reference-pair) it measures, not by a single element.
 *
 * So the four decisions were right and the KEY was wrong. The engine is generalised over the
 * key rather than copied: tags pass "the element id", dimensions pass "the rule + refs
 * signature", and BOTH get the same create / refresh / dedupe / un-orphan lifecycle, the same
 * idempotence, and the same proof. A second reconciler would have been a second set of four
 * decisions to keep in step — which is the disease this whole engine exists to cure.
 *
 * IDENTITY IS WHAT MAKES THE USER'S DRAG SURVIVE. An annotation whose key still matches is
 * REFRESHED IN PLACE — it keeps its id, and therefore its presentation (its dragged offset,
 * its moved label). It is never destroyed and reborn. Delete-and-recreate would pass every
 * other test on the list and fail the only one that matters to an architect.
 */
export function reconcileAnnotationSet<T>(args: {
    /** Only annotations of this type participate (others in the view are untouched). */
    readonly annotationType: string;
    readonly existing: readonly ExistingTagLike[];
    readonly live: readonly T[];
    /** The identity of an EXISTING annotation. `undefined` ⇒ not ours; never touched. */
    readonly keyOfExisting: (a: ExistingTagLike) => string | undefined;
    /** The identity of a LIVE candidate. */
    readonly keyOfLive: (t: T) => string;
    readonly needsRefresh?: (
        parameters: Readonly<Record<string, unknown>> | undefined,
        target: T,
    ) => boolean;
}): TagReconciliation<T> {
    const { annotationType, existing, live, keyOfExisting, keyOfLive, needsRefresh } = args;

    return withAutoTagSpan('reconcile', (span): TagReconciliation<T> => {
        const liveById = new Map<string, T>();
        for (const el of live) liveById.set(keyOfLive(el), el);

        // Group this type's existing annotations by IDENTITY.
        const tagsByTarget = new Map<string, ExistingTagLike[]>();
        for (const tag of existing) {
            if (tag.type !== annotationType) continue;
            const targetId = keyOfExisting(tag);
            if (!targetId) continue;   // not ours (hand-authored / untargeted) — never touched
            const bucket = tagsByTarget.get(targetId);
            if (bucket) bucket.push(tag);
            else tagsByTarget.set(targetId, [tag]);
        }

        const duplicateTagIds: string[] = [];
        const orphanTagIds: string[] = [];
        const toRefresh: { tagId: string; target: T }[] = [];
        const tagged = new Set<string>();
        let unchangedCount = 0;

        for (const [targetId, tags] of tagsByTarget) {
            const target = liveById.get(targetId);
            if (!target) {
                // 4. the thing it measured/named is gone → every annotation on it is an orphan.
                for (const t of tags) orphanTagIds.push(t.id);
                continue;
            }
            tagged.add(targetId);
            // 3. keep the first, delete the rest.
            for (let i = 1; i < tags.length; i++) duplicateTagIds.push(tags[i]!.id);
            // 2. refresh the kept one IN PLACE only when it has actually drifted — it keeps its
            //    id, and with it the user's presentation.
            const kept = tags[0]!;
            if (needsRefresh?.(kept.parameters, target)) toRefresh.push({ tagId: kept.id, target });
            else unchangedCount++;
        }

        // 1. every live element with no annotation of this type.
        const toCreate = live.filter((el) => !tagged.has(keyOfLive(el)));

        span.setAttribute('pryzm.autotag.annotation_type', annotationType);
        span.setAttribute('pryzm.autotag.live_count', live.length);
        span.setAttribute('pryzm.autotag.create_count', toCreate.length);
        span.setAttribute('pryzm.autotag.refresh_count', toRefresh.length);
        span.setAttribute('pryzm.autotag.duplicate_count', duplicateTagIds.length);
        span.setAttribute('pryzm.autotag.orphan_count', orphanTagIds.length);

        return {
            toCreate,
            toRefresh,
            duplicateTagIds,
            orphanTagIds,
            liveCount: live.length,
            unchangedCount,
        };
    });
}
