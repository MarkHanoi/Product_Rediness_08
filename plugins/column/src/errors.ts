// Typed errors for the column plugin (S12-T3).

export class ColumnSystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ColumnSystemError';
  }
}
export class ColumnNotFoundError extends ColumnSystemError {
  constructor(public readonly columnId: string) {
    super(`Column not found: ${columnId}`);
    this.name = 'ColumnNotFoundError';
  }
}
export class ColumnSchemaError extends ColumnSystemError {
  constructor(public override readonly cause: unknown) {
    super(`Column schema validation failed: ${String((cause as Error)?.message ?? cause)}`);
    this.name = 'ColumnSchemaError';
  }
}
export class ColumnDimensionsError extends ColumnSystemError {
  constructor(reason: string) {
    super(`Invalid column dimensions: ${reason}`);
    this.name = 'ColumnDimensionsError';
  }
}
export function isColumnSystemError(e: unknown): e is ColumnSystemError {
  return e instanceof ColumnSystemError;
}
