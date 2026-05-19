/**
 * @file src/tools/operations/ElementCapabilities.ts
 *
 * Single source of truth for which contextual editing operations are available
 * for each BIM element type.
 *
 * Consumed by:
 *   - src/ui/SelectionOverlay.ts    — show/hide/disable toolbar buttons
 *   - Each OperationTool.canExecute — guard execution against wrong element type
 *
 * CONTRACT §01 §2.1 — This module is read-only. It never mutates any store.
 * CONTRACT §04 §2   — Class A pattern; pure lookup, no side effects.
 *
 * Implementation plan reference: Phase A, Step 1
 * docs/SELECTION-TOOLBAR-TOOLS-IMPLEMENTATION-PLAN.md §2
 */

export type OperationId =
    | 'join'
    | 'cut'
    | 'mirror'
    | 'copy'
    | 'move'
    | 'align'
    | 'scale'
    | 'offset'
    | 'reference-edit';

// ── Capability groups ────────────────────────────────────────────────────────

/** Full linear element capability set — walls, curtain walls, beams, etc. */
const LINEAR_OPS = new Set<OperationId>([
    'join', 'cut', 'mirror', 'copy', 'move', 'align', 'scale', 'offset', 'reference-edit',
]);

/** Area/surface elements — slabs, floors, ceilings, roofs. */
const AREA_OPS = new Set<OperationId>([
    'mirror', 'copy', 'move', 'align', 'scale',
]);

/** Point/hosted elements — columns, doors, windows, furniture. */
const POINT_OPS = new Set<OperationId>([
    'mirror', 'copy', 'move',
]);

/** Elements that can be offset/referenced but not joined/cut (railings, stairs). */
const RAIL_OPS = new Set<OperationId>([
    'mirror', 'copy', 'move', 'offset', 'reference-edit',
]);

// ── Per-type capability table ────────────────────────────────────────────────

const CAPABILITIES = new Map<string, Set<OperationId>>([
    // Linear — full set
    ['wall',            LINEAR_OPS],
    ['curtain-wall',    LINEAR_OPS],
    ['curtainwall',     LINEAR_OPS],   // normalised alias
    ['beam',            LINEAR_OPS],

    // Area/slab — join/cut/offset/ref allowed for poly-boundary slabs
    ['slab',            LINEAR_OPS],
    ['floor',           LINEAR_OPS],
    ['ceiling',         LINEAR_OPS],

    // Rail/stair — offset and reference-edit but no join/cut
    ['railing',         RAIL_OPS],
    ['stair',           RAIL_OPS],
    ['stairs',          RAIL_OPS],

    // Point/structural — mirror, copy, move, scale only
    ['column',          new Set<OperationId>(['mirror', 'copy', 'move', 'align', 'scale'])],

    // Area — no join/cut/offset
    ['roof',            AREA_OPS],

    // Hosted — point operations only (no scale; they are resized via parameters)
    ['door',            POINT_OPS],
    ['window',          POINT_OPS],
    ['furniture',       new Set<OperationId>(['mirror', 'copy', 'move', 'align'])],

    // Plumbing — point
    ['plumbing',        POINT_OPS],

    // Handrail — rail set
    ['handrail',        RAIL_OPS],

    // PDF / image underlay — move (drag on plan view) + reference scale
    ['floor_plan_underlay', new Set<OperationId>(['move', 'scale'])],
]);

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true when the given element type supports the given operation.
 *
 * @param elementType  Raw string from userData.elementType (case-insensitive).
 * @param op           Operation identifier.
 */
export function canDo(elementType: string, op: OperationId): boolean {
    const key = elementType.toLowerCase().trim();
    return CAPABILITIES.get(key)?.has(op) ?? false;
}

/**
 * Returns the full set of operations available for an element type.
 * Returns an empty array for unknown types.
 */
export function availableOps(elementType: string): OperationId[] {
    const key = elementType.toLowerCase().trim();
    const set  = CAPABILITIES.get(key);
    return set ? [...set] : [];
}

/**
 * Returns true if this element type has any linear-specific operations
 * (join, cut, offset, reference-edit) — used to decide whether to show
 * the linear-ops divider group in the toolbar.
 */
export function hasLinearOps(elementType: string): boolean {
    const key = elementType.toLowerCase().trim();
    const set  = CAPABILITIES.get(key);
    if (!set) return false;
    return set.has('join') || set.has('cut') || set.has('offset') || set.has('reference-edit');
}
