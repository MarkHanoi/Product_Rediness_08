// §FEAT-SET-OUT-LIVE-DIMENSIONS (L-286b) — WHAT MAKES A DIMENSION *THE SAME* DIMENSION.
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS FILE IS THE WHOLE DESIGN
// ─────────────────────────────────────────────────────────────────────────────
// The coordinator's call, which I agree with and could not improve on:
//
//     THE USER'S DRAG ALWAYS SURVIVES. ONLY THE REFERENCE RE-DERIVES.
//
// A live drawing that wipes an architect's deliberate placement every time a door is added is
// not "live documentation" — it is a machine fighting the architect. And the ONLY way to keep
// a drag is to keep the ANNOTATION: its `offset` and `screenOverride` live on the record, so
// an annotation that is destroyed and reborn with a new id has, by construction, lost them.
//
// Therefore a regeneration MUST be a RECONCILE, not a delete-and-recreate — and a reconcile
// needs an IDENTITY. That is this file:
//
//     a dimension IS the (rule + the references it measures).
//
// Not its id (minted fresh every plan), not its position (that is the user's), not its value
// (that is the model's). Two dimensions measuring the same references under the same rule ARE
// the same dimension, however the model moved in between — so the old one is REFRESHED IN
// PLACE and keeps everything the user did to it.
//
// NOTE WHY THIS IS NOT MERELY A CACHE KEY: it is the reason `delete-and-recreate` passes every
// other test on the list (the set is correct after a crop change! the chain partitions!) and
// still fails the only one an architect will notice.
//
// PURE. No stores, no DOM.

import type { AnnotationElement, StableReference } from '@pryzm/plugin-annotations';

/** The parameter the producers stamp, and the reconciler keys on. */
export const AUTO_KEY_PARAM = 'autoKey';

/** Auto-generated dimension modes — the annotations Set Out owns and may re-derive. */
export const AUTO_DIM_MODES: ReadonlySet<string> = new Set(['set-out', 'elevation']);

/**
 * One reference → a stable, order-independent token.
 *
 * An ELEMENT reference (L-287) is stable across regenerations because it names the model:
 * `wall:wall_7:end`. A POINT reference is NOT — `makePointRef` mints a fresh UUID every time —
 * so a point-anchored dimension has no identity to preserve, and we say so rather than
 * pretending: it falls back to its geometric station, which is stable while the geometry is.
 */
function refToken(ref: StableReference): string {
    if (ref.elementType === 'point') {
        const p = ref.cachedPosition;
        // Quantised to a millimetre: the same station across a regeneration is the same token,
        // and a moved station is honestly a different one.
        return p
            ? `pt:${Math.round(p.x * 1000)}:${Math.round(p.y * 1000)}:${Math.round(p.z * 1000)}`
            : 'pt:?';
    }
    return `${ref.elementType}:${ref.elementId}:${ref.subElement}:${ref.index ?? ''}`;
}

/**
 * The IDENTITY of an auto-generated dimension: the rule it applies + the references it
 * measures, order-independent.
 *
 * Order-independent because a chain planned left-to-right and one planned right-to-left
 * measure the same thing; a key that flipped with the traversal order would delete and
 * recreate the entire drawing on a whim, taking every drag with it.
 */
export function dimensionIdentity(
    references: readonly StableReference[],
    rule?: string,
): string {
    const refs = references.map(refToken).sort().join('|');
    return `${rule ?? 'dim'}#${refs}`;
}

/** The identity of an EXISTING annotation — read from the key its producer stamped. */
export function readDimensionIdentity(ann: AnnotationElement): string | undefined {
    const p = ann.parameters ?? {};
    const key = p[AUTO_KEY_PARAM];
    if (typeof key === 'string' && key.length > 0) return key;
    // A dimension from BEFORE this ticket carries no key. Recompute it from the record rather
    // than treating it as foreign: an unkeyed dim that still measures live references is the
    // SAME dimension, and orphaning it would be the delete-and-recreate we are here to avoid.
    if (!isAutoDimension(ann)) return undefined;
    return dimensionIdentity(ann.references ?? [], p.rule as string | undefined);
}

/** Is this annotation one that Set Out owns (auto-generated), rather than the user's own? */
export function isAutoDimension(ann: AnnotationElement): boolean {
    if (ann.type !== 'linear-dim') return false;
    const mode = ann.parameters?.autoMode;
    // A HAND-DRAWN dimension has no autoMode. It is the user's; Set Out must never touch it —
    // not refresh it, not delete it, not "correct" it.
    return typeof mode === 'string' && AUTO_DIM_MODES.has(mode);
}

/**
 * Carry the USER'S PRESENTATION across a regeneration.
 *
 * The reconcile re-derives WHAT a dimension measures (its references, and the model points
 * cached from them). It must NOT re-derive HOW it is shown: the `offset` the user dragged the
 * line to, and the `screenOverride` they nudged the label to, are theirs (L-287's split, and
 * the reason that split is worth having).
 *
 * `keepPresentation` is what the coordinator's rule looks like in code, and it is asserted by
 * the one guard that a delete-and-recreate implementation cannot pass.
 */
export function keepPresentation(
    fresh: AnnotationElement['geometry2D'],
    previous: AnnotationElement['geometry2D'] | undefined,
): AnnotationElement['geometry2D'] {
    if (!previous) return fresh;
    return {
        ...fresh,
        // The model owns modelPoints + measurementNormal (they ARE the measurement).
        // The user owns offset + screenOverride.
        offset: previous.offset,
        ...(previous.screenOverride ? { screenOverride: { ...previous.screenOverride } } : {}),
    };
}
