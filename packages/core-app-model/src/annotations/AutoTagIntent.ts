// §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — WHAT THIS VIEW WANTS TAGGED (P7 / C09).
//
// WHICH categories a view tags, and WHICH mark those tags display, are properties of
// the VIEW — not steps hardcoded inside a batch button. That is P7 ("visibility
// intent ≠ UI state") and C09 applied to documentation: a "GA Plan" template and a
// "Fire Strategy" plan want different tag sets, and the button must ask the view, not
// the user, which one it is looking at.
//
// The intent is NOT a new parallel store. It is read from the two places that already
// exist and are already carried by a VIEW TEMPLATE:
//
//   • `ViewDefinition.annotationOverrides` (AnnotationVisibilitySettings) — the
//     per-view annotation-CATEGORY switch. It already carries `roomTags`; L-265 adds
//     `doorTags` / `windowTags` / `wallTags` beside it. `ViewTemplate.annotationOverrides`
//     already exists, so a template carries the tag intent for free.
//   • `ViewDefinition.output.tagMarkSource` — whether the tags in this view carry the
//     TYPE mark (the founder's reference convention: "WallA", a door type number) or
//     the INSTANCE mark (WA-00-001). A representation property, so it lives in
//     `output` beside `scale` and `detailLevel`.
//
// Unset ⇒ the default for the view's PROJECTION (below), never a silent nothing.

import { withAutoTagSpan } from './tracing.js';
import type { TagCategory } from './TagReconciler.js';
import type { TagMarkSource } from './elementMarks.js';

/** The two projections the tag engine serves. Section is deliberately absent — see below. */
export type TagProjection = 'plan' | 'elevation';

/** The annotation-category switches this engine reads (subset of AnnotationVisibilitySettings). */
export interface TagCategorySwitches {
    readonly roomTags?: boolean;
    readonly doorTags?: boolean;
    readonly windowTags?: boolean;
    readonly wallTags?: boolean;
}

export interface AutoTagIntent {
    readonly categories: readonly TagCategory[];
    readonly markSource: TagMarkSource;
}

/**
 * The DEFAULT tag set per projection — the convention, applied when the view has
 * expressed no opinion.
 *
 * `room` is absent from BOTH defaults on purpose, and this is not an oversight:
 * room tags are already created (and refreshed, deduped, un-orphaned) by
 * `RoomTagAutoPopulator` on view activation. Having the button ALSO own them would
 * give one category two owners. Rooms remain a first-class CONSUMER of the same
 * reconciler — they are simply driven by view activation rather than by this button.
 * A view may still opt them in explicitly (`annotationOverrides.roomTags === true`),
 * and the reconciler's idempotency makes that safe.
 */
const DEFAULT_CATEGORIES: Readonly<Record<TagProjection, readonly TagCategory[]>> = Object.freeze({
    // A GA plan is schedulable when its openings and its wall types are named.
    plan: ['door', 'window', 'wall'],
    // An elevation names the openings on the façade and the façade's own wall type.
    elevation: ['door', 'window', 'wall'],
});

/**
 * §FIX-TAG-CONTENT-MARK-ONLY (L-291c) — A TAG DISPLAYS THE MARK. NOTHING ELSE.
 *
 * The default was 'type', so a window tag read "Timber Casement" while the wall tag read
 * "WA-00-005". That is why the circle dwarfed the diamond — and shrinking the bubble without
 * fixing the CONTENT would only have clipped the text.
 *
 * But the real argument is not cosmetic, it is what a tag IS:
 *   • the MARK is the JOIN to the schedule (C28 — the door/window schedule joins on
 *     `element.mark`; I proved that in L-265);
 *   • "Timber Casement, 1200×1200" is what the SCHEDULE SAYS when you look that mark up.
 *     Printing it in the bubble DUPLICATES THE SCHEDULE ONTO THE DRAWING — which is precisely
 *     what tags exist to avoid, and precisely how a drawing drifts from its model;
 *   • a tag carrying a TYPE NAME must be re-typeset every time the type is renamed. A tag
 *     carrying a MARK never is.
 *
 * The type name remains available THROUGH INTENT (`output.tagMarkSource = 'type'`, P7/C09) for
 * the view that genuinely wants it. It is simply not the default, and the default is what the
 * architect sees.
 */
export const DEFAULT_TAG_MARK_SOURCE: TagMarkSource = 'instance';

/**
 * Resolve the view's auto-tag intent.
 *
 * An explicit `false` switch REMOVES a defaulted category; an explicit `true` ADDS a
 * non-defaulted one (including `room`). Order follows `TAG_CATEGORIES` so the output
 * is deterministic regardless of key order in the stored settings.
 *
 * P8 — opens `pryzm.autotag.apply` (intent resolution is part of the executor boundary).
 */
export function resolveAutoTagIntent(
    projection: TagProjection,
    switches: TagCategorySwitches | undefined,
    markSource: TagMarkSource | undefined,
): AutoTagIntent {
    return withAutoTagSpan('apply', (span): AutoTagIntent => {
        const defaults = new Set(DEFAULT_CATEGORIES[projection]);
        const flag: Record<TagCategory, boolean | undefined> = {
            room:   switches?.roomTags,
            door:   switches?.doorTags,
            window: switches?.windowTags,
            wall:   switches?.wallTags,
        };
        const categories = (['room', 'door', 'window', 'wall'] as const).filter((c) =>
            flag[c] === undefined ? defaults.has(c) : flag[c] === true,
        );
        const resolved: AutoTagIntent = {
            categories,
            markSource: markSource ?? DEFAULT_TAG_MARK_SOURCE,
        };
        span.setAttribute('pryzm.autotag.projection', projection);
        span.setAttribute('pryzm.autotag.categories', categories.join(','));
        span.setAttribute('pryzm.autotag.mark_source', resolved.markSource);
        return resolved;
    });
}
