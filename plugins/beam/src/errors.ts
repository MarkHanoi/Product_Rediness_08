// Typed errors for the beam plugin (S12-T3).

export class BeamSystemError extends Error {
  constructor(message: string) { super(message); this.name = 'BeamSystemError'; }
}
export class BeamNotFoundError extends BeamSystemError {
  constructor(public readonly beamId: string) {
    super(`Beam not found: ${beamId}`);
    this.name = 'BeamNotFoundError';
  }
}
export class BeamSchemaError extends BeamSystemError {
  constructor(public override readonly cause: unknown) {
    super(`Beam schema validation failed: ${String((cause as Error)?.message ?? cause)}`);
    this.name = 'BeamSchemaError';
  }
}
export class BeamDimensionsError extends BeamSystemError {
  constructor(reason: string) {
    super(`Invalid beam dimensions: ${reason}`);
    this.name = 'BeamDimensionsError';
  }
}
export class BeamGeometryError extends BeamSystemError {
  constructor(reason: string) {
    super(`Invalid beam geometry: ${reason}`);
    this.name = 'BeamGeometryError';
  }
}
export function isBeamSystemError(e: unknown): e is BeamSystemError {
  return e instanceof BeamSystemError;
}
