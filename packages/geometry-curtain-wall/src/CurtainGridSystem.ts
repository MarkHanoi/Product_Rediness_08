/**
 * CurtainGridSystem
 *
 * Implements the parametric U/V grid topology for a curtain wall façade.
 *
 * ## Architecture Notes (§03 Semantic Model Contract)
 *
 * A curtain wall's façade is divided by two ordered sets of parametric lines:
 *   - U-lines: divisions along the wall's length (horizontal axis, t ∈ [0, 1])
 *   - V-lines: divisions along the wall's height (vertical axis, t ∈ [0, 1])
 *
 * Each CurtainGridLine has a normalized t-value:
 *   - t=0.0 → start of wall (left edge / bottom edge)
 *   - t=1.0 → end of wall (right edge / top edge)
 *   - t=0.5 → midpoint
 *
 * Together, U-lines and V-lines form a planar grid. Their intersections define
 * rectangular cells, each of which holds one CurtainPanel.
 *
 * ## Backward Compatibility
 *
 * Existing curtain walls use scalar gridXSpacing / gridYSpacing.
 * `migrateToGridSystem()` converts these into uniform t-values so the new
 * cell-based builder receives the same geometry the old builder would have produced.
 *
 * ## Phase 1 Scope
 * - Non-uniform grid spacing (arbitrary t-values per line)
 * - Serializable as part of CurtainWallData
 * - Migration from legacy scalar spacing
 * - Grid line insertion and removal
 *
 * Phase 2 will add: moveable grid lines (via drag tool), partial U-lines,
 * angled grids. Phase 3: curved surfaces.
 *
 * ## Modifications
 *
 * §MI-04 FIX (2026-03-31): `uLines` and `vLines` are now `readonly CurtainGridLine[]`.
 *   Callers that previously mutated these arrays directly would corrupt shared state.
 *   All insertion/removal is done via `insertGridLine()` / `removeGridLine()` which
 *   return new arrays, so this change has zero runtime impact.
 *
 * §MI-05 FIX (2026-03-31): `insertGridLine()` now accepts an optional `preGeneratedId`
 *   parameter. `AddCurtainGridLineCommand` pre-generates the new line's ID in its
 *   constructor and passes it here, making the ID stable across redo cycles.
 *   When no preGeneratedId is supplied the function still generates one internally
 *   (used by `migrateToGridSystem` and any other ad-hoc callers).
 */

export interface CurtainGridLine {
    /** Stable unique identifier — required for undo/redo symmetry. */
    id: string;
    /**
     * Normalized position along the axis (0..1).
     * U-axis: 0 = wall start, 1 = wall end.
     * V-axis: 0 = base, 1 = top.
     */
    t: number;
}

/**
 * The complete grid topology stored on a CurtainWallData.
 *
 * uLines includes the boundary lines at t=0 and t=1.
 * vLines includes the boundary lines at t=0 and t=1.
 * Must always have at least 2 uLines and 2 vLines (the boundaries) to be valid.
 *
 * §MI-04: Both arrays are `readonly` — mutations must go through insertGridLine /
 * removeGridLine which return new arrays (immutable-update pattern).
 */
export interface CurtainGridSystem {
    readonly uLines: readonly CurtainGridLine[];
    readonly vLines: readonly CurtainGridLine[];
}

/**
 * Migrate legacy scalar spacings into a parametric CurtainGridSystem.
 *
 * Produces uniform t-values matching the cells the old builder would have
 * generated: N = floor(length / spacing) panels → N+1 grid lines at 0, 1/N, 2/N, …, 1.
 *
 * Always includes boundary lines at t=0 and t=1.
 */
export function migrateToGridSystem(
    length: number,
    height: number,
    gridXSpacing: number,
    gridYSpacing: number
): CurtainGridSystem {
    const numU = Math.max(1, Math.floor(length / gridXSpacing));
    const numV = Math.max(1, Math.floor(height / gridYSpacing));

    const uLines: CurtainGridLine[] = [];
    for (let i = 0; i <= numU; i++) {
        uLines.push({ id: crypto.randomUUID(), t: i / numU });
    }

    const vLines: CurtainGridLine[] = [];
    for (let j = 0; j <= numV; j++) {
        vLines.push({ id: crypto.randomUUID(), t: j / numV });
    }

    return { uLines, vLines };
}

/**
 * Insert a new grid line into a sorted list of grid lines.
 * Returns a new array (immutable operation).
 * Clamps t to [0, 1] and skips insertion if t already exists (within tolerance).
 *
 * §MI-05 FIX: `preGeneratedId` is an optional parameter. When provided (by
 * `AddCurtainGridLineCommand`, which pre-generates the ID in its constructor),
 * the same ID is used on every execute() / redo() call, making redo-stable.
 * When omitted (migration, ad-hoc calls) a new UUID is generated as before.
 */
export function insertGridLine(
    lines: readonly CurtainGridLine[],
    t: number,
    tolerance = 0.001,
    preGeneratedId?: string
): CurtainGridLine[] {
    const clamped = Math.max(0, Math.min(1, t));
    const exists = lines.some(l => Math.abs(l.t - clamped) < tolerance);
    if (exists) return [...lines];

    const newLine: CurtainGridLine = {
        id: preGeneratedId ?? crypto.randomUUID(),
        t: clamped
    };
    return [...lines, newLine].sort((a, b) => a.t - b.t);
}

/**
 * Remove a grid line by ID.
 * Returns a new array (immutable operation).
 * Never removes boundary lines at t=0 or t=1.
 */
export function removeGridLine(
    lines: readonly CurtainGridLine[],
    id: string,
    boundaryTolerance = 0.0001
): CurtainGridLine[] {
    return lines.filter(l => {
        if (l.id !== id) return true;
        // Protect boundary lines
        if (l.t < boundaryTolerance || l.t > 1 - boundaryTolerance) {
            console.warn(`[CurtainGridSystem] Attempted to remove boundary grid line "${id}" — skipped.`);
            return true;
        }
        return false;
    });
}

/**
 * Validate that a CurtainGridSystem is well-formed:
 * - At least 2 uLines and 2 vLines
 * - Boundary lines at t≈0 and t≈1 on both axes
 * - t-values sorted ascending
 */
export function validateGridSystem(grid: CurtainGridSystem): string[] {
    const errors: string[] = [];
    const check = (lines: readonly CurtainGridLine[], axis: string) => {
        if (lines.length < 2) {
            errors.push(`[CurtainGridSystem] ${axis}: need at least 2 lines, got ${lines.length}`);
        }
        const sorted = [...lines].sort((a, b) => a.t - b.t);
        if (sorted[0].t > 0.001) errors.push(`[CurtainGridSystem] ${axis}: no boundary at t=0`);
        if (sorted[sorted.length - 1].t < 0.999) errors.push(`[CurtainGridSystem] ${axis}: no boundary at t=1`);
    };
    check(grid.uLines, 'uLines');
    check(grid.vLines, 'vLines');
    return errors;
}
