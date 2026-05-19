// Typed errors for the grid plugin (S12-T4).

export class GridSystemError extends Error {
  constructor(message: string) { super(message); this.name = 'GridSystemError'; }
}
export class GridNotFoundError extends GridSystemError {
  constructor(public readonly gridId: string) {
    super(`Grid not found: ${gridId}`);
    this.name = 'GridNotFoundError';
  }
}
export class GridSchemaError extends GridSystemError {
  constructor(public override readonly cause: unknown) {
    super(`Grid schema validation failed: ${String((cause as Error)?.message ?? cause)}`);
    this.name = 'GridSchemaError';
  }
}
export class GridConfigError extends GridSystemError {
  constructor(reason: string) {
    super(`Invalid grid configuration: ${reason}`);
    this.name = 'GridConfigError';
  }
}
export function isGridSystemError(e: unknown): e is GridSystemError {
  return e instanceof GridSystemError;
}
