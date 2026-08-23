// Typed boundary-line errors — §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7910).
// Mirrors `plugins/pool/src/errors.ts`: a typed DomainError per failure mode, so a
// handler never fails silently (C16 CA-3).

export class BoundaryLineSystemError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BoundaryLineSystemError';
    }
}

export class BoundaryLineNotFoundError extends BoundaryLineSystemError {
    constructor(id: string) {
        super(`boundary line not found: ${id}`);
        this.name = 'BoundaryLineNotFoundError';
    }
}

/** Degenerate / malformed polyline — every refine on the L0 schema lands here. */
export class BoundaryLineGeometryError extends BoundaryLineSystemError {
    constructor(message: string) {
        super(message);
        this.name = 'BoundaryLineGeometryError';
    }
}

/**
 * An attachment names an element the line cannot carry, or an anchor it cannot
 * evaluate. ⭐ Distinct from `BoundaryLineGeometryError` because the FIX is different:
 * a geometry error means the line is wrong, an attachment error means the RELATIONSHIP
 * is wrong, and telling the user "the line is malformed" when their door simply cannot
 * be hosted would send them to fix the wrong thing.
 */
export class BoundaryLineAttachmentError extends BoundaryLineSystemError {
    constructor(message: string) {
        super(message);
        this.name = 'BoundaryLineAttachmentError';
    }
}

export function isBoundaryLineSystemError(e: unknown): e is BoundaryLineSystemError {
    return e instanceof BoundaryLineSystemError;
}
