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
 *   (used by any ad-hoc callers).
 *
 * §L-1051 FIX (2026-08-19, C87 §11 #5 / CW-B-3): `migrateToGridSystem()` USED TO
 *   mint `crypto.randomUUID()` per line, and it is reached from ELEVEN `??`
 *   fallback sites (C87 said nine; `CurtainGridEditor.ts:52` and
 *   `CurtainPanelEditor.ts:54` were missed). Every one of them therefore produced
 *   a DIFFERENT grid-line id set for the same wall whenever `gridSystem` was
 *   absent — which is the default for every wall the user has never added a line
 *   to. That is a [C73 §1.1] violation verbatim ("geometry is a pure function of
 *   authoritative model state; given the same model, a regeneration produces the
 *   same geometry"), and its user-visible face was that the property panel's
 *   grid-line × button did NOTHING: `CurtainGridEditor.resolveGrid()` migrated to
 *   get the ids it drew, `RemoveCurtainGridLine` migrated AGAIN to get the ids it
 *   searched, the two sets were disjoint, `removeGridLine()` matched nothing, and
 *   the verb reported success. Ids are now derived from `ownerId` + axis + index
 *   via {@link derivedGridLineId}. Ids already PERSISTED in a project file are
 *   unaffected — this path only runs when there is no stored grid to read.
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
    gridYSpacing: number,
    ownerId?: string
): CurtainGridSystem {
    const numU = _bayCount(length, gridXSpacing, 'u', ownerId);
    const numV = _bayCount(height, gridYSpacing, 'v', ownerId);

    const uLines: CurtainGridLine[] = [];
    for (let i = 0; i <= numU; i++) {
        const t = i / numU;
        uLines.push({ id: derivedGridLineId(ownerId, 'u', t), t });
    }

    const vLines: CurtainGridLine[] = [];
    for (let j = 0; j <= numV; j++) {
        const t = j / numV;
        vLines.push({ id: derivedGridLineId(ownerId, 'v', t), t });
    }

    return { uLines, vLines };
}

/**
 * §L-1051 — the deterministic id `migrateToGridSystem` assigns to the line at
 * `index` on `axis` of the wall `ownerId`.
 *
 * Exported so a caller that needs to name a migrated line (a test, a future
 * grid-drag tool) derives it rather than transcribing the format — C84 EI-9,
 * one answer per question.
 *
 * `t` is the line's normalised position, NOT its index — see §L-1058 in the body.
 *
 * `ownerId` is optional because three of the eleven `??` call sites are pure
 * read paths (`AIReadModel.ts:334,:402`) that only ever count cells. When it is
 * omitted the ids are unique WITHIN the returned grid but NOT across walls, and
 * that is the honest weaker guarantee — the ids of a migration nobody can
 * address are not addressable. Every call site that can reach a mutation passes
 * the wall id.
 */
export function derivedGridLineId(ownerId: string | undefined, axis: 'u' | 'v', t: number): string {
    // §L-1058 — THE ID NAMES A POSITION, NOT AN ORDINAL, AND THAT CORRECTION MATTERS.
    //
    // This was `${ownerId}:${axis}:${index}` when §L-1051 first made these ids
    // deterministic. Deterministic they were — and AMBIGUOUS, which is worse than
    // unstable and is not what C87 CW-P-G claimed. `cw-1:u:1` named u-line #1 of a
    // 5-line grid AND u-line #1 of a 9-line grid, which sit at t=0.25 and t=0.125:
    // DIFFERENT PHYSICAL LINES CARRYING THE SAME ID.
    //
    // That is fatal to the C87 CW-P sparse-override design, whose whole premise is
    // that `(uLineId, vLineId)` names a CELL. With ordinal ids, re-spacing a wall
    // from bayWidth 1.5 to 0.75 silently re-targets every override onto a
    // physically different cell — precisely the failure CW-P-B exists to prevent:
    // "a door quietly moving to the wrong cell is worse than losing it." The
    // CW-P-D refusal could never fire, because the lookup always succeeded.
    //
    // Keying on `t` fixes it at the root: `t` IS the line's position, so two lines
    // share an id exactly when they are the same line. Still a pure function of
    // model state (C73 §1.1), still stable under regeneration with the same
    // inputs, and now genuinely different when the grid is genuinely different.
    // Six decimals is far below the 0.001 tolerance this module compares t-values
    // with elsewhere (`insertGridLine`, `validateGridSystem`), so two ids collide
    // only for lines this module already considers identical.
    return `${ownerId ?? 'cw'}:${axis}:${t.toFixed(6)}`;
}

/**
 * §L-1052 — bays along one axis, refusing to return an INVALID grid.
 *
 * `Math.max(1, Math.floor(length / spacing))` is NaN whenever `spacing` is
 * `undefined` or `0`, and `for (i = 0; i <= NaN; i++)` never executes — so the
 * pre-fix function returned `{uLines: [], vLines: []}`, which violates this
 * module's own stated invariant ("Must always have at least 2 uLines and 2
 * vLines", :63-65) and which `validateGridSystem` would reject. It was written
 * to the store anyway, and `CurtainWallBuilder` reads a present-but-empty
 * `gridSystem` as truthy and builds ZERO cells.
 *
 * A silently-invalid grid is worse than a loud fallback (C84 §1, quoting
 * `WallRake.ts:50-62`). So an unusable spacing is REPORTED and the axis falls
 * back to a single bay — the minimum grid that is valid — rather than to none.
 */
function _bayCount(extent: number, spacing: number, axis: 'u' | 'v', ownerId?: string): number {
    if (!Number.isFinite(extent) || extent <= 0 || !Number.isFinite(spacing) || spacing <= 0) {
        console.error(
            `[CurtainGridSystem] §L-1052 migrateToGridSystem(${axis}-axis) got an unusable ` +
            `extent/spacing pair (extent=${String(extent)}, spacing=${String(spacing)})` +
            (ownerId ? ` for curtain wall '${ownerId}'` : '') +
            '. Falling back to ONE bay. This used to produce an EMPTY line array — an invalid ' +
            'grid by this module\'s own >=2-lines invariant (:63-65) — which the builder turns ' +
            'into zero cells. If you are a caller reading a DTO record, the L0 spacing fields ' +
            'are `bayWidth` / `bayHeight`, NOT `gridXSpacing` / `gridYSpacing`.',
        );
        return 1;
    }
    return Math.max(1, Math.floor(extent / spacing));
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
