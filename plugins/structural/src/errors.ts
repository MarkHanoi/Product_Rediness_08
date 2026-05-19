// Typed errors for the structural plugin (S26 / ADR-0026).

export class StructuralSystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StructuralSystemError';
  }
}
export class StructuralNotFoundError extends StructuralSystemError {
  constructor(public readonly structuralId: string) {
    super(`Structural element not found: ${structuralId}`);
    this.name = 'StructuralNotFoundError';
  }
}
export class StructuralSchemaError extends StructuralSystemError {
  constructor(public override readonly cause: unknown) {
    super(`Structural schema validation failed: ${String((cause as Error)?.message ?? cause)}`);
    this.name = 'StructuralSchemaError';
  }
}
export class StructuralDimensionsError extends StructuralSystemError {
  constructor(reason: string) {
    super(`Invalid structural dimensions: ${reason}`);
    this.name = 'StructuralDimensionsError';
  }
}
export function isStructuralSystemError(e: unknown): e is StructuralSystemError {
  return e instanceof StructuralSystemError;
}
