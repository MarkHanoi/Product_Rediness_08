// Typed errors for the lighting plugin (S26 / ADR-0023).

export class LightingSystemError extends Error {
  constructor(message: string) { super(message); this.name = 'LightingSystemError'; }
}
export class LightingNotFoundError extends LightingSystemError {
  constructor(public readonly lightingId: string) {
    super(`Lighting fixture not found: ${lightingId}`);
    this.name = 'LightingNotFoundError';
  }
}
export class LightingSchemaError extends LightingSystemError {
  constructor(public override readonly cause: unknown) {
    super(`Lighting schema validation failed: ${String((cause as Error)?.message ?? cause)}`);
    this.name = 'LightingSchemaError';
  }
}
export function isLightingSystemError(e: unknown): e is LightingSystemError {
  return e instanceof LightingSystemError;
}
