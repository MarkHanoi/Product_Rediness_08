// Stair plugin typed errors (S14-T1).
//
// Mirrors `plugins/slab/src/errors.ts`.  Distinct subclasses so callers
// can `instanceof`-discriminate; all share a `StairSystemError` base
// for catch-all handling.

export class StairSystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StairSystemError';
  }
}

export class StairNotFoundError extends StairSystemError {
  constructor(id: string) {
    super(`Stair not found: ${id}`);
    this.name = 'StairNotFoundError';
  }
}

export class StairSchemaError extends StairSystemError {
  constructor(public override readonly cause: unknown) {
    super(`Stair schema validation failed: ${(cause as Error)?.message ?? cause}`);
    this.name = 'StairSchemaError';
  }
}

export class StairGeometryError extends StairSystemError {
  constructor(reason: string) {
    super(`Stair geometry invariant violated: ${reason}`);
    this.name = 'StairGeometryError';
  }
}

export class StairRiserCountError extends StairSystemError {
  constructor(n: number) {
    super(`Stair must have at least 2 risers (got ${n}).`);
    this.name = 'StairRiserCountError';
  }
}

export function isStairSystemError(err: unknown): err is StairSystemError {
  return err instanceof StairSystemError;
}
