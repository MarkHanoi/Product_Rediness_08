// Typed errors for the slab plugin (S12-T2).
//
// Mirrors `plugins/roof/src/errors.ts`.  A thin typed hierarchy rooted
// at `SlabSystemError` so callers can pattern-match without parsing
// message strings.

export class SlabSystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlabSystemError';
  }
}

export class SlabNotFoundError extends SlabSystemError {
  constructor(public readonly slabId: string) {
    super(`Slab not found: ${slabId}`);
    this.name = 'SlabNotFoundError';
  }
}

export class SlabSchemaError extends SlabSystemError {
  constructor(public override readonly cause: unknown) {
    super(`Slab schema validation failed: ${String((cause as Error)?.message ?? cause)}`);
    this.name = 'SlabSchemaError';
  }
}

export class SlabBoundaryError extends SlabSystemError {
  constructor(public readonly reason: string) {
    super(`Invalid slab boundary: ${reason}`);
    this.name = 'SlabBoundaryError';
  }
}

export class SlabHoleNotFoundError extends SlabSystemError {
  constructor(public readonly slabId: string, public readonly holeIndex: number) {
    super(`Slab ${slabId} has no hole at index ${holeIndex}`);
    this.name = 'SlabHoleNotFoundError';
  }
}

export class SlabThicknessError extends SlabSystemError {
  constructor(public readonly thickness: number) {
    super(`Slab thickness must be > 0; got ${thickness}`);
    this.name = 'SlabThicknessError';
  }
}

export function isSlabSystemError(e: unknown): e is SlabSystemError {
  return e instanceof SlabSystemError;
}
