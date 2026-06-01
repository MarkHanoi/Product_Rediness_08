// C27 INS-α-3 (BIM 3.0 Inspect Model) — IsolationVisibilityIntent.
//
// The L1 pure function that turns an `InspectSelection` (from
// `InspectSelectionStore`, shipped in INS-α-2) into per-element
// `IsolationOverride` records keyed by element id. The scene-committer
// applies those overrides as mesh-material opacity changes in a later
// slice (INS-α-4); this slice ships only the intent + apply function.
//
// Per C27 §5.1 relationship → tier mapping:
//
//     SELECTED  → tier: 'FULL'    (opacity undefined — full visibility)
//     CHILD     → tier: 'FULL'    (children of selected are visible)
//     PARENT    → tier: 'DIMMED'  (opacity: 0.7 default)
//     SIBLING   → tier: 'DIMMED'  (opacity: 0.2 default)
//     UNRELATED → tier: 'DIMMED'  (opacity: 0.1 default) — or 'HIDDEN'
//                                  when opts.hideUnrelated is true.
//
// L1 PURITY: no I/O, no THREE, no DOM, no `@pryzm/*` imports other than
// `@pryzm/schemas` (L0).  No closures over external state — every call is
// deterministic in its inputs.
//
// References:
//   - C27-BIM3-INSPECT-MODEL.md §5 (Selection-driven viewport isolation)
//   - master plan Part V §11.2 (INS-α-3 intent slice)

import type {
    InspectSelection,
    IsolationOverride,
    IsolationTier,
    SpatialRelationship,
} from '@pryzm/schemas';

/**
 * Per-element location in the model tree, sufficient to compute the spatial
 * relationship to an `InspectSelection`. The caller provides this — the
 * intent doesn't traverse the runtime to resolve it. This keeps the
 * visibility package L1-pure (no L4 scene access from L1 code).
 */
export interface ElementLocation {
    readonly elementId: string;
    /**
     * The element's own kind in the model tree. Matches the 7-kind enum
     * from C27 §2 (project / building / level / apartment / room /
     * elementType / elementInstance).
     */
    readonly kind:
        | 'project'
        | 'building'
        | 'level'
        | 'apartment'
        | 'room'
        | 'elementType'
        | 'elementInstance';
    /**
     * Parent chain from root downwards (does NOT include this element).
     * Each entry is a `(kind, id)` pair. For the project root this is `[]`.
     */
    readonly parentChain: ReadonlyArray<{ kind: string; id: string }>;
}

/**
 * Options for `buildIsolationIntent`.  All fields are optional; defaults
 * match C27 §5.1.
 */
export interface IsolationIntentOptions {
    /**
     * Whether UNRELATED elements are HIDDEN (true) or DIMMED (false).
     * Default: false — keeps spatial context visible at very low opacity.
     */
    readonly hideUnrelated?: boolean;
    /** Override opacity for PARENT elements. Default: 0.7. */
    readonly opacityForParent?: number;
    /** Override opacity for SIBLING elements. Default: 0.2. */
    readonly opacityForSibling?: number;
    /** Override opacity for UNRELATED elements (ignored when hideUnrelated). Default: 0.1. */
    readonly opacityForUnrelated?: number;
}

/**
 * Pure resolver: given a selection + an element's location, compute the
 * element's spatial relationship to the selection. Exported for
 * unit-testability; `buildIsolationIntent` calls it internally.
 *
 * Resolution order (first match wins):
 *   1. SELECTED  — exact id match (elementId === selection.id).
 *   2. CHILD     — selection appears in the element's parent chain.
 *   3. PARENT    — element appears in the selection's breadcrumb.
 *   4. SIBLING   — element shares the IMMEDIATE parent with the selection.
 *   5. UNRELATED — otherwise.
 */
export function spatialRelationship(
    selection: InspectSelection,
    location: ElementLocation,
): SpatialRelationship {
    // SELECTED: exact id match.
    if (location.elementId === selection.id) return 'SELECTED';

    // CHILD: selection appears in this element's parent chain.
    const isChild = location.parentChain.some(a => a.id === selection.id);
    if (isChild) return 'CHILD';

    // PARENT: this element appears in the selection's breadcrumb.
    const isParent = selection.breadcrumb.some(a => a.id === location.elementId);
    if (isParent) return 'PARENT';

    // SIBLING: shares the IMMEDIATE parent with the selection.
    //   - Selection's immediate parent = last entry in selection.breadcrumb.
    //   - Element's immediate parent   = last entry in location.parentChain.
    const selParent = selection.breadcrumb[selection.breadcrumb.length - 1];
    const elemParent = location.parentChain[location.parentChain.length - 1];
    if (selParent && elemParent && selParent.id === elemParent.id) {
        return 'SIBLING';
    }

    return 'UNRELATED';
}

/**
 * Pure: maps a `SpatialRelationship` to an `IsolationTier` + optional
 * opacity, governed by opts (with C27 §5.1 defaults).
 */
function tierFor(
    rel: SpatialRelationship,
    opts: IsolationIntentOptions,
): { tier: IsolationTier; opacity?: number } {
    switch (rel) {
        case 'SELECTED':
            return { tier: 'FULL' };
        case 'CHILD':
            return { tier: 'FULL' };
        case 'PARENT':
            return { tier: 'DIMMED', opacity: opts.opacityForParent ?? 0.7 };
        case 'SIBLING':
            return { tier: 'DIMMED', opacity: opts.opacityForSibling ?? 0.2 };
        case 'UNRELATED':
            if (opts.hideUnrelated) return { tier: 'HIDDEN' };
            return { tier: 'DIMMED', opacity: opts.opacityForUnrelated ?? 0.1 };
    }
}

/**
 * Build the isolation overrides for an `InspectSelection` across a list
 * of elements.  Pure: no I/O, no DOM, no THREE.  Returns a
 * `Map<elementId, IsolationOverride>`.  Insertion order matches input
 * order, so callers can rely on stable iteration for deterministic
 * downstream behaviour (commit ordering, snapshot tests).
 *
 * The scene-committer applies these via mesh material opacity changes in
 * a later slice (INS-α-4 / Part V §11.3).
 */
export function buildIsolationIntent(
    selection: InspectSelection,
    elements: ReadonlyArray<ElementLocation>,
    opts: IsolationIntentOptions = {},
): ReadonlyMap<string, IsolationOverride> {
    const out = new Map<string, IsolationOverride>();
    for (const loc of elements) {
        const rel = spatialRelationship(selection, loc);
        const { tier, opacity } = tierFor(rel, opts);
        out.set(
            loc.elementId,
            opacity !== undefined
                ? { elementId: loc.elementId, tier, opacity }
                : { elementId: loc.elementId, tier },
        );
    }
    return out;
}

/**
 * Convenience: produces a pass-through intent — every element marked
 * `FULL` (no opacity).  Used when the inspect selection is `null`
 * (nothing inspected), so the scene-committer sees a no-op override set
 * rather than a missing map.
 */
export function buildPassThroughIntent(
    elements: ReadonlyArray<ElementLocation>,
): ReadonlyMap<string, IsolationOverride> {
    const out = new Map<string, IsolationOverride>();
    for (const loc of elements) {
        out.set(loc.elementId, { elementId: loc.elementId, tier: 'FULL' });
    }
    return out;
}
