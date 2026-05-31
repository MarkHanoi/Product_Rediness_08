// G-class dimensional validators — shared types (G-1 area-max, G-2 width-max).
//
// First slice of the 10 G-classes described in
// `docs/03_PRYZM3/APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md`
// §G-class table. These validators sit ALONGSIDE (not on top of) the existing
// `dimensions/` envelope database — the G-class slice is a standalone,
// composable validator framework producing one row per failed check.
//
// PURE DATA + types only — ZERO runtime imports. The two implementations
// (`areaMax.ts` + `widthMax.ts`) operate on POJO room shapes so they unit-test
// without any package barrel.

/**
 * One G-class violation. The framework spec defines G-1 + G-2 today and reserves
 * G-3 … G-10 (aspect / furniture-fit / wall-usability / circulation / frontage /
 * hierarchy / kitchen-triangle / lighting) for follow-on slices — `classId` is
 * declared as `'G-1' | 'G-2' | string` so future slices extend the union without
 * a breaking change.
 *
 * `observed` and `maximum` are returned in the validator's native unit — m² for
 * G-1, m for G-2 — to keep the structure dimension-agnostic. Consumers (modal
 * D4.x, score axis) decide how to render.
 */
export interface DimensionalViolation {
    readonly classId: 'G-1' | 'G-2' | string;
    readonly roomId: string;
    readonly roomType: string;
    readonly severity: 'error' | 'warning';
    /** Actual measurement (m² for G-1, m for G-2). */
    readonly observed: number;
    /** The programmatic upper bound the room exceeded. */
    readonly maximum: number;
    readonly message: string;
}
