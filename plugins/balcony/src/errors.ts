// Typed balcony errors — §FEAT-BALCONY-COMPOUND (L-5600).
// Mirrors `plugins/pool/src/errors.ts`: a typed DomainError per failure mode, so a
// handler never fails silently (C16 CA-3).

export class BalconySystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BalconySystemError';
  }
}

export class BalconyNotFoundError extends BalconySystemError {
  constructor(balconyId: string) {
    super(`balcony not found: ${balconyId}`);
    this.name = 'BalconyNotFoundError';
  }
}

/**
 * The named host wall is not in the wall store.
 *
 * ⚠ THIS IS A REFUSAL, NOT A DEGRADATION. `resolveFreeEdges` treats an ABSENT host
 * as free-standing and rails all round — the safe answer for a balcony that really
 * has no host. But a balcony that NAMES a host and cannot resolve it is a different
 * fact: it would be built with a railing across its own doorway. Silently taking the
 * free-standing branch there would be the "failure and empty are the same value"
 * defect ([[context-data-honesty-family]]), so the two are kept apart by this error.
 */
export class BalconyHostWallError extends BalconySystemError {
  constructor(message: string) {
    super(message);
    this.name = 'BalconyHostWallError';
  }
}

/** Degenerate / malformed outline. */
export class BalconyBoundaryError extends BalconySystemError {
  constructor(message: string) {
    super(message);
    this.name = 'BalconyBoundaryError';
  }
}

/**
 * The pre-minted railing ids do not match the free-edge count of the outline being
 * built — the stale-count failure a profile edit produces.
 */
export class BalconyMemberIdError extends BalconySystemError {
  constructor(message: string) {
    super(message);
    this.name = 'BalconyMemberIdError';
  }
}

export function isBalconySystemError(e: unknown): e is BalconySystemError {
  return e instanceof BalconySystemError;
}
