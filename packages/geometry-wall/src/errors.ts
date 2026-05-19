import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

/**
 * §WALL-DEEP-2026 E2 (RESOLVED 2026-04-24) — Wall-system typed error hierarchy.
 *
 * One base class so callers / global handlers / future toast layer can
 * `instanceof WallSystemError` test the entire family. Each subclass owns
 * a stable `name` for log filtering and dispatches a DOM CustomEvent
 * `bim-wall-system-error` so a future error-reporter UI can subscribe
 * without coupling to any internal module.
 *
 * SpatialAuthorityError and SnapBoundsError already exist in their original
 * homes (src/core/SpatialAuthority.ts and src/snapping/SpatialGrid.ts).
 * They are re-exported here so the entire family is reachable from one
 * import path:
 *
 *     import {
 *         WallSystemError,
 *         SpatialAuthorityError, SnapBoundsError,
 *         LevelResolveError, OpeningInvariantError,
 *         WallSchemaError, BaselineReversalError,
 *     } from './errors';
 *
 * Calling `WallSystemError.dispatch(err)` (called automatically by the
 * subclass constructors below) emits:
 *
 *     new CustomEvent('bim-wall-system-error', { // TODO(TASK-10)
 *         bubbles: true,
 *         detail: { name, message, error }
 *     })
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
        WallSystemError._safeDispatch(this);
    }

    /** Dispatch the DOM event without ever throwing from inside an error ctor. */
    private static _safeDispatch(err: Error): void {
        try {
            if (typeof document === 'undefined' || typeof CustomEvent !== 'function') return;
            _bus.emit('bim-wall-system-error', { name: err.name, message: err.message, error: err }); // F.events.18
        } catch {
            // Never throw from inside an error constructor.
        }
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
