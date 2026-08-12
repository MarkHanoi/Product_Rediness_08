/**
 * §WALL-DEEP-2026 E2 (RESOLVED 2026-04-24) — Wall-system typed error hierarchy.
 *
 * One base class so callers / global handlers / future toast layer can
 * `instanceof WallSystemError` test the entire family. Each subclass owns
 * a stable `name` for log filtering.
 *
 * REMOVED 2026-08-12 (ADR-0323 rule 2, BIM30 R0 — see
 * docs/04-reference/BIM30-DISPOSITION-DOCKET.md): the constructors used to
 * dispatch a `bim-wall-system-error` CustomEvent "so a future error-reporter
 * UI can subscribe". No listener ever existed anywhere in the repo and no
 * invariant requires the event — the typed throw is the contract carrier.
 * The dispatch and its event-bus catalog entry were deleted together. If an
 * error-reporter UI ever lands, it subscribes to a NEW, consumed event —
 * per rule 2, an event with no consumer is dead architecture, not wiring.
 *
 * SpatialAuthorityError and SnapBoundsError already exist in their original
 * homes (src/core/SpatialAuthority.ts and src/snapping/SpatialGrid.ts).
 * They are re-exported here so the entire family is reachable from one
 * import path (usage below):
 *
 *     import {
 *         WallSystemError,
 *         SpatialAuthorityError, SnapBoundsError,
 *         LevelResolveError, OpeningInvariantError,
 *         WallSchemaError, BaselineReversalError,
 *     } from './errors';
 *
 * Existing throw sites that already use `SpatialAuthorityError` /
 * `SnapBoundsError` continue to function unchanged — those classes were
 * not renamed and their `name` fields are unchanged. We retroactively
 * mark them as members of the WallSystemError family by exporting a type
 * alias and a runtime helper `isWallSystemError(err)` that recognises
 * either the new base class OR the legacy `name` strings.
 */

export class WallSystemError extends Error {
    constructor(message: string, name: string = 'WallSystemError') {
        super(message);
        this.name = name;
    }
}

/**
 * Wall-store level lookup failed (or BimManager not initialised). Distinct
 * from SpatialAuthorityError, which is thrown from the spatial-authority
 * service itself for missing world transforms.
 */
export class LevelResolveError extends WallSystemError {
    constructor(message: string) {
        super(message, 'LevelResolveError');
    }
}

/**
 * Wall opening contract violation — opening positioned outside the wall,
 * overlapping siblings, missing wall-id, etc. Replaces ad-hoc
 * `throw new Error("Wall ... not found when restoring opening")` style
 * messages so callers can branch on the typed class.
 */
export class OpeningInvariantError extends WallSystemError {
    constructor(message: string) {
        super(message, 'OpeningInvariantError');
    }
}

/**
 * Wall schema validation failed (Zod). Wraps the underlying ZodError so
 * callers / UI can both display a friendly message and inspect the
 * structured issues if needed.
 */
export class WallSchemaError extends WallSystemError {
    public readonly cause?: unknown;
    constructor(message: string, cause?: unknown) {
        super(message, 'WallSchemaError');
        this.cause = cause;
    }
}

/**
 * §WALL-DEEP-2026 B2 — baseline-reversal guard fired. Trying to swap a
 * wall's start/end while the wall hosts openings would silently destroy
 * the openings' parametric positions; the store rejects the update with
 * this typed error unless the caller passes the `_allowBaseLineReversal`
 * escape hatch.
 */
export class BaselineReversalError extends WallSystemError {
    constructor(message: string) {
        super(message, 'BaselineReversalError');
    }
}

// ── Re-export pre-existing typed errors so all wall-system errors are
// reachable from a single import path. We do NOT re-derive them from
// WallSystemError to avoid disturbing the upstream stack traces /
// `instanceof` chains the rest of the app already relies on.
export { SpatialAuthorityError } from '@pryzm/core-app-model';
export { SnapBoundsError } from '@pryzm/snapping';

/**
 * Runtime predicate. Recognises both the new WallSystemError family AND
 * the two pre-existing classes (by name) so legacy throws still classify
 * as "wall-system errors" without a code change.
 */
export function isWallSystemError(err: unknown): boolean {
    if (err instanceof WallSystemError) return true;
    if (err instanceof Error) {
        return err.name === 'SpatialAuthorityError'
            || err.name === 'SnapBoundsError';
    }
    return false;
}
