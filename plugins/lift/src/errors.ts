// Typed lift errors — §FEAT-LIFT-COMPOUND-SYSTEM (L-5700).
// Mirrors `plugins/pool/src/errors.ts`: a typed DomainError per failure mode, so a
// handler never fails silently (CA-3).

export class LiftSystemError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LiftSystemError';
    }
}

export class LiftNotFoundError extends LiftSystemError {
    constructor(liftId: string) {
        super(`lift not found: ${liftId}`);
        this.name = 'LiftNotFoundError';
    }
}

/**
 * A wall-hosted lift names a host wall that is not in the wall store. Distinct from
 * a validation failure: this is a DANGLING REFERENCE, and it is worth its own type
 * because the fix differs (re-pick the wall, vs. correct a number).
 */
export class LiftHostWallError extends LiftSystemError {
    constructor(message: string) {
        super(message);
        this.name = 'LiftHostWallError';
    }
}

/**
 * The served-level set is empty, unknown, or contradicts the project's levels.
 *
 * ⭐ This is the founder's "asked how many stories that lift should cover based on
 * the existing levels" turned into a REFUSAL. A lift that silently serves the wrong
 * storeys is worse than one that refuses to be placed, because the landing doors it
 * creates look right on every plan except the ones that matter.
 */
export class LiftServedLevelsError extends LiftSystemError {
    constructor(message: string) {
        super(message);
        this.name = 'LiftServedLevelsError';
    }
}

/** Degenerate / malformed geometry or dimensions. */
export class LiftGeometryError extends LiftSystemError {
    constructor(message: string) {
        super(message);
        this.name = 'LiftGeometryError';
    }
}

export function isLiftSystemError(e: unknown): e is LiftSystemError {
    return e instanceof LiftSystemError;
}
