// Handrail plugin typed errors (S14-T4).

export class HandrailSystemError extends Error {
  constructor(message: string) { super(message); this.name = 'HandrailSystemError'; }
}
export class HandrailNotFoundError extends HandrailSystemError {
  constructor(id: string) { super(`Handrail not found: ${id}`); this.name = 'HandrailNotFoundError'; }
}
export class HandrailSchemaError extends HandrailSystemError {
  constructor(public override readonly cause: unknown) {
    super(`Handrail schema validation failed: ${(cause as Error)?.message ?? cause}`);
    this.name = 'HandrailSchemaError';
  }
}
export class HandrailGeometryError extends HandrailSystemError {
  constructor(reason: string) {
    super(`Handrail geometry invariant violated: ${reason}`);
    this.name = 'HandrailGeometryError';
  }
}
export function isHandrailSystemError(err: unknown): err is HandrailSystemError {
  return err instanceof HandrailSystemError;
}
