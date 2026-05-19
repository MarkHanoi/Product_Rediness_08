// Typed errors for the roof plugin (S11-T3).

export class RoofSystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoofSystemError';
  }
}

export class RoofNotFoundError extends RoofSystemError {
  constructor(public readonly roofId: string) {
    super(`Roof not found: ${roofId}`);
    this.name = 'RoofNotFoundError';
  }
}

export class RoofSchemaError extends RoofSystemError {
  constructor(public override readonly cause: unknown) {
    super(`Roof schema validation failed: ${String((cause as Error)?.message ?? cause)}`);
    this.name = 'RoofSchemaError';
  }
}

export class RoofTypeNotFoundError extends RoofSystemError {
  constructor(public readonly typeId: string) {
    super(`Roof type not found: ${typeId}`);
    this.name = 'RoofTypeNotFoundError';
  }
}

export class RoofPitchOutOfRangeError extends RoofSystemError {
  constructor(public readonly pitch: number) {
    super(`Roof pitch ${pitch.toFixed(4)} rad out of range [0, π/2)`);
    this.name = 'RoofPitchOutOfRangeError';
  }
}

export class RoofShapeMismatchError extends RoofSystemError {
  constructor(public readonly shape: string, public readonly pitch: number) {
    super(
      `Roof with shape="${shape}" cannot have pitch=${pitch.toFixed(4)} (flat roofs require pitch=0)`,
    );
    this.name = 'RoofShapeMismatchError';
  }
}

export function isRoofSystemError(e: unknown): e is RoofSystemError {
  return e instanceof RoofSystemError;
}
