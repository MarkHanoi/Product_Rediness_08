// Typed errors for the dimensions plugin (S29 / ADR-0028).

export class DimensionSystemError extends Error {
  constructor(message: string) { super(message); this.name = 'DimensionSystemError'; }
}

export class DimensionNotFoundError extends DimensionSystemError {
  constructor(public readonly dimensionId: string) {
    super(`Dimension not found: ${dimensionId}`);
    this.name = 'DimensionNotFoundError';
  }
}

export class DimensionSchemaError extends DimensionSystemError {
  constructor(public override readonly cause: unknown) {
    super(`Dimension schema validation failed: ${String((cause as Error)?.message ?? cause)}`);
    this.name = 'DimensionSchemaError';
  }
}

export function isDimensionSystemError(e: unknown): e is DimensionSystemError {
  return e instanceof DimensionSystemError;
}
