// Typed errors for the plumbing plugin (S26 / ADR-0026).

export class PlumbingSystemError extends Error {
  constructor(message: string) { super(message); this.name = 'PlumbingSystemError'; }
}
export class PlumbingNotFoundError extends PlumbingSystemError {
  constructor(public readonly plumbingId: string) {
    super(`Plumbing element not found: ${plumbingId}`);
    this.name = 'PlumbingNotFoundError';
  }
}
export class PlumbingSchemaError extends PlumbingSystemError {
  constructor(public override readonly cause: unknown) {
    super(`Plumbing schema validation failed: ${String((cause as Error)?.message ?? cause)}`);
    this.name = 'PlumbingSchemaError';
  }
}
export function isPlumbingSystemError(e: unknown): e is PlumbingSystemError {
  return e instanceof PlumbingSystemError;
}
