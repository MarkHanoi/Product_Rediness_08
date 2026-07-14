// Typed pool errors — §FEAT-SWIMMING-POOL-ELEMENT (L-292).
// Mirrors `plugins/slab/src/errors.ts`: a typed DomainError per failure mode, so a
// handler never fails silently (CA-3).

export class PoolSystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PoolSystemError';
  }
}

export class PoolNotFoundError extends PoolSystemError {
  constructor(poolId: string) {
    super(`pool not found: ${poolId}`);
    this.name = 'PoolNotFoundError';
  }
}

/** The pool has no host slab to cut into — a pool is defined ON a slab (the ticket). */
export class PoolHostSlabError extends PoolSystemError {
  constructor(message: string) {
    super(message);
    this.name = 'PoolHostSlabError';
  }
}

/** Degenerate / malformed outline. */
export class PoolBoundaryError extends PoolSystemError {
  constructor(message: string) {
    super(message);
    this.name = 'PoolBoundaryError';
  }
}

export function isPoolSystemError(e: unknown): e is PoolSystemError {
  return e instanceof PoolSystemError;
}
