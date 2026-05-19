// Ceiling plugin typed errors (S14-T8).

export class CeilingSystemError extends Error {
  constructor(message: string) { super(message); this.name = 'CeilingSystemError'; }
}
export class CeilingNotFoundError extends CeilingSystemError {
  constructor(id: string) { super(`Ceiling not found: ${id}`); this.name = 'CeilingNotFoundError'; }
}
export class CeilingSchemaError extends CeilingSystemError {
  constructor(public override readonly cause: unknown) {
    super(`Ceiling schema validation failed: ${(cause as Error)?.message ?? cause}`);
    this.name = 'CeilingSchemaError';
  }
}
export class CeilingGeometryError extends CeilingSystemError {
  constructor(reason: string) {
    super(`Ceiling geometry invariant violated: ${reason}`);
    this.name = 'CeilingGeometryError';
  }
}
export function isCeilingSystemError(err: unknown): err is CeilingSystemError {
  return err instanceof CeilingSystemError;
}
